import { Router } from "express";
import { adminDb } from "../firebaseAdmin";
import { DEFAULT_SUBSCRIPTION_PLANS } from "../data/subscriptionPlans";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

const PLAN_ORDER = ["1_year", "2_year", "3_year", "5_year", "lifetime"];

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    try {
      const snap = await adminDb.collection("subscription_plans").get();
      if (!snap.empty) {
        const plans = snap.docs.map((d) => d.data());
        plans.sort((a: any, b: any) => PLAN_ORDER.indexOf(a.id) - PLAN_ORDER.indexOf(b.id));
        return res.json(plans);
      }
      // Seed Firestore with the default plans the first time this is called.
      const batch = adminDb.batch();
      for (const plan of DEFAULT_SUBSCRIPTION_PLANS) {
        batch.set(adminDb.collection("subscription_plans").doc(plan.id), plan, { merge: true });
      }
      await batch.commit();
      res.json(DEFAULT_SUBSCRIPTION_PLANS);
    } catch (err: any) {
      console.warn("Failed loading subscription plans, serving defaults:", err?.message);
      res.json(DEFAULT_SUBSCRIPTION_PLANS);
    }
  })
);

// Admin-only: adjust pricing/plans. Not exposed in the app UI today; gated by a shared secret
// rather than a full admin-role system since nothing in the product currently calls this.
router.put(
  "/:planId",
  asyncHandler(async (req, res) => {
    const secret = req.headers["x-admin-secret"];
    if (!process.env.ADMIN_API_SECRET || secret !== process.env.ADMIN_API_SECRET) {
      return res.status(403).json({ error: "Forbidden." });
    }
    const plan = { ...(req.body || {}), id: req.params.planId };
    await adminDb.collection("subscription_plans").doc(req.params.planId).set(plan, { merge: true });
    res.json({ success: true });
  })
);

export default router;
