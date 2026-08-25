import { Router } from "express";
import { adminDb } from "../firebaseAdmin";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.get(
  "/by-user-code/:userCode",
  requireAuth,
  asyncHandler(async (req, res) => {
    const snap = await adminDb
      .collection("transactions")
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
    const snap = await adminDb.collection("transactions").where("uid", "==", req.uid).orderBy("createdAt", "desc").get();
    res.json(snap.docs.map((d) => d.data()));
  })
);

// Generic transaction records (e.g. non-payment receipts). Real subscription-granting transactions
// are only ever written by the Razorpay verify/webhook flow (see routes/payments.ts) — a client
// posting here can never mark itself "completed".
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const transactionId = body.transactionId || `txn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const record = {
      ...body,
      id: transactionId,
      transactionId,
      uid: req.uid,
      status: body.status === "completed" ? "pending" : body.status || "pending",
      createdAt: body.createdAt || new Date().toISOString(),
    };
    await adminDb.collection("transactions").doc(transactionId).set(record, { merge: true });
    res.json(record);
  })
);

export default router;
