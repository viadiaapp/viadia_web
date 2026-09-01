import { Router } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../firebaseAdmin";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { sweepTripJoinRequestsForTrip } from "../services/joinRequestService";
import { deleteObjectsWithPrefix } from "../services/r2";

const router = Router();

// Mirrors src/lib/db.ts's local ROLE_PERMISSIONS constant. This table never changes, so (like the
// client) the server keeps a local copy instead of reading role_master on every request.
type TripRole = "owner" | "moderator" | "companion";
const ROLE_PERMISSIONS: Record<TripRole, { allowModify: boolean; approveChanges: boolean; deleteTrip: boolean }> = {
  owner: { allowModify: true, approveChanges: true, deleteTrip: true },
  moderator: { allowModify: true, approveChanges: true, deleteTrip: false },
  companion: { allowModify: true, approveChanges: false, deleteTrip: false },
};

// trip_owner_user_master/{tripCode}. users is keyed by traveler display name -> [role, userCode, email].
type TripOwnerUserMaster = {
  tripCode: string;
  owner: string; // userCode
  allowModification: boolean;
  users?: { [travelerName: string]: [TripRole, string, string] };
};

function normalizeCode(code: string): string {
  return (code || "").toUpperCase().trim();
}

async function getMaster(code: string): Promise<TripOwnerUserMaster | null> {
  const snap = await adminDb.collection("trip_owner_user_master").doc(code).get();
  return snap.exists ? (snap.data() as TripOwnerUserMaster) : null;
}

// Resolves the calling Firebase user's app userCode from users/{uid}.
async function resolveUserCode(uid?: string): Promise<string | null> {
  if (!uid) return null;
  const snap = await adminDb.collection("users").doc(uid).get();
  return snap.exists ? (snap.data()!.userCode as string) || null : null;
}

// Determines the caller's role on a trip: owner (matches master.owner), moderator/companion
// (matches a userCode inside master.users), or null (no association at all).
function resolveRole(master: TripOwnerUserMaster | null, userCode: string | null): TripRole | null {
  if (!master || !userCode) return null;
  if (master.owner === userCode) return "owner";
  const users = master.users || {};
  for (const tuple of Object.values(users)) {
    if (tuple[1] === userCode) return tuple[0];
  }
  return null;
}

// Mirrors the client's isTripReadOnly(): owner can always write; a joined companion/moderator can
// write only if BOTH the trip's allowModification flag AND their role's allowModify permission are true.
function canWriteTrip(master: TripOwnerUserMaster | null, role: TripRole | null): boolean {
  if (!master) return true; // no master yet -> anyone may create it
  if (role === "owner") return true;
  if (!role) return false;
  return !!master.allowModification && ROLE_PERMISSIONS[role].allowModify;
}

function canDeleteTrip(role: TripRole | null): boolean {
  return !!role && ROLE_PERMISSIONS[role].deleteTrip;
}

router.get(
  "/owned",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userCode = await resolveUserCode(req.uid);
    if (!userCode) return res.json([]);
    const snap = await adminDb.collection("trip_owner_user_master").where("owner", "==", userCode).get();
    const codes = snap.docs.map((d) => d.id);
    if (codes.length === 0) return res.json([]);
    const tripSnaps = await Promise.all(codes.map((c) => adminDb.collection("trips").doc(c).get()));
    res.json(tripSnaps.filter((s) => s.exists).map((s) => s.data()));
  })
);

router.get(
  "/owned/masters",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userCode = await resolveUserCode(req.uid);
    if (!userCode) return res.json([]);
    const snap = await adminDb.collection("trip_owner_user_master").where("owner", "==", userCode).get();
    res.json(snap.docs.map((d) => d.data()));
  })
);

router.get(
  "/:code",
  asyncHandler(async (req, res) => {
    const code = normalizeCode(req.params.code);
    const snap = await adminDb.collection("trips").doc(code).get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Trip not found. Please verify the 6-character alphanumeric code." });
    }
    res.json(snap.data());
  })
);

