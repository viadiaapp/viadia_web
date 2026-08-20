import { SubscriptionTierType } from '../types';

export type UserTier = SubscriptionTierType | 'lifetime' | 'free';

const TIER_STORAGE_KEY = 'viadia_user_tier';
const SUB_START_KEY = 'viadia_sub_start_date';
const SUB_END_KEY = 'viadia_sub_end_date';

export function getUserTier(): UserTier {
  try {
    const saved = localStorage.getItem(TIER_STORAGE_KEY) as UserTier;
    if (saved && saved !== 'free') {
      if (saved === 'lifetime' || isSubscriptionActive()) {
        return saved;
      }
      return 'free';
    }
    return 'free';
  } catch (e) {
    return 'free';
  }
}

export function getSubscriptionStartDate(): string | null {
  try {
    return localStorage.getItem(SUB_START_KEY);
  } catch (e) {
    return null;
  }
}

export function getSubscriptionEndDate(): string | null {
  try {
    const rawTier = localStorage.getItem(TIER_STORAGE_KEY);
    if (rawTier === 'lifetime') {
      return '2099-12-31';
    }
    const saved = localStorage.getItem(SUB_END_KEY);
    return saved;
  } catch (e) {
    return null;
  }
}

export function isSubscriptionActive(customEndDate?: string | null): boolean {
  try {
    const rawTier = localStorage.getItem(TIER_STORAGE_KEY);
    if (rawTier === 'lifetime') {
      return true;
    }

    const endDateStr = customEndDate !== undefined ? customEndDate : getSubscriptionEndDate();
    if (!endDateStr) {
      return false;
    }

    if (endDateStr.startsWith('2099')) {
      return true;
    }

    // Compare with current local date
    const now = new Date();
    const end = new Date(endDateStr);
    if (isNaN(end.getTime())) {
      return false;
    }
    // Set time to end of that day (23:59:59.999) to cover all of that day
    end.setHours(23, 59, 59, 999);
    return now.getTime() <= end.getTime();
  } catch (e) {
    return false;
  }
}

export function isLifetimePass(): boolean {
  const curTier = getUserTier();
  const curEnd = getSubscriptionEndDate();
  return (
    (curTier === 'lifetime' || (curEnd?.startsWith('2099') ?? false)) &&
    !['1_year', '2_year', '3_year', '5_year'].includes(curTier)
  );
}

export function setUserSubscription(subscription: {
  tier: UserTier;
  startDate?: string;
  endDate?: string;
}): void {
  try {
    const isLife = subscription.tier === 'lifetime';
    const effectiveEndDate = isLife ? '2099-12-31' : subscription.endDate;

    localStorage.setItem(TIER_STORAGE_KEY, subscription.tier);
    if (subscription.startDate) {
      localStorage.setItem(SUB_START_KEY, subscription.startDate);
    } else {
      localStorage.removeItem(SUB_START_KEY);
    }

    if (effectiveEndDate) {
      localStorage.setItem(SUB_END_KEY, effectiveEndDate);
    } else {
      localStorage.removeItem(SUB_END_KEY);
    }

    window.dispatchEvent(
      new CustomEvent('viadia_tier_change', {
        detail: {
          tier: subscription.tier,
          startDate: subscription.startDate,
          endDate: effectiveEndDate,
        },
      })
    );
  } catch (e) {
    console.error('Failed to save user subscription:', e);
  }
}

export function setUserTier(tier: UserTier): void {
  const isLife = tier === 'lifetime';
  const nowStr = new Date().toISOString().split('T')[0];
  const endStr = isLife ? '2099-12-31' : tier === 'free' ? '' : undefined;

  setUserSubscription({
    tier,
    startDate: tier !== 'free' ? nowStr : undefined,
    endDate: endStr,
  });
}

export function subscribeToTierChange(callback: (tier: UserTier) => void): () => void {
  const handler = (e: Event) => {
    const customEv = e as CustomEvent;
    if (customEv.detail?.tier) {
      callback(customEv.detail.tier);
    } else {
      callback(getUserTier());
    }
  };

  window.addEventListener('viadia_tier_change', handler);
  window.addEventListener('storage', handler);

  return () => {
    window.removeEventListener('viadia_tier_change', handler);
    window.removeEventListener('storage', handler);
  };
}

