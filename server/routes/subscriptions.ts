import { Router } from "express";
import { adminDb } from "../firebaseAdmin";
import { DEFAULT_SUBSCRIPTION_PLANS } from "../data/subscriptionPlans";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

const PLAN_ORDER = ["1_year", "2_year", "3_year", "5_year", "lifetime"];

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    try {
      const snap = await adminDb.collection("subscription_types").get();
      if (!snap.empty) {
        const plans = snap.docs.map((d) => d.data());
        plans.sort((a: any, b: any) => PLAN_ORDER.indexOf(a.planId) - PLAN_ORDER.indexOf(b.planId));
        return res.json(plans);
      }
      // Seed Firestore with the default plans the first time this is called.
      const batch = adminDb.batch();
      for (const plan of DEFAULT_SUBSCRIPTION_PLANS) {
        batch.set(adminDb.collection("subscription_types").doc(plan.planId), plan, { merge: true });
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
    const plan = { ...(req.body || {}), planId: req.params.planId };
    await adminDb.collection("subscription_types").doc(req.params.planId).set(plan, { merge: true });
    res.json({ success: true });
  })
);

async function resolveUserCode(uid: string | undefined): Promise<string | null> {
  if (!uid) return null;
  const snap = await adminDb.collection("users").doc(uid).get();
  return snap.exists ? snap.data()?.userCode || null : null;
}

// Read-only: the caller's own current subscription state (user_subscriptions/{userCode}).
// Matches lib/db.ts's getUserSubscription. No generic write endpoint here -- see
// /me/normalize-lifetime below for the one narrow, safe write this collection actually needs from
// the client. A generic "set my own subscription state" endpoint would let a user set
// isActive/planId/effectiveEndDate directly, exactly the fields real purchases grant via
// services/subscriptionService.ts's recordPurchaseAttempt + applySuccessfulTransaction --
// i.e. grant themselves free access.
router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userCode = await resolveUserCode(req.uid);
    if (!userCode) return res.status(400).json({ error: "This account has no userCode assigned yet." });

    const snap = await adminDb.collection("user_subscriptions").doc(userCode).get();
    res.json(snap.exists ? snap.data() : null);
  })
);

// Narrow, purpose-built write: fixes an old data-format inconsistency where some lifetime
// subscriptions were stored with an arbitrary end date instead of the canonical '2099-12-31'
// sentinel. Deliberately not a generic update endpoint -- takes no body at all, and the
// qualifying condition (does this user's EXISTING subscription already look like a lifetime
// plan?) is re-derived here from the current Firestore doc, never trusted from the client. This
// can only ever normalize an end date on a subscription that was already effectively lifetime;
// it cannot grant, activate, or upgrade anything. Matches the one real caller in
// LifetimePassModal.tsx's saveUserSubscriptionRecord usage.
router.post(
  "/me/normalize-lifetime",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userCode = await resolveUserCode(req.uid);
    if (!userCode) return res.status(400).json({ error: "This account has no userCode assigned yet." });

    const subRef = adminDb.collection("user_subscriptions").doc(userCode);
    const snap = await subRef.get();
    if (!snap.exists) return res.json({ success: false, reason: "No subscription on file." });

    const sub = snap.data()!;
    const isDetailLife = sub.planId === "lifetime" || (typeof sub.effectiveEndDate === "string" && sub.effectiveEndDate.startsWith("2099"));
    if (!sub.isActive || !isDetailLife) {
      return res.json({ success: false, reason: "Not an active lifetime subscription -- nothing to normalize." });
    }
    if (sub.effectiveEndDate === "2099-12-31" && sub.planId === "lifetime") {
      return res.json({ success: true, reason: "Already normalized." });
    }

    await subRef.set({ planId: "lifetime", effectiveEndDate: "2099-12-31" }, { merge: true });
    res.json({ success: true });
  })
);

export default router;
