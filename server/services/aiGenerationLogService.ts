import { adminDb } from "../firebaseAdmin";

export type GenerationLogType = "free" | "reward";

function todayUtcDate(): string {
  return new Date().toISOString().split("T")[0];
}

function getDailyFreeLimit(): number {
  const raw = process.env.DAILY_GEMINI_GENERATIONS_FREE;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 2; // default: 2 free generations/day
}

function getMaxRewardedPerDay(): number | null {
  const raw = process.env.MAX_REWARDED_ADS_FOR_PLAN_GEN_PER_DAY;
  if (!raw || !raw.trim()) return null; // unset = unlimited
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

interface TodayUsage {
  freeCount: number;
  rewardCount: number;
}

// Counts today's (UTC) log entries by type for a user -- filters on date only (a single-field
// equality filter, always auto-indexed by Firestore) and counts the free/reward breakdown in
// application code, rather than a compound query that would need a composite index deployed.
async function getTodayUsage(userCode: string): Promise<TodayUsage> {
  const today = todayUtcDate();
  const snap = await adminDb
    .collection("ai_generation_log")
    .doc(userCode)
    .collection("entries")
    .where("date", "==", today)
    .get();

  let freeCount = 0;
  let rewardCount = 0;
  for (const doc of snap.docs) {
    const type = doc.data().type;
    if (type === "free") freeCount++;
    else if (type === "reward") rewardCount++;
  }
  return { freeCount, rewardCount };
}

// Separate from the append-only usage log above: a single mutable per-user document tracking how
// many watched-but-not-yet-spent rewarded-ad credits are available right now. The SSV callback
// increments this when an ad watch is verified; a reward-type generation decrements it. This is
// what actually distinguishes "granted a credit" from "spent a credit" -- the log alone can't,
// since both would otherwise look like the same single 'reward' entry for the day.
function creditsDocRef(userCode: string) {
  return adminDb.collection("ai_reward_credits").doc(userCode);
}

async function getAvailableCredits(userCode: string): Promise<number> {
  const snap = await creditsDocRef(userCode).get();
  if (!snap.exists) return 0;
  const data = snap.data()!;
  // Self-resetting, same pattern as the log: a credit document from a previous day is treated as
  // having zero credits today, no separate cleanup job needed.
  if (data.date !== todayUtcDate()) return 0;
  return typeof data.availableCredits === "number" ? data.availableCredits : 0;
}

// Called by the SSV callback once a rewarded-ad watch is verified -- grants one spendable credit
// for today. Does NOT write to the usage log itself; the log only records actual generations.
export async function grantRewardCredit(userCode: string): Promise<void> {
  const ref = creditsDocRef(userCode);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const today = todayUtcDate();
    const current = snap.exists && snap.data()!.date === today ? (snap.data()!.availableCredits || 0) : 0;
    tx.set(ref, { date: today, availableCredits: current + 1 }, { merge: false });
  });
}

async function spendRewardCredit(userCode: string): Promise<boolean> {
  const ref = creditsDocRef(userCode);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const today = todayUtcDate();
    const current = snap.exists && snap.data()!.date === today ? (snap.data()!.availableCredits || 0) : 0;
    if (current <= 0) return false;
    tx.set(ref, { date: today, availableCredits: current - 1 }, { merge: false });
    return true;
  });
}

export type GenerationPermission =
  | { allowed: true; type: GenerationLogType }
  | { allowed: false; reason: "daily_limit_reached" | "no_reward_credit" };

// Whether this user can generate right now, and if so, whether it should be logged/counted as a
// free or reward-unlocked generation. A reward-type generation additionally requires (and
// atomically spends) an actual unspent credit from a previously verified ad watch -- there's no
// "reward slot is open, go ahead" without one.
export async function checkAndReserveGenerationSlot(userCode: string): Promise<GenerationPermission> {
  const usage = await getTodayUsage(userCode);
  const freeLimit = getDailyFreeLimit();

  if (usage.freeCount < freeLimit) {
    return { allowed: true, type: "free" };
  }

  const rewardLimit = getMaxRewardedPerDay();
  if (rewardLimit !== null && usage.rewardCount >= rewardLimit) {
    return { allowed: false, reason: "daily_limit_reached" };
  }

  const spent = await spendRewardCredit(userCode);
  if (!spent) {
    return { allowed: false, reason: "no_reward_credit" };
  }
  return { allowed: true, type: "reward" };
}

// Records a successful generation -- only ever called after Gemini actually returns a usable
// result, never on a failed attempt, per the "failures don't cost the user anything" design.
// `type` should be whatever checkAndReserveGenerationSlot returned, so the log accurately
// reflects how each generation was authorized.
export async function logGeneration(userCode: string, type: GenerationLogType, feature = "plan"): Promise<void> {
  await adminDb
    .collection("ai_generation_log")
    .doc(userCode)
    .collection("entries")
    .add({
      date: todayUtcDate(),
      type,
      feature,
      timestamp: new Date().toISOString(),
    });
}

export async function getAvailableRewardCredits(userCode: string): Promise<number> {
  return getAvailableCredits(userCode);
}

export interface QuotaStatus {
  freeRemaining: number;
  freeLimit: number;
  hasRewardCredit: boolean;
  rewardLimitReached: boolean; // true if MAX_REWARDED_ADS_FOR_PLAN_GEN_PER_DAY is set and hit
}

// Read-only -- unlike checkAndReserveGenerationSlot, this never spends a credit. For the frontend
// to decide what to show (a plain "Generate" button vs. "Watch an ad to generate") before the
// user commits to an attempt.
export async function getQuotaStatus(userCode: string): Promise<QuotaStatus> {
  const usage = await getTodayUsage(userCode);
  const freeLimit = getDailyFreeLimit();
  const rewardLimit = getMaxRewardedPerDay();
  const availableCredits = await getAvailableCredits(userCode);

  return {
    freeRemaining: Math.max(0, freeLimit - usage.freeCount),
    freeLimit,
    hasRewardCredit: availableCredits > 0,
    rewardLimitReached: rewardLimit !== null && usage.rewardCount >= rewardLimit,
  };
}
