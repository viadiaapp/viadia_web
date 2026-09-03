import { Router } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../firebaseAdmin";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { sweepTripJoinRequestsForTrip, createOwnerInvite, addUnmappedEmailTripAssociation, getTripJoinRequestsDoc, cancelOwnerInvite } from "../services/joinRequestService";
import { sendSignupInviteEmail } from "../services/emailService";
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

// trip_owner_user_master/{tripCode}. users is keyed by each traveler's canonical travelerId,
// never a display name -- names can collide or change (e.g. when a placeholder gets matched to
// a real account with a different display name), a stable ID never does.
type TravelerRecord = {
  role: TripRole;
  userCode: string;
  email: string;
  displayName: string;
};
type TripOwnerUserMaster = {
  tripCode: string;
  owner: string; // userCode
  ownerTravelerId?: string;
  allowModification: boolean;
  users?: { [travelerId: string]: TravelerRecord };
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

async function resolveUserName(uid: string | undefined): Promise<string> {
  if (!uid) return "Someone";
  const snap = await adminDb.collection("users").doc(uid).get();
  return (snap.exists && snap.data()?.name) || "Someone";
}

// Determines the caller's role on a trip: owner (matches master.owner), moderator/companion
// (matches a userCode inside master.users), or null (no association at all).
function resolveRole(master: TripOwnerUserMaster | null, userCode: string | null): TripRole | null {
  if (!master || !userCode) return null;
  if (master.owner === userCode) return "owner";
  const users = master.users || {};
  for (const record of Object.values(users)) {
    if (record.userCode === userCode) return record.role;
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

function canApproveChanges(role: TripRole | null): boolean {
  return !!role && ROLE_PERMISSIONS[role].approveChanges;
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

// Creates a brand-new trip atomically: trips, trip_owner_user_master,
// user_trip_association_master, and user_specific_trip_list either all commit together in one
// WriteBatch or none of them do -- this is the fix for the exact bug where saveTripOwnerMaster/
// setUserTripRole/initUserTripListEntry could each independently succeed while the final
// saveTripToDB call silently failed, leaving a trip with a roster but no trip data. Per-traveler
// invite creation (for email-like travelers) and their emails happen after the batch commits,
// since those already have their own transactional safety (createOwnerInvite) and one invite
// failing shouldn't roll back an otherwise fully-valid trip.
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const ownerUserCode = await resolveUserCode(req.uid);
    if (!ownerUserCode) return res.status(400).json({ error: "This account has no userCode assigned yet." });

    const trip = req.body?.trip;
    const code = normalizeCode(trip?.code || "");
    const ownerTravelerId = trip?.ownerTravelerId;
    if (!code || !ownerTravelerId) {
      return res.status(400).json({ error: "Missing trip.code or trip.ownerTravelerId." });
    }

    const existing = await adminDb.collection("trips").doc(code).get();
    if (existing.exists) {
      return res.status(409).json({ error: `A trip with code ${code} already exists.` });
    }

    delete (trip as any).allowOthersToModify; // must only ever be stored on trip_owner_user_master.allowModification
    trip.code = code;
    trip.ownerUid = req.uid;

    const isEmailLike = (s: string) => /\S+@\S+\.\S+/.test(s);
    const travelerNames: Record<string, string> = trip.travelerNames || {};
    const travelerIds: string[] = trip.travelers || [];

    // Gather everything needed for the atomic write first -- these are plain reads that don't
    // need to be part of the write's atomicity, only the writes themselves do.
    const users: Record<string, { role: "owner" | "moderator" | "companion"; userCode: string; email: string; displayName: string }> = {};
    const pendingInvites: { travelerId: string; name: string; foundUserCode: string; foundEmail: string }[] = [];
    const pendingSignupInvites: { travelerId: string; email: string }[] = [];

    for (const travelerId of travelerIds) {
      if (travelerId === ownerTravelerId) continue; // owner tracked via ownerTravelerId, never in users
      const name = travelerNames[travelerId] || "";

      if (isEmailLike(name)) {
        const foundSnap = await adminDb.collection("users").where("email", "==", name).limit(1).get();
        if (!foundSnap.empty) {
          const found = foundSnap.docs[0].data();
          // Known account: leave only a name placeholder for now -- the real userCode/email isn't
          // written until they actually accept the invite (acceptOwnerInvite), so no PII sits in
          // these tables while still pending.
          users[travelerId] = { role: "companion", userCode: "", email: "", displayName: name };
          if (found?.userCode) pendingInvites.push({ travelerId, name, foundUserCode: found.userCode, foundEmail: found.email || name });
        } else {
          users[travelerId] = { role: "companion", userCode: "", email: name, displayName: name };
          pendingSignupInvites.push({ travelerId, email: name });
        }
      } else {
        users[travelerId] = { role: "companion", userCode: "", email: "", displayName: name };
      }
    }

    const listDocId = `${ownerUserCode}_${code}`;
    const existingListSnap = await adminDb.collection("user_specific_trip_list").doc(listDocId).get();
    let listEntry: any = null;
    if (!existingListSnap.exists) {
      const configSnap = await adminDb.collection("user_configs").doc(ownerUserCode).get();
      const globalChecklist = configSnap.exists ? configSnap.data()?.globalChecklist || [] : [];
      const gcCopy = globalChecklist.map((item: any) => ({
        ...item,
        id: item.id || `glob-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        checked: false,
      }));
      listEntry = { userCode: ownerUserCode, tripCode: code, globalChecklist: gcCopy, outfitDetails: { days: {} } };
    }

    // The atomic part: every core write here commits together, or none of them do.
    const changes = computeTripChanges(null, trip);
    const batch = adminDb.batch();
    batch.set(adminDb.collection("trips").doc(code), trip);
    batch.set(adminDb.collection("trip_owner_user_master").doc(code), {
      tripCode: code,
      owner: ownerUserCode,
      ownerTravelerId,
      allowModification: false,
      users,
    });
    batch.set(adminDb.collection("user_trip_association_master").doc(ownerUserCode), { [code]: "owner" }, { merge: true });
    if (listEntry) {
      batch.set(adminDb.collection("user_specific_trip_list").doc(listDocId), listEntry, { merge: true });
    }
    if (changes.length > 0) {
      const counterRef = adminDb.collection("trip_transaction_master").doc(code);
      batch.set(counterRef, { nextChangeId: changes.length + 1 }, { merge: true });
      changes.forEach((change, i) => {
        const changeId = i + 1;
        batch.set(counterRef.collection("changes").doc(String(changeId)), {
          tripCode: code,
          changeId,
          operation: change.operation,
          fieldPath: change.fieldPath,
          newValue: change.newValue,
          changedBy: ownerUserCode,
          createdAt: new Date().toISOString(),
        });
      });
    }
    await batch.commit();

    // Best-effort, after the atomic core has already committed successfully.
    const inviterName = await resolveUserName(req.uid);
    for (const inv of pendingInvites) {
      try {
        await createOwnerInvite({
          tripCode: code,
          tripTitle: trip.title || "",
          inviterUserCode: ownerUserCode,
          travelerId: inv.travelerId,
          travelerName: inv.name,
          recipientUserCode: inv.foundUserCode,
          recipientEmail: inv.foundEmail,
        });
      } catch (e) {
        console.error(`Failed creating invite for ${inv.name} on new trip ${code}:`, e);
      }
    }
    for (const inv of pendingSignupInvites) {
      try {
        await addUnmappedEmailTripAssociation(inv.email, code);
        void sendSignupInviteEmail({ toEmail: inv.email, inviterName, tripTitle: trip.title || "this trip" });
      } catch (e) {
        console.error(`Failed recording signup invite for ${inv.email} on new trip ${code}:`, e);
      }
    }

    res.json({ success: true, code });
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

// Ported from the frontend's logTripContentChanges (App.tsx) -- computes the same field-level
// diff (timeline/expenses/checklist, item by item), but as a plain list of entries to write,
// rather than making individual API calls. This lets PUT /:code below write the trip and every
// resulting change-log entry inside one transaction, so the log can never end up out of sync with
// what was actually saved -- previously these were entirely separate, frontend-sequenced calls,
// and the trip save could succeed or fail independently of whether the log entries were written
// (or the reverse: a change could get logged even when the trip save itself silently failed).
type ChangeEntry = { operation: "created" | "updated" | "deleted"; fieldPath: string; newValue: any };

function computeTripChanges(oldTrip: any, newTrip: any): ChangeEntry[] {
  const changes: ChangeEntry[] = [];

  // --- Planner (timeline) ---
  const oldPlaces = new Map((oldTrip?.timeline || []).map((p: any) => [p.id, p]));
  for (const place of newTrip.timeline || []) {
    const prior = oldPlaces.get(place.id);
    if (!prior || JSON.stringify(prior) !== JSON.stringify(place)) {
      const dateStr = (place.time || place.boardingTime || place.departureTime || "").split("T")[0] || undefined;
      changes.push({ operation: prior ? "updated" : "created", fieldPath: "timeline", newValue: { title: place.title, date: dateStr } });
    }
  }
  const newPlaceIds = new Set((newTrip.timeline || []).map((p: any) => p.id));
  for (const place of oldTrip?.timeline || []) {
    if (!newPlaceIds.has(place.id)) {
      changes.push({ operation: "deleted", fieldPath: "timeline", newValue: { title: place.title } });
    }
  }

  // --- Expenses (expense / forex conversion / peer transfer) ---
  const oldExpenses = new Map((oldTrip?.expenses || []).map((e: any) => [e.id, e]));
  for (const exp of newTrip.expenses || []) {
    const prior = oldExpenses.get(exp.id);
    if (!prior || JSON.stringify(prior) !== JSON.stringify(exp)) {
      const op = prior ? "updated" : "created";
      if (exp.type === "forex") {
        changes.push({ operation: op, fieldPath: "expenses", newValue: { title: exp.title, convertedBy: exp.paidBy, amount: exp.amount } });
      } else if (exp.type === "peer_transfer") {
        changes.push({ operation: op, fieldPath: "expenses", newValue: { title: exp.title, date: exp.date, sender: exp.paidBy, recipient: exp.transferTo, amount: exp.amount } });
      } else {
        changes.push({ operation: op, fieldPath: "expenses", newValue: { title: exp.title, date: exp.date, paidBy: exp.paidBy, amount: exp.amount } });
      }
    }
  }
  const newExpenseIds = new Set((newTrip.expenses || []).map((e: any) => e.id));
  for (const exp of oldTrip?.expenses || []) {
    if (!newExpenseIds.has(exp.id)) {
      changes.push({ operation: "deleted", fieldPath: "expenses", newValue: { title: exp.title } });
    }
  }

  // --- Shared checklist only (Trip.checklist). Personal checklist and outfits are never part of
  // the Trip document, so they can't appear here. ---
  const oldChecklist = new Map((oldTrip?.checklist || []).map((c: any) => [c.id, c]));
  for (const item of newTrip.checklist || []) {
    const prior = oldChecklist.get(item.id);
    if (!prior || JSON.stringify(prior) !== JSON.stringify(item)) {
      changes.push({ operation: prior ? "updated" : "created", fieldPath: "checklist", newValue: { task: item.task } });
    }
  }
  const newChecklistIds = new Set((newTrip.checklist || []).map((c: any) => c.id));
  for (const item of oldTrip?.checklist || []) {
    if (!newChecklistIds.has(item.id)) {
      changes.push({ operation: "deleted", fieldPath: "checklist", newValue: { task: item.task } });
    }
  }

  return changes;
}

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
    const newTrip = { ...(req.body || {}), code };
    delete (newTrip as any).allowOthersToModify; // must only ever be stored on trip_owner_user_master.allowModification

    const tripRef = adminDb.collection("trips").doc(code);
    const counterRef = adminDb.collection("trip_transaction_master").doc(code);

    // The atomic core: the trip write and every resulting change-log entry (diffed against
    // whatever's actually in the database, not a possibly-stale frontend copy) either all commit
    // together, or none of them do.
    const { statusChangedToTerminal } = await adminDb.runTransaction(async (transaction) => {
      // All reads before any writes, as Firestore transactions require.
      const currentSnap = await transaction.get(tripRef);
      const oldTrip = currentSnap.exists ? currentSnap.data() : null;
      const counterSnap = await transaction.get(counterRef);
      let nextChangeId =
        counterSnap.exists && typeof counterSnap.data()?.nextChangeId === "number" && counterSnap.data()!.nextChangeId >= 1
          ? counterSnap.data()!.nextChangeId
          : 1;

      const changes = computeTripChanges(oldTrip, newTrip);
      const statusChangedToTerminal =
        (newTrip.status === "completed" || newTrip.status === "cancelled") && oldTrip?.status !== newTrip.status;

      transaction.set(tripRef, newTrip, { merge: true });
      if (changes.length > 0) {
        transaction.set(counterRef, { nextChangeId: nextChangeId + changes.length }, { merge: true });
        for (const change of changes) {
          const changeId = nextChangeId++;
          transaction.set(counterRef.collection("changes").doc(String(changeId)), {
            tripCode: code,
            changeId,
            operation: change.operation,
            fieldPath: change.fieldPath,
            newValue: change.newValue,
            changedBy: userCode,
            createdAt: new Date().toISOString(),
          });
        }
      }

      return { statusChangedToTerminal };
    });

    // Side effect, deliberately outside the atomic core -- triggering the join-request sweep
    // doesn't need to be part of "did the trip save correctly."
    if (statusChangedToTerminal) void sweepTripJoinRequestsForTrip(code);

    res.json({ success: true });
  })
);

// Surgically removes a single key from trips/{code}.travelerNames via FieldValue.delete().
// Needed because the main PUT /:code above writes with { merge: true }, and Firestore's merge
// semantics for nested map fields only add/update keys present in the payload -- they never
// remove a key just because it's absent. Same write-permission check as the main trip save.
router.delete(
  "/:code/traveler-name/:travelerId",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const code = normalizeCode(req.params.code);
    const master = await getMaster(code);
    const userCode = await resolveUserCode(req.uid);
    const role = resolveRole(master, userCode);
    if (!canWriteTrip(master, role)) {
      return res.status(403).json({ error: "Action is unauthorized. Please seek permission from the trip owner to allow modification of this trip." });
    }
    await adminDb
      .collection("trips")
      .doc(code)
      .update({ [`travelerNames.${req.params.travelerId}`]: FieldValue.delete() })
      .catch(() => {}); // no-op if the trip doc or key doesn't exist -- not a real failure
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
    for (const record of Object.values(master?.users || {})) {
      if (record.userCode) associatedUserCodes.add(record.userCode);
    }

    // The atomic core: either the trip is fully gone from every collection that represents
    // "does this trip exist and who's on it," or the delete fails outright and nothing changes.
    // A typical trip has a small, bounded number of associated users, so this batch never
    // realistically approaches Firestore's 500-operation limit.
    const coreBatch = adminDb.batch();
    coreBatch.delete(adminDb.collection("trips").doc(code));
    coreBatch.delete(adminDb.collection("trip_owner_user_master").doc(code));
    for (const uc of associatedUserCodes) {
      coreBatch.delete(adminDb.collection("user_specific_trip_list").doc(`${uc}_${code}`));
      coreBatch.set(adminDb.collection("user_trip_association_master").doc(uc), { [code]: FieldValue.delete() }, { merge: true });
    }
    await coreBatch.commit();

    // Everything below is best-effort cleanup, deliberately kept outside the atomic core above --
    // none of it represents "does this trip still exist," and the changes subcollection in
    // particular can be unboundedly large for a long-running trip, which is its own reason not to
    // combine it into the same batch as the core deletions.
    await sweepTripJoinRequestsForTrip(code).catch((err) => {
      console.error(`Failed sweeping join requests for deleted trip ${code}:`, err);
    });

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

    // trip_transaction_master/{code} + its /changes subcollection.
    const changesSnap = await adminDb.collection("trip_transaction_master").doc(code).collection("changes").get().catch(() => null);
    if (changesSnap) {
      const logBatch = adminDb.batch();
      changesSnap.docs.forEach((d) => logBatch.delete(d.ref));
      await logBatch.commit().catch((err) => {
        console.error(`Failed deleting changes subcollection for deleted trip ${code}:`, err);
      });
    }
    await adminDb.collection("trip_transaction_master").doc(code).delete().catch((err) => {
      console.error(`Failed deleting trip_transaction_master for deleted trip ${code}:`, err);
    });

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

    const { allowModification, users, ownerTravelerId } = req.body || {};
    const owner = existing?.owner || userCode;
    if (!owner) {
      return res.status(400).json({ error: "Could not resolve a userCode for the trip owner." });
    }
    const result: TripOwnerUserMaster = {
      tripCode: code,
      owner,
      allowModification: !!allowModification,
      ...(ownerTravelerId ? { ownerTravelerId } : existing?.ownerTravelerId ? { ownerTravelerId: existing.ownerTravelerId } : {}),
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

// Syncs a userCode's role into user_trip_association_master/{targetUserCode}.{code} -- a derived
// convenience index, NOT a source of truth. trip_owner_user_master is the source of truth, so the
// role written here is always re-derived from it server-side and NEVER trusted from the client --
// there's deliberately no role field in the request body at all, nothing for a client to even try
// to influence. Covers both directions safely: a user syncing their own already-confirmed role
// (always allowed, since it can only ever write what trip_owner_user_master already says about
// them), and an owner/moderator syncing someone else's role as part of approving a request or
// changing a traveler's role (requires approveChanges permission on this trip).
router.post(
  "/:code/user-role/:userCode",
  requireAuth,
  asyncHandler(async (req, res) => {
    const code = normalizeCode(req.params.code);
    const targetUserCode = req.params.userCode;
    const callerUserCode = await resolveUserCode(req.uid);
    if (!callerUserCode) return res.status(400).json({ error: "This account has no userCode assigned yet." });

    const master = await getMaster(code);
    if (!master) return res.status(404).json({ error: "Trip not found." });

    const resolvedRole = resolveRole(master, targetUserCode);
    if (!resolvedRole) {
      return res.status(404).json({ error: "This user has no role on this trip according to trip_owner_user_master." });
    }

    if (targetUserCode !== callerUserCode) {
      const callerRole = resolveRole(master, callerUserCode);
      if (!canApproveChanges(callerRole)) {
        return res.status(403).json({ error: "You do not have permission to set another user's role on this trip." });
      }
    }

    await adminDb
      .collection("user_trip_association_master")
      .doc(targetUserCode)
      .set({ [code]: resolvedRole }, { merge: true });
    res.json({ success: true, role: resolvedRole });
  })
);

// Removes a userCode's entry from user_trip_association_master/{targetUserCode}.{code}. A user
// may always remove their own entry (leaving a trip is always their own choice, regardless of
// whether trip_owner_user_master still exists -- e.g. after the trip itself was already deleted).
// Removing someone else's entry requires approveChanges permission on this trip, verified against
// trip_owner_user_master -- if that record no longer exists, there's no way to verify the caller
// ever had permission, so this fails closed (403) rather than assuming it's fine.
router.delete(
  "/:code/user-role/:userCode",
  requireAuth,
  asyncHandler(async (req, res) => {
    const code = normalizeCode(req.params.code);
    const targetUserCode = req.params.userCode;
    const callerUserCode = await resolveUserCode(req.uid);
    if (!callerUserCode) return res.status(400).json({ error: "This account has no userCode assigned yet." });

    if (targetUserCode !== callerUserCode) {
      const master = await getMaster(code);
      const callerRole = resolveRole(master, callerUserCode);
      if (!canApproveChanges(callerRole)) {
        return res.status(403).json({ error: "You do not have permission to remove another user's role on this trip." });
      }
    }

    await adminDb
      .collection("user_trip_association_master")
      .doc(targetUserCode)
      .update({ [code]: FieldValue.delete() })
      .catch(() => {});
    res.json({ success: true });
  })
);

// Changes a single traveler's role on trip_owner_user_master, transactionally -- replaces the
// frontend's previous read-modify-write (fetch the whole master doc, splice in the new role
// locally, write the whole thing back), which was vulnerable to two concurrent role changes
// clobbering each other if their reads interleaved. A real Firestore transaction here means a
// genuine collision gets retried against the latest data instead of silently losing one change.
// Adds one or more travelers to a trip -- replaces the frontend's previous per-name loop that did
// its own email lookup, invite creation, and a read-modify-write against trip_owner_user_master
// (susceptible to the same race as the role-change/delete endpoints above if two adds, or an add
// and a delete, overlapped). The frontend now sends only the raw names; this endpoint resolves
// each one (email lookup, invite decision) the same way the trip-creation endpoint does, then
// commits the actual roster/trip changes inside one transaction against fresh data.
router.post(
  "/:code/travelers",
  requireAuth,
  asyncHandler(async (req, res) => {
    const code = normalizeCode(req.params.code);
    const names: string[] = Array.isArray(req.body?.names) ? req.body.names.filter((n: any) => typeof n === "string" && n.trim()) : [];
    if (names.length === 0) return res.status(400).json({ error: "No traveler names provided." });

    const callerUserCode = await resolveUserCode(req.uid);
    if (!callerUserCode) return res.status(400).json({ error: "This account has no userCode assigned yet." });

    const master = await getMaster(code);
    const callerRole = resolveRole(master, callerUserCode);
    if (!canWriteTrip(master, callerRole)) {
      return res.status(403).json({ error: "Action is unauthorized. Please seek permission from the trip owner to allow modification of this trip." });
    }

    const trip = (await adminDb.collection("trips").doc(code).get()).data();
    const existingNamesLower = new Set(Object.values(trip?.travelerNames || {}).map((n) => (n as string).toLowerCase()));
    const isEmailLike = (s: string) => /\S+@\S+\.\S+/.test(s);
    const toAdd: { travelerId: string; name: string }[] = [];
    const duplicates: string[] = [];
    const pendingInvites: { travelerId: string; name: string; foundUserCode: string; foundEmail: string }[] = [];
    const pendingSignupInvites: { travelerId: string; email: string }[] = [];

    for (const name of names) {
      if (existingNamesLower.has(name.trim().toLowerCase())) {
        duplicates.push(name);
        continue;
      }
      existingNamesLower.add(name.trim().toLowerCase());
      const travelerId = `T-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      toAdd.push({ travelerId, name });

      if (isEmailLike(name)) {
        const foundSnap = await adminDb.collection("users").where("email", "==", name).limit(1).get();
        if (!foundSnap.empty) {
          const found = foundSnap.docs[0].data();
          if (found?.userCode) pendingInvites.push({ travelerId, name, foundUserCode: found.userCode, foundEmail: found.email || name });
        } else {
          pendingSignupInvites.push({ travelerId, email: name });
        }
      }
    }

    const masterRef = adminDb.collection("trip_owner_user_master").doc(code);
    const tripRef = adminDb.collection("trips").doc(code);
    const pendingInviteIds = new Set(pendingInvites.map((i) => i.travelerId));
    const pendingSignupIds = new Set(pendingSignupInvites.map((i) => i.travelerId));

    if (toAdd.length > 0) {
      await adminDb.runTransaction(async (transaction) => {
        const [masterSnap, tripSnap] = await Promise.all([transaction.get(masterRef), transaction.get(tripRef)]);
        const freshMaster = (masterSnap.exists ? masterSnap.data() : master) as TripOwnerUserMaster;
        const freshTrip = tripSnap.exists ? tripSnap.data() : null;

        const nextUsers = { ...(freshMaster.users || {}) };
        const nextTravelers = [...(freshTrip?.travelers || [])];
        const nextNames = { ...(freshTrip?.travelerNames || {}) };

        for (const { travelerId, name } of toAdd) {
          const email = pendingInviteIds.has(travelerId) || pendingSignupIds.has(travelerId)
            ? (pendingSignupIds.has(travelerId) ? name : "")
            : "";
          nextUsers[travelerId] = { role: "companion", userCode: "", email, displayName: name };
          nextTravelers.push(travelerId);
          nextNames[travelerId] = name;
        }

        transaction.set(masterRef, { ...freshMaster, users: nextUsers });
        if (freshTrip) {
          transaction.set(tripRef, { travelers: nextTravelers, travelerNames: nextNames }, { merge: true });
        }
      });
    }

    // Best-effort, after the atomic core has already committed successfully.
    const inviterName = await resolveUserName(req.uid);
    for (const inv of pendingInvites) {
      try {
        await createOwnerInvite({
          tripCode: code,
          tripTitle: trip?.title || "",
          inviterUserCode: callerUserCode,
          travelerId: inv.travelerId,
          travelerName: inv.name,
          recipientUserCode: inv.foundUserCode,
          recipientEmail: inv.foundEmail,
        });
      } catch (e) {
        console.error(`Failed creating invite for ${inv.name} on trip ${code}:`, e);
      }
    }
    for (const inv of pendingSignupInvites) {
      try {
        await addUnmappedEmailTripAssociation(inv.email, code);
        void sendSignupInviteEmail({ toEmail: inv.email, inviterName, tripTitle: trip?.title || "this trip" });
      } catch (e) {
        console.error(`Failed recording signup invite for ${inv.email} on trip ${code}:`, e);
      }
    }

    res.json({ success: true, added: toAdd.map((t) => t.travelerId), duplicates });
  })
);


// travelerNames, transactionally -- replaces the frontend's previous read-modify-write (fetch
// master fresh, splice the traveler out locally, write it back), same race as the role-change
// endpoint above. Also folds in what used to be a separate removeTravelerNameEntry call: since
// this writes the whole travelerNames object directly (not a merge), simply omitting the deleted
// travelerId's key removes it -- no separate FieldValue.delete() round-trip needed.
router.delete(
  "/:code/traveler/:travelerId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const code = normalizeCode(req.params.code);
    const travelerId = req.params.travelerId;

    const callerUserCode = await resolveUserCode(req.uid);
    if (!callerUserCode) return res.status(400).json({ error: "This account has no userCode assigned yet." });

    const master = await getMaster(code);
    const callerRole = resolveRole(master, callerUserCode);
    if (!canWriteTrip(master, callerRole)) {
      return res.status(403).json({ error: "Action is unauthorized. Please seek permission from the trip owner to allow modification of this trip." });
    }
    if (master && travelerId === master.ownerTravelerId) {
      return res.status(400).json({ error: "The trip owner cannot be removed from the travelers list." });
    }

    const tripSnap = await adminDb.collection("trips").doc(code).get();
    const trip = tripSnap.exists ? tripSnap.data() : null;
    const isUsed = (trip?.expenses || []).some(
      (exp: any) => exp.paidBy === travelerId || (exp.splits || []).some((s: any) => s.traveler === travelerId)
    );
    if (isUsed) {
      return res.status(409).json({ error: "Cannot delete this traveler because they are linked to recorded expenses." });
    }

    // If this traveler still has a pending invite, withdraw it too -- otherwise the request
    // record and the recipient's approval_to_grant entry would be left pointing at a traveler
    // that no longer exists in the roster. Best-effort, and deliberately outside the atomic core
    // below -- a different collection, and not "does this traveler still exist" state.
    const requestsDoc = await getTripJoinRequestsDoc(code);
    for (const [reqId, entry] of Object.entries(requestsDoc?.owner_invite || {})) {
      if (entry.status === "pending" && entry.matchedTravelerId === travelerId) {
        await cancelOwnerInvite(code, reqId, callerUserCode).catch((err) => {
          console.error(`Failed cancelling pending invite for deleted traveler ${travelerId} on trip ${code}:`, err);
        });
      }
    }

    const masterRef = adminDb.collection("trip_owner_user_master").doc(code);
    const tripRef = adminDb.collection("trips").doc(code);

    await adminDb.runTransaction(async (transaction) => {
      const [masterSnap, tripSnap] = await Promise.all([transaction.get(masterRef), transaction.get(tripRef)]);
      const freshMaster = (masterSnap.exists ? masterSnap.data() : master) as TripOwnerUserMaster;
      const freshTrip = tripSnap.exists ? tripSnap.data() : trip;

      const nextUsers = { ...(freshMaster.users || {}) };
      delete nextUsers[travelerId];
      transaction.set(masterRef, { ...freshMaster, users: nextUsers });

      if (freshTrip) {
        const nextTravelers = (freshTrip.travelers || []).filter((id: string) => id !== travelerId);
        const nextNames = { ...(freshTrip.travelerNames || {}) };
        delete nextNames[travelerId];
        transaction.set(tripRef, { travelers: nextTravelers, travelerNames: nextNames }, { merge: true });
      }
    });

    res.json({ success: true });
  })
);

router.put(
  "/:code/traveler/:travelerId/role",
  requireAuth,
  asyncHandler(async (req, res) => {
    const code = normalizeCode(req.params.code);
    const travelerId = req.params.travelerId;
    const role = req.body?.role as TripRole;
    if (!["owner", "moderator", "companion"].includes(role)) {
      return res.status(400).json({ error: "role must be one of: owner, moderator, companion." });
    }

    const callerUserCode = await resolveUserCode(req.uid);
    if (!callerUserCode) return res.status(400).json({ error: "This account has no userCode assigned yet." });

    const master = await getMaster(code);
    if (!master) return res.status(404).json({ error: "Trip not found." });
    const callerRole = resolveRole(master, callerUserCode);
    if (!canApproveChanges(callerRole)) {
      return res.status(403).json({ error: "You do not have permission to change a traveler's role on this trip." });
    }
    if (travelerId === master.ownerTravelerId) {
      return res.status(400).json({ error: "The trip owner's role cannot be changed." });
    }

    const masterRef = adminDb.collection("trip_owner_user_master").doc(code);

    // The actual race-sensitive part: re-reads master fresh inside the transaction (the
    // permission check above used a snapshot that's now potentially a moment stale, which is
    // fine for a permission check -- roles rarely change moment-to-moment -- but the write below
    // must be based on the latest data, or a concurrent role change for a different traveler
    // could get silently clobbered).
    const mappedUserCode = await adminDb.runTransaction(async (transaction) => {
      const masterSnap = await transaction.get(masterRef);
      const freshMaster = (masterSnap.exists ? masterSnap.data() : master) as TripOwnerUserMaster;
      const existingUsers = freshMaster.users || {};
      const priorRecord = existingUsers[travelerId];
      const nextUsers = {
        ...existingUsers,
        [travelerId]: { role, userCode: priorRecord?.userCode || "", email: priorRecord?.email || "", displayName: priorRecord?.displayName || "" },
      };
      transaction.set(masterRef, { ...freshMaster, users: nextUsers });

      // Also keep user_trip_association_master in sync if this traveler is already mapped to a
      // real account -- write-only (a specific-key merge), so it doesn't need its own read here.
      if (priorRecord?.userCode) {
        transaction.set(adminDb.collection("user_trip_association_master").doc(priorRecord.userCode), { [code]: role }, { merge: true });
      }

      return priorRecord?.userCode || "";
    });

    res.json({ success: true, mappedUserCode });
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