router.put(
  "/:code",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const code = normalizeCode(req.params.code);
    const master = await getMaster(code);
    const userCode = await resolveUserCode(req.uid);
    const role = resolveRole(master, userCode);
    if (!canWriteTrip(master, role)) {
      return res.status(403).json({ error: "Action is unauthorized. Please seek permission from the trip owner to allow modification of this trip." });
    }
    const trip = { ...(req.body || {}), code };
    delete (trip as any).allowOthersToModify; // must only ever be stored on trip_owner_user_master.allowModification

    // Only read the current doc (extra Firestore read) if this update actually touches status --
    // avoids adding overhead to the vast majority of trip saves that never change it.
    if (trip.status === "completed" || trip.status === "cancelled") {
      const currentSnap = await adminDb.collection("trips").doc(code).get();
      const currentStatus = currentSnap.exists ? currentSnap.data()?.status : null;
      if (currentStatus !== trip.status) {
        void sweepTripJoinRequestsForTrip(code);
      }
    }

    await adminDb.collection("trips").doc(code).set(trip, { merge: true });
    res.json({ success: true });
  })
);

router.delete(
  "/:code",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const code = normalizeCode(req.params.code);
    const master = await getMaster(code);
    const userCode = await resolveUserCode(req.uid);
    const role = resolveRole(master, userCode);
    if (!canDeleteTrip(role)) {
      return res.status(403).json({ error: "Only the trip owner can delete this trip." });
    }

    // Clean up every associated traveler's per-user data and association entry before removing
    // the trip itself, mirroring the client's handleUpdateAppData deletion loop.
    const associatedUserCodes = new Set<string>();
    if (master?.owner) associatedUserCodes.add(master.owner);
    for (const tuple of Object.values(master?.users || {})) {
      if (tuple[1]) associatedUserCodes.add(tuple[1]);
    }

    await adminDb.collection("trips").doc(code).delete();
    await sweepTripJoinRequestsForTrip(code);

    // R2 attachments: outfit photos and expense/receipt attachments are stored under
    // {purpose}/{userCode}/{tripCode}/{uuid}.{ext} (see routes/uploads.ts's UPLOAD_PURPOSES --
    // keep this list in sync if a new upload purpose is ever added there). Since userCode comes
    // before tripCode in the key, there's no single prefix covering the whole trip -- iterate
    // every contributor's own prefix instead, using the same associatedUserCodes already resolved
    // above. Best-effort: a briefly-unreachable R2 shouldn't block the rest of trip deletion.
    for (const uc of associatedUserCodes) {
      for (const purposePrefix of ["outfit-photos", "attachments"]) {
        await deleteObjectsWithPrefix(`${purposePrefix}/${uc}/${code}/`).catch((err) => {
          console.error(`Failed deleting R2 objects under ${purposePrefix}/${uc}/${code}/:`, err);
        });
      }
    }

    // trip_transaction_master/{code} + its /changes subcollection -- never cleaned up before,
    // would otherwise accumulate forever even across trip deletion.
    const changesSnap = await adminDb.collection("trip_transaction_master").doc(code).collection("changes").get().catch(() => null);
    if (changesSnap) {
      const logBatch = adminDb.batch();
      changesSnap.docs.forEach((d) => logBatch.delete(d.ref));
      await logBatch.commit().catch(() => {});
    }
    await adminDb.collection("trip_transaction_master").doc(code).delete().catch(() => {});

    await adminDb.collection("trip_owner_user_master").doc(code).delete().catch(() => {});

    const batch = adminDb.batch();
    for (const uc of associatedUserCodes) {
      batch.delete(adminDb.collection("user_specific_trip_list").doc(`${uc}_${code}`));
    }
    await batch.commit().catch(() => {});

    for (const uc of associatedUserCodes) {
      await adminDb
        .collection("user_trip_association_master")
        .doc(uc)
        .update({ [code]: FieldValue.delete() })
        .catch(() => {});
    }

    res.json({ success: true });
  })
);

router.get(
  "/:code/master",
  asyncHandler(async (req, res) => {
    const code = normalizeCode(req.params.code);
    const master = await getMaster(code);
    if (!master) return res.status(404).json({ error: "Trip master not found." });
    res.json(master);
  })
);

router.put(
  "/:code/master",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const code = normalizeCode(req.params.code);
    const existing = await getMaster(code);
    const userCode = await resolveUserCode(req.uid);
    const role = resolveRole(existing, userCode);

    // Creating a brand-new master: anyone may (they become the owner). Editing an existing one
    // (e.g. toggling allowModification): owner only -- matches the client's Trip Settings UI.
    if (existing && role !== "owner") {
      return res.status(403).json({ error: "Only the trip owner can change trip sharing settings." });
    }

    const { allowModification, users } = req.body || {};
    const owner = existing?.owner || userCode;
    if (!owner) {
      return res.status(400).json({ error: "Could not resolve a userCode for the trip owner." });
    }
    const result: TripOwnerUserMaster = {
      tripCode: code,
      owner,
      allowModification: !!allowModification,
      ...(users ? { users } : existing?.users ? { users: existing.users } : {}),
    };
    await adminDb.collection("trip_owner_user_master").doc(code).set(result, { merge: true });
    res.json(result);
  })
);

