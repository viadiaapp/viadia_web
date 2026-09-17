import { Router } from "express";
import { adminDb } from "../firebaseAdmin";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Both routes now read the real ledger (subscription_transaction_master) instead of the old
// generic "transactions" collection. Note: subscription_transaction_master has no `uid` field
// (only `userCode`), so /mine resolves the caller's userCode from their user doc first.
//
// Neither route uses .orderBy() in the Firestore query itself: .where("userCode", "==", ...)
// combined with .orderBy("createdAt") is exactly the equality-filter-plus-orderBy-on-a-different-
// field combination that requires a Firestore composite index -- one that was never created here,
// which meant both routes threw at runtime on every single call. Sorting by createdAt happens in
// application code instead, which is safe and cheap since the where clause already scopes the
// read to just one user's documents, not the whole collection.

router.get(
  "/by-user-code/:userCode",
  requireAuth,
  asyncHandler(async (req, res) => {
    const snap = await adminDb
      .collection("subscription_transaction_master")
      .where("userCode", "==", req.params.userCode)
      .get();
    const docs = snap.docs.map((d) => d.data());
    docs.sort((a: any, b: any) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    res.json(docs);
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
      .get();
    const docs = snap.docs.map((d) => d.data());
    docs.sort((a: any, b: any) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    res.json(docs);
  })
);

export default router;
