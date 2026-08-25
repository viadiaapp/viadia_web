import { Router } from "express";
import { adminDb } from "../firebaseAdmin";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

type Master = { ownerUid?: string; allowOthersToModify?: boolean };

function normalizeCode(code: string): string {
  return (code || "").toUpperCase().trim();
}

// Mirrors the app's existing trip-sharing permission model (src/lib/auth.ts#isOwnerOfTrip):
// no master yet -> anyone may create it; guest-owned or allowOthersToModify -> anyone may edit;
// otherwise only the verified owner uid (or their verified email) may edit.
function canWriteTrip(master: Master | null, uid?: string, email?: string | null): boolean {
  if (!master || !master.ownerUid) return true;
  if (master.ownerUid.startsWith("guest_")) return true;
  if (master.allowOthersToModify === true) return true;
  if (uid && uid === master.ownerUid) return true;
  if (email && email.trim().toLowerCase() === master.ownerUid.trim().toLowerCase()) return true;
  return false;
}

async function getMaster(code: string): Promise<Master | null> {
  const snap = await adminDb.collection("trip_master").doc(code).get();
  return snap.exists ? (snap.data() as Master) : null;
}

router.get(
  "/owned",
  requireAuth,
  asyncHandler(async (req, res) => {
    const snap = await adminDb.collection("trips").where("ownerUid", "==", req.uid).get();
    res.json(snap.docs.map((d) => d.data()));
  })
);

router.get(
  "/owned/masters",
  requireAuth,
  asyncHandler(async (req, res) => {
    const snap = await adminDb.collection("trip_master").where("ownerUid", "==", req.uid).get();
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
    if (!canWriteTrip(master, req.uid, req.userEmail)) {
      return res.status(403).json({ error: "Action is unauthorized. Please seek permission from the trip owner to allow modification of this trip." });
    }
    const trip = { ...(req.body || {}), code };
    delete (trip as any).allowOthersToModify;
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
    if (!canWriteTrip(master, req.uid, req.userEmail)) {
      return res.status(403).json({ error: "Action is unauthorized." });
    }
    await adminDb.collection("trips").doc(code).delete();
    await adminDb.collection("trip_gclist_styling").doc(code).delete().catch(() => {});
    res.json({ success: true });
  })
);

router.get(
  "/:code/master",
  asyncHandler(async (req, res) => {
    const code = normalizeCode(req.params.code);
    const master = await getMaster(code);
    if (!master) return res.status(404).json({ error: "Trip master not found." });
    res.json({ tripCode: code, ...master });
  })
);

router.put(
  "/:code/master",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const code = normalizeCode(req.params.code);
    const existing = await getMaster(code);
    if (!canWriteTrip(existing, req.uid, req.userEmail)) {
      return res.status(403).json({ error: "Action is unauthorized." });
    }
    const { allowOthersToModify } = req.body || {};
    // ownerUid is always server-decided (verified uid, or a fresh guest id) — never trusted from the client.
    const ownerUid = existing?.ownerUid || req.uid || `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const result = { tripCode: code, ownerUid, allowOthersToModify: !!allowOthersToModify };
    await adminDb.collection("trip_master").doc(code).set(result, { merge: true });
    res.json(result);
  })
);

router.delete(
  "/:code/master",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const code = normalizeCode(req.params.code);
    const master = await getMaster(code);
    if (!canWriteTrip(master, req.uid, req.userEmail)) {
      return res.status(403).json({ error: "Action is unauthorized." });
    }
    await adminDb.collection("trip_master").doc(code).delete();
    res.json({ success: true });
  })
);

router.get(
  "/:code/gclist-styling",
  asyncHandler(async (req, res) => {
    const code = normalizeCode(req.params.code);
    const snap = await adminDb.collection("trip_gclist_styling").doc(code).get();
    if (!snap.exists) return res.status(404).json({ error: "Not found." });
    res.json(snap.data());
  })
);

router.put(
  "/:code/gclist-styling",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const code = normalizeCode(req.params.code);
    const master = await getMaster(code);
    if (!canWriteTrip(master, req.uid, req.userEmail)) {
      return res.status(403).json({ error: "Action is unauthorized." });
    }
    const { gclist, styling } = req.body || {};
    const result = { tripCode: code, gclist: gclist || [], styling: styling || { days: {} }, updatedAt: new Date().toISOString() };
    await adminDb.collection("trip_gclist_styling").doc(code).set(result, { merge: true });
    res.json(result);
  })
);

router.delete(
  "/:code/gclist-styling",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const code = normalizeCode(req.params.code);
    const master = await getMaster(code);
    if (!canWriteTrip(master, req.uid, req.userEmail)) {
      return res.status(403).json({ error: "Action is unauthorized." });
    }
    await adminDb.collection("trip_gclist_styling").doc(code).delete();
    res.json({ success: true });
  })
);

export default router;
