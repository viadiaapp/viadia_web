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

// Same generation scheme as the client used to use for generateSubscriptionCode() -- kept
// identical so historical subscriptionCodes and new ones look the same. No Firestore
// counter/transaction needed since collisions are astronomically unlikely (ms-precision timestamp
// + 4 random base36 chars) and this ledger is append-only.
function generateSubscriptionCode(): string {
  return `SUB${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

// STEP 1 of 2, and ALWAYS the first thing called after a payment gateway/API call returns --
// whether it succeeded or failed. Every attempt gets its own ledger entry in
// subscription_transaction_master, so failures are just as visible/auditable as successes,
// never silently dropped.
//
// Idempotent on already-COMPLETED orderIds only: if a completed transaction already exists for
// this orderId, returns it unchanged rather than writing a duplicate -- this covers /verify and
// /webhook both trying to process the same successful payment. A prior FAILED attempt never
// blocks a later attempt for the same orderId from succeeding -- Razorpay itself can send a
// payment.failed webhook followed later by payment.captured for the same order on a
// user-initiated retry (e.g. wrong UPI PIN, then correct PIN).
export async function recordPurchaseAttempt(params: {
  userCode: string;
  planId: string;
  orderId: string;
  paymentId?: string;
  paymentMethod: string;
  amountPaid?: number;
  currency?: string;
  status: "completed" | "failed";
  failureReason?: string;
}): Promise<{ subscriptionCode: string; status: "completed" | "failed"; alreadyProcessed: boolean }> {
  const { userCode, planId, orderId, paymentId, paymentMethod, amountPaid, currency, status, failureReason } = params;

  if (status === "completed") {
    const existingQuery = await adminDb
      .collection("subscription_transaction_master")
      .where("orderId", "==", orderId)
      .where("status", "==", "completed")
      .limit(1)
      .get();
    if (!existingQuery.empty) {
      const existing = existingQuery.docs[0].data();
      return { subscriptionCode: existing.subscriptionCode, status: "completed", alreadyProcessed: true };
    }
  }

  const subscriptionCode = generateSubscriptionCode();
  const now = new Date().toISOString();
  await adminDb
    .collection("subscription_transaction_master")
    .doc(subscriptionCode)
    .set(
      {
        subscriptionCode,
        userCode,
        planId,
        orderId,
        transactionId: paymentId || subscriptionCode,
        paymentMethod,
        amountPaid: amountPaid ?? null,
        currency: currency ?? null,
        status,
        failureReason: failureReason ?? null,
        createdAt: now,
      },
      { merge: true }
    );

  return { subscriptionCode, status, alreadyProcessed: false };
}

// STEP 2 of 2 -- ONLY ever called after recordPurchaseAttempt returns status 'completed'. Computes
// the new subscription window (extending from the current end date if still active, or starting
// fresh from today otherwise) and updates the user's current-subscription pointer. This is the
// only function in the app that actually grants paid access.
export async function applySuccessfulTransaction(params: {
  userCode: string;
  planId: string;
  subscriptionCode: string;
}): Promise<{ planId: string; startDate: string; endDate: string; subscriptionCode: string }> {
  const { userCode, planId, subscriptionCode } = params;

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

  await subRef.set(
    {
      userCode,
      subscriptionCode,
      planId: plan.planId,
      effectiveStartDate: startDate,
      effectiveEndDate: endDate,
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return { planId: plan.planId, startDate, endDate, subscriptionCode };
}

// Used only for the alreadyProcessed branch of recordPurchaseAttempt -- when a completed
// transaction already exists for this orderId (e.g. /verify and /webhook both processing the
// same successful payment, or a client retry), applySuccessfulTransaction must NOT be called
// again (it would double-extend the subscription window for one payment). This just reads back
// the state that was already granted the first time.
export async function getCurrentSubscriptionState(userCode: string): Promise<{ planId: string; startDate: string; endDate: string; subscriptionCode: string } | null> {
  const subSnap = await adminDb.collection("user_subscriptions").doc(userCode).get();
  if (!subSnap.exists) return null;
  const sub = subSnap.data()!;
  return {
    planId: sub.planId,
    startDate: sub.effectiveStartDate,
    endDate: sub.effectiveEndDate,
    subscriptionCode: sub.subscriptionCode,
  };
}
