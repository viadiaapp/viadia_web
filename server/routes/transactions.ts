import { Router } from "express";
import { adminDb } from "../firebaseAdmin";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Both routes now read the real ledger (subscription_transaction_master) instead of the old
// generic "transactions" collection. Note: subscription_transaction_master has no `uid` field
// (only `userCode`), so /mine resolves the caller's userCode from their user doc first.

router.get(
  "/by-user-code/:userCode",
  requireAuth,
  asyncHandler(async (req, res) => {
    const snap = await adminDb
      .collection("subscription_transaction_master")
      .where("userCode", "==", req.params.userCode)
      .orderBy("createdAt", "desc")
      .get();
    res.json(snap.docs.map((d) => d.data()));
  })
);

router.get(
  "/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userSnap = await adminDb.collection("users").doc(req.uid!).get();
    const userCode = userSnap.exists ? userSnap.data()!.userCode : null;
    if (!userCode) return res.json([]);

    const snap = await adminDb
      .collection("subscription_transaction_master")
      .where("userCode", "==", userCode)
      .orderBy("createdAt", "desc")
      .get();
    res.json(snap.docs.map((d) => d.data()));
  })
);

export default router;
