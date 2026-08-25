import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../firebaseAdmin";

export interface SubscriptionPlanDoc {
  id: string;
  name: string;
  type: string;
  durationYears: number;
  originalPrice: number;
  discountedPrice: number;
  currency: string;
}

function isActiveEndDate(endDate?: string | null): boolean {
  if (!endDate) return false;
  if (endDate.startsWith("2099")) return true;
  const end = new Date(endDate);
  if (isNaN(end.getTime())) return false;
  end.setHours(23, 59, 59, 999);
  return Date.now() <= end.getTime();
}

export function calculateNewEndDate(plan: SubscriptionPlanDoc, currentEndDate?: string | null): string {
  if (plan.durationYears >= 90) return "2099-12-31";
  const base = isActiveEndDate(currentEndDate) ? new Date(currentEndDate as string) : new Date();
  base.setFullYear(base.getFullYear() + plan.durationYears);
  return base.toISOString().split("T")[0];
}

// The single authoritative place a purchase turns into subscription access. Called from both the
// client-facing /verify endpoint and the server-to-server webhook, so it's idempotent: if the
// transaction is already 'completed' it just returns the current state instead of re-applying it.
export async function applyPurchasedPlan(params: {
  uid: string;
  planId: string;
  orderId: string;
  paymentId?: string;
  paymentMethod: string;
  transactionId: string;
}): Promise<{ tier: string; startDate: string; endDate: string }> {
  const { uid, planId, orderId, paymentId, paymentMethod, transactionId } = params;

  return adminDb.runTransaction(async (tx) => {
    const txnRef = adminDb.collection("transactions").doc(transactionId);
    const userRef = adminDb.collection("users").doc(uid);

    const [txnSnap, userSnap] = await Promise.all([tx.get(txnRef), tx.get(userRef)]);
    const txnData = txnSnap.exists ? txnSnap.data()! : null;
    const user = userSnap.exists ? userSnap.data()! : {};

    if (txnData?.status === "completed") {
      return {
        tier: user.subscription_tier || "free",
        startDate: user.sub_start_date,
        endDate: user.sub_end_date,
      };
    }

    const planSnap = await tx.get(adminDb.collection("subscription_plans").doc(planId));
    if (!planSnap.exists) throw new Error(`Unknown subscription plan: ${planId}`);
    const plan = planSnap.data() as SubscriptionPlanDoc;

    const isCurrentlyActive = isActiveEndDate(user.sub_end_date) || user.subscription_tier === "lifetime";
    const todayStr = new Date().toISOString().split("T")[0];
    const startDate = isCurrentlyActive && user.sub_start_date ? user.sub_start_date : todayStr;
    const periodStart = isCurrentlyActive && user.sub_end_date ? user.sub_end_date : todayStr;
    const endDate = calculateNewEndDate(plan, isCurrentlyActive ? user.sub_end_date : null);

    tx.set(
      userRef,
      {
        subscription_tier: plan.type,
        userTier: plan.type,
        sub_start_date: startDate,
        sub_end_date: endDate,
        adTier: true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    tx.set(
      txnRef,
      {
        id: transactionId,
        transactionId,
        uid,
        userCode: user.userCode || null,
        userEmail: user.email || null,
        userName: user.name || "Traveler",
        planId: plan.id,
        planName: plan.name,
        planType: plan.type,
        durationYears: plan.durationYears,
        amountPaid: plan.discountedPrice,
        originalPrice: plan.originalPrice,
        currency: plan.currency,
        planStartDate: periodStart,
        planEndDate: endDate,
        paymentMethod,
        orderId,
        paymentId: paymentId || null,
        status: "completed",
        createdAt: txnData?.createdAt || new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return { tier: plan.type, startDate, endDate };
  });
}
