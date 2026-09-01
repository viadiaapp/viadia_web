import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { adminDb } from "../firebaseAdmin";
import { createRazorpayOrder, getRazorpayKeyId, verifyPaymentSignature, verifyWebhookSignature } from "../services/razorpay";
import { applyPurchasedPlan } from "../services/subscriptionService";

const router = Router();

// Lightweight, backend-internal bookkeeping only -- NOT part of the app's Firestore schema.
// Tracks a Razorpay order from creation through to verification/webhook so /verify and /webhook
// know which userCode + planId it was for. The actual, permanent ledger entry only gets written
// by applyPurchasedPlan() once payment is confirmed (see services/subscriptionService.ts).
const PENDING_ORDERS_COLLECTION = "razorpay_payment_orders";

// Server decides the price — it is looked up from Firestore by planId, never trusted from the client.
router.post("/razorpay/create-order", requireAuth, async (req, res) => {
  try {
    const { planId } = req.body || {};
    if (!planId || typeof planId !== "string") {
      return res.status(400).json({ error: "Missing planId." });
    }

    const planSnap = await adminDb.collection("subscription_types").doc(planId).get();
    if (!planSnap.exists) {
      return res.status(404).json({ error: "Unknown subscription plan." });
    }
    const plan = planSnap.data() as any;

    const userSnap = await adminDb.collection("users").doc(req.uid!).get();
    const user = userSnap.exists ? userSnap.data()! : ({} as any);
    if (!user.userCode) {
      return res.status(400).json({ error: "This account has no userCode assigned yet." });
    }

    const receipt = `ord_${Date.now()}_${req.uid!.slice(0, 6)}`;
    const order = await createRazorpayOrder({
      amount: plan.discountedPrice,
      currency: plan.currency || "USD",
      receipt,
      notes: { uid: req.uid!, userCode: user.userCode, planId },
    });

    await adminDb
      .collection(PENDING_ORDERS_COLLECTION)
      .doc(order.id)
      .set({
        orderId: order.id,
        uid: req.uid,
        userCode: user.userCode,
        planId: plan.planId,
        createdAt: new Date().toISOString(),
      });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: getRazorpayKeyId(),
      planName: plan.planName,
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
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
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

    const orderSnap = await adminDb.collection(PENDING_ORDERS_COLLECTION).doc(razorpay_order_id).get();
    if (!orderSnap.exists) {
      return res.status(404).json({ error: "Payment order not found." });
    }
    const pendingOrder = orderSnap.data()!;
    if (pendingOrder.uid !== req.uid) {
      return res.status(403).json({ error: "This payment order does not belong to this account." });
    }

    const result = await applyPurchasedPlan({
      userCode: pendingOrder.userCode,
      planId: pendingOrder.planId,
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      paymentMethod: "razorpay",
    });

    res.json({ success: true, subscription: result });
  } catch (err: any) {
    console.error("razorpay verify failed:", err?.message || err);
    res.status(500).json({ error: "Failed to verify payment." });
  }
});

// Server-to-server confirmation — a second, authoritative path in case the browser closes before
// the client ever calls /verify. Idempotent via applyPurchasedPlan's own orderId-based check.
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

    const orderId = payload.order_id || payload.id;
    if (!orderId) {
      return res.status(200).json({ received: true });
    }

    if (event.event === "payment.captured" || event.event === "order.paid") {
      const orderSnap = await adminDb.collection(PENDING_ORDERS_COLLECTION).doc(orderId).get();
      if (orderSnap.exists) {
        const pendingOrder = orderSnap.data()!;
        await applyPurchasedPlan({
          userCode: pendingOrder.userCode,
          planId: pendingOrder.planId,
          orderId,
          paymentId: payload.id,
          paymentMethod: "razorpay",
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
