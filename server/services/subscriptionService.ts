import { adminDb } from "../firebaseAdmin";

// Mirrors src/types.ts#SubscriptionPlan exactly (subscription_types/{planId}).
export interface SubscriptionPlanDoc {
  planId: string;
  planName: string;
  durationYears: number;
  originalPrice: number;
  discountedPrice: number;
  currency: string;
  description?: string;
  badge?: string;
  popular?: boolean;
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

// Same generation scheme as the client's generateSubscriptionCode() in src/lib/db.ts --
// intentionally identical so a subscriptionCode looks the same regardless of which side created
// it. No Firestore counter/transaction needed since collisions are astronomically unlikely
// (ms-precision timestamp + 4 random base36 chars) and this ledger is append-only.
function generateSubscriptionCode(): string {
  return `SUB${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

// The single authoritative place a purchase turns into subscription access. Called from both the
// client-facing /verify endpoint and the server-to-server webhook, so it's idempotent: if a
// subscription_transaction_master entry already exists for this Razorpay orderId with
// status 'completed', it returns that existing state instead of granting access a second time.
export async function applyPurchasedPlan(params: {
  userCode: string;
  planId: string;
  orderId: string;
  paymentId?: string;
  paymentMethod: string;
}): Promise<{ planId: string; startDate: string; endDate: string; subscriptionCode: string }> {
  const { userCode, planId, orderId, paymentId, paymentMethod } = params;

  const existingTxnQuery = await adminDb
    .collection("subscription_transaction_master")
    .where("orderId", "==", orderId)
    .limit(1)
    .get();
  if (!existingTxnQuery.empty) {
    const existingTxn = existingTxnQuery.docs[0].data();
    if (existingTxn.status === "completed") {
      const subSnap = await adminDb.collection("user_subscriptions").doc(userCode).get();
      const sub = subSnap.exists ? subSnap.data()! : null;
      return {
        planId: existingTxn.planId,
        startDate: sub?.effectiveStartDate || existingTxn.createdAt,
        endDate: sub?.effectiveEndDate || existingTxn.createdAt,
        subscriptionCode: existingTxn.subscriptionCode,
      };
    }
  }

  const planSnap = await adminDb.collection("subscription_types").doc(planId).get();
  if (!planSnap.exists) throw new Error(`Unknown subscription plan: ${planId}`);
  const plan = planSnap.data() as SubscriptionPlanDoc;

  const subRef = adminDb.collection("user_subscriptions").doc(userCode);
  const subSnap = await subRef.get();
  const existingSub = subSnap.exists ? subSnap.data()! : null;

  const isCurrentlyActive = existingSub?.isActive === true && isActiveEndDate(existingSub?.effectiveEndDate);
  const todayStr = new Date().toISOString().split("T")[0];
  const startDate = isCurrentlyActive && existingSub?.effectiveStartDate ? existingSub.effectiveStartDate : todayStr;
  const endDate = calculateNewEndDate(plan, isCurrentlyActive ? existingSub?.effectiveEndDate : null);

  const subscriptionCode = generateSubscriptionCode();
  const now = new Date().toISOString();

  const batch = adminDb.batch();
  batch.set(
    subRef,
    {
      userCode,
      subscriptionCode,
      planId: plan.planId,
      effectiveStartDate: startDate,
      effectiveEndDate: endDate,
      isActive: true,
      createdAt: now,
    },
    { merge: true }
  );
  batch.set(
    adminDb.collection("subscription_transaction_master").doc(subscriptionCode),
    {
      subscriptionCode,
      userCode,
      amountPaid: plan.discountedPrice,
      currency: plan.currency,
      planId: plan.planId,
      transactionId: paymentId || subscriptionCode,
      orderId,
      paymentMethod,
      status: "completed",
      createdAt: now,
    },
    { merge: true }
  );
  await batch.commit();

  return { planId: plan.planId, startDate, endDate, subscriptionCode };
}
