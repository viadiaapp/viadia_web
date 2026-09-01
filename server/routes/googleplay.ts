import { Router } from "express";
import { adminDb } from "../firebaseAdmin";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { verifyOneTimeProductPurchase, acknowledgeOneTimeProductPurchase } from "../services/googlePlay";
import { applyPurchasedPlan } from "../services/subscriptionService";

const router = Router();

// The 5 plans (1_year, 2_year, 3_year, 5_year, lifetime) are modeled as Google Play ONE-TIME
// products, not subscriptions -- they're fixed-term passes with no auto-renewal, and this app's
// own applyPurchasedPlan()/calculateEndDate() already compute the multi-year expiry, exactly like
// it does for Razorpay. Play's job here is only to confirm the purchase happened; product IDs in
// Play Console must match these planId strings exactly.
router.post(
  "/verify",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { productId, purchaseToken } = req.body || {};
    if (!productId || !purchaseToken) {
      return res.status(400).json({ error: "Missing productId or purchaseToken." });
    }

    const userSnap = await adminDb.collection("users").doc(req.uid!).get();
    const userCode = userSnap.exists ? userSnap.data()!.userCode : null;
    if (!userCode) {
      return res.status(400).json({ error: "This account has no userCode assigned yet." });
    }

    let purchase;
    try {
      purchase = await verifyOneTimeProductPurchase(productId, purchaseToken);
    } catch (err: any) {
      console.error("Google Play verification failed:", err?.message || err);
      return res.status(400).json({ error: "Could not verify this purchase with Google Play." });
    }

    // purchaseState: 0 = Purchased. Anything else (canceled/pending) is not a completed purchase.
    if (purchase.purchaseState !== 0) {
      return res.status(400).json({ error: "This purchase is not in a completed state." });
    }

    const result = await applyPurchasedPlan({
      userCode,
      planId: productId,
      orderId: purchase.orderId || purchaseToken,
      paymentId: purchaseToken,
      paymentMethod: "google_play",
    });

    // Acknowledge only after successfully recording the purchase on our side -- if applyPurchasedPlan
    // above had thrown, we want Google's own unacknowledged-purchase retry/refund safety net still
    // active rather than closing it out on a purchase we failed to grant access for.
    if (purchase.acknowledgementState === 0) {
      await acknowledgeOneTimeProductPurchase(productId, purchaseToken).catch((err) => {
        console.error("Failed to acknowledge Google Play purchase (will retry on next verify call):", err?.message || err);
      });
    }

    res.json({ success: true, subscription: result });
  })
);

export default router;
