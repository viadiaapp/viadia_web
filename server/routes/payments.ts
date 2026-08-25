import { Router } from "express";
import { randomUUID } from "crypto";
import { requireAuth } from "../middleware/auth";
import { adminDb } from "../firebaseAdmin";
import { createRazorpayOrder, getRazorpayKeyId, verifyPaymentSignature, verifyWebhookSignature } from "../services/razorpay";
import { applyPurchasedPlan } from "../services/subscriptionService";

const router = Router();

// Server decides the price — it is looked up from Firestore by planId, never trusted from the client.
router.post("/razorpay/create-order", requireAuth, async (req, res) => {
  try {
    const { planId } = req.body || {};
    if (!planId || typeof planId !== "string") {
      return res.status(400).json({ error: "Missing planId." });
    }

    const planSnap = await adminDb.collection("subscription_plans").doc(planId).get();
    if (!planSnap.exists) {
      return res.status(404).json({ error: "Unknown subscription plan." });
    }
    const plan = planSnap.data() as any;

    const transactionId = `txn_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const order = await createRazorpayOrder({
      amount: plan.discountedPrice,
      currency: plan.currency || "USD",
      receipt: transactionId,
      notes: { uid: req.uid!, planId },
    });

    const userSnap = await adminDb.collection("users").doc(req.uid!).get();
    const user = userSnap.exists ? userSnap.data()! : ({} as any);

    await adminDb
      .collection("transactions")
      .doc(transactionId)
      .set({
        id: transactionId,
        transactionId,
        uid: req.uid,
        userCode: user.userCode || null,
        userEmail: user.email || req.userEmail || null,
        userName: user.name || "Traveler",
        planId: plan.id,
        planName: plan.name,
        planType: plan.type,
        durationYears: plan.durationYears,
        amountPaid: plan.discountedPrice,
        originalPrice: plan.originalPrice,
        currency: plan.currency,
        paymentMethod: "razorpay",
        orderId: order.id,
        status: "pending",
        createdAt: new Date().toISOString(),
      });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: getRazorpayKeyId(),
      transactionId,
      planName: plan.name,
      userName: user.name || "Traveler",
      userEmail: user.email || req.userEmail || undefined,
    });
  } catch (err: any) {
    console.error("razorpay create-order failed:", err?.message || err);
    res.status(500).json({ error: "Failed to create payment order." });
  }
});

router.post("/razorpay/verify", requireAuth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, transactionId } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !transactionId) {
      return res.status(400).json({ error: "Missing payment verification fields." });
    }

    const valid = verifyPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });
    if (!valid) {
      return res.status(400).json({ error: "Payment signature verification failed." });
    }

    const txnSnap = await adminDb.collection("transactions").doc(transactionId).get();
    if (!txnSnap.exists) {
      return res.status(404).json({ error: "Transaction not found." });
    }
    const txn = txnSnap.data()!;
    if (txn.uid !== req.uid) {
      return res.status(403).json({ error: "Transaction does not belong to this account." });
    }
    if (txn.orderId !== razorpay_order_id) {
      return res.status(400).json({ error: "Order mismatch." });
    }

    const result = await applyPurchasedPlan({
      uid: req.uid!,
      planId: txn.planId,
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      paymentMethod: "razorpay",
      transactionId,
    });

    res.json({ success: true, subscription: result });
  } catch (err: any) {
    console.error("razorpay verify failed:", err?.message || err);
    res.status(500).json({ error: "Failed to verify payment." });
  }
});

// Server-to-server confirmation — a second, authoritative path in case the browser closes before
// the client ever calls /verify. Idempotent via applyPurchasedPlan's own transaction-status check.
router.post("/razorpay/webhook", async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"] as string;
    const rawBody = (req as any).rawBody as Buffer | undefined;
    if (!signature || !rawBody || !verifyWebhookSignature(rawBody.toString("utf8"), signature)) {
      return res.status(400).json({ error: "Invalid webhook signature." });
    }

    const event = req.body;
    const payload = event?.payload?.payment?.entity || event?.payload?.order?.entity;
    if (!payload) {
      return res.status(200).json({ received: true });
    }

    const notes = payload.notes || {};
    const uid = notes.uid;
    const planId = notes.planId;
    const orderId = payload.order_id || payload.id;

    if (!orderId || !uid || !planId) {
      return res.status(200).json({ received: true });
    }

    if (event.event === "payment.captured" || event.event === "order.paid") {
      const txnQuery = await adminDb.collection("transactions").where("orderId", "==", orderId).limit(1).get();
      if (!txnQuery.empty) {
        const txnDoc = txnQuery.docs[0];
        await applyPurchasedPlan({
          uid,
          planId,
          orderId,
          paymentId: payload.id,
          paymentMethod: "razorpay",
          transactionId: txnDoc.id,
        });
      }
    }

    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error("razorpay webhook failed:", err?.message || err);
    res.status(500).json({ error: "Webhook processing failed." });
  }
});

export default router;