router.delete(
  "/:code/master",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const code = normalizeCode(req.params.code);
    const master = await getMaster(code);
    const userCode = await resolveUserCode(req.uid);
    const role = resolveRole(master, userCode);
    if (role !== "owner") {
      return res.status(403).json({ error: "Only the trip owner can delete trip ownership data." });
    }
    await adminDb.collection("trip_owner_user_master").doc(code).delete();
    res.json({ success: true });
  })
);

// Per-user checklist/outfit snapshot (was a single shared doc per trip; now one doc per
// (userCode, tripCode) pair at user_specific_trip_list/{userCode}_{tripCode}). Each user may only
// read/write their OWN entry.
router.get(
  "/:code/user-trip-list/:userCode",
  requireAuth,
  asyncHandler(async (req, res) => {
    const code = normalizeCode(req.params.code);
    const callerUserCode = await resolveUserCode(req.uid);
    if (callerUserCode !== req.params.userCode) {
      return res.status(403).json({ error: "You may only access your own checklist/outfit data." });
    }
    const snap = await adminDb.collection("user_specific_trip_list").doc(`${req.params.userCode}_${code}`).get();
    if (!snap.exists) return res.status(404).json({ error: "Not found." });
    res.json(snap.data());
  })
);

router.put(
  "/:code/user-trip-list/:userCode",
  requireAuth,
  asyncHandler(async (req, res) => {
    const code = normalizeCode(req.params.code);
    const callerUserCode = await resolveUserCode(req.uid);
    if (callerUserCode !== req.params.userCode) {
      return res.status(403).json({ error: "You may only modify your own checklist/outfit data." });
    }
    const { globalChecklist, outfitDetails } = req.body || {};
    const result = {
      userCode: req.params.userCode,
      tripCode: code,
      globalChecklist: globalChecklist || [],
      outfitDetails: outfitDetails || { days: {} },
    };
    await adminDb.collection("user_specific_trip_list").doc(`${req.params.userCode}_${code}`).set(result, { merge: true });
    res.json(result);
  })
);

router.delete(
  "/:code/user-trip-list/:userCode",
  requireAuth,
  asyncHandler(async (req, res) => {
    const code = normalizeCode(req.params.code);
    const callerUserCode = await resolveUserCode(req.uid);
    if (callerUserCode !== req.params.userCode) {
      return res.status(403).json({ error: "You may only remove your own checklist/outfit data." });
    }
    await adminDb.collection("user_specific_trip_list").doc(`${req.params.userCode}_${code}`).delete();
    res.json({ success: true });
  })
);

// Matches lib/db.ts's logTripChange -- same transactional sequential-counter pattern (the counter
// lives on trip_transaction_master/{code} itself, actual entries in its /changes subcollection),
// so a changeId looks the same regardless of which side wrote it.
router.post(
  "/:code/changes",
  requireAuth,
  asyncHandler(async (req, res) => {
    const code = normalizeCode(req.params.code);
    const { operation, fieldPath, newValue } = req.body || {};
    if (!operation || !["created", "updated", "deleted"].includes(operation)) {
      return res.status(400).json({ error: "operation must be one of: created, updated, deleted." });
    }
    const changedBy = await resolveUserCode(req.uid);

    const counterRef = adminDb.collection("trip_transaction_master").doc(code);
    try {
      const changeId = await adminDb.runTransaction(async (transaction) => {
        const snap = await transaction.get(counterRef);
        const data = snap.exists ? snap.data() : null;
        const next = data && typeof data.nextChangeId === "number" && data.nextChangeId >= 1 ? data.nextChangeId : 1;
        transaction.set(counterRef, { nextChangeId: next + 1 }, { merge: true });
        return next;
      });

      const changeRef = counterRef.collection("changes").doc(String(changeId));
      await changeRef.set({
        tripCode: code,
        changeId,
        operation,
        fieldPath: fieldPath ?? null,
        newValue: newValue ?? null,
        changedBy,
        createdAt: new Date().toISOString(),
      });

      res.json({ success: true, changeId });
    } catch (err: any) {
      // Non-critical logging -- never fail the caller's actual save over this.
      console.warn("Failed logging trip change:", err?.message);
      res.json({ success: false });
    }
  })
);

export default router;
