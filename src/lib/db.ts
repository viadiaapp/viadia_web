import { authFetch, ApiError } from './apiClient';
import { auth } from './auth';
import {
  UserDetails,
  UserConfig,
  Trip,
  ChecklistItem,
  UserTripcodeMaster,
  TripMaster,
  TripStylingData,
  SubscriptionPlan,
  SubscriptionTransaction,
} from '../types';
import { staticCurrenciesSeed, StaticCurrency } from '../data/staticCurrencies';
import { DEFAULT_SUBSCRIPTION_PLANS } from '../data/seedSubscriptionPlans';
import { setUserTier, setUserSubscription, isSubscriptionActive } from './userSubscription';
import { optimizeTripForFirestore } from './imageUtils';

// All Firestore access now goes through the backend (server/) via authFetch, which attaches the
// signed-in user's Firebase ID token. The localStorage cache below is kept purely as an offline/
// read fallback UX layer, same as before — it's no longer a write queue (that was previously
// provided by the Firestore SDK's own offline persistence, which direct client access is what we're
// removing here).

const LOCAL_PREFIX = 'nomadsync_offline_fs_';

function getLocalCache<T>(key: string): T | null {
  try {
    const data = localStorage.getItem(LOCAL_PREFIX + key);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.warn('Failed to read from local cache:', e);
    return null;
  }
}

function setLocalCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.warn('Failed to write to local cache:', e);
  }
}

function removeLocalCache(key: string): void {
  try {
    localStorage.removeItem(LOCAL_PREFIX + key);
  } catch (e) {
    console.warn('Failed to remove from local cache:', e);
  }
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof ApiError) return false;
  return true;
}

// Generate a deterministic 6-digit fallback user code from UID
export function getDeterministicUserCode(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  }
  const positiveHash = Math.abs(hash);
  const digits = (positiveHash % 900000) + 100000;
  return 'UA' + digits;
}

// 1. Fetch all trip masters/trips owned by the signed-in user
export async function getTripMastersByOwnerUid(_ownerUid: string): Promise<TripMaster[]> {
  try {
    return await authFetch<TripMaster[]>('/api/trips/owned/masters');
  } catch (error) {
    console.warn('getTripMastersByOwnerUid failed:', error);
    return [];
  }
}

export async function getTripsByOwnerUid(_ownerUid: string): Promise<Trip[]> {
  try {
    return await authFetch<Trip[]>('/api/trips/owned');
  } catch (error) {
    console.warn('getTripsByOwnerUid failed:', error);
    return [];
  }
}

// Fetch user tripcode master (list of trip codes created by user)
export async function getUserTripcodeMaster(userCode: string): Promise<string[]> {
  try {
    const data = await authFetch<UserTripcodeMaster>(`/api/users/tripcodes/${encodeURIComponent(userCode)}`);
    const codes = data?.tripCodes || [];
    setLocalCache(`user_tripcode_master_${userCode}`, codes);
    return codes;
  } catch (error) {
    console.warn('getUserTripcodeMaster failed, checking offline cache:', error);
    return getLocalCache<string[]>(`user_tripcode_master_${userCode}`) || [];
  }
}

export async function saveUserTripcodeMaster(userCode: string, tripCodes: string[]): Promise<void> {
  setLocalCache(`user_tripcode_master_${userCode}`, tripCodes);
  try {
    await authFetch(`/api/users/tripcodes/${encodeURIComponent(userCode)}`, {
      method: 'PUT',
      body: JSON.stringify({ tripCodes }),
    });
  } catch (error) {
    console.warn('saveUserTripcodeMaster failed:', error);
  }
}

// Fetch trip master (contains ownerUid and allowOthersToModify)
export async function getTripMaster(tripCode: string): Promise<TripMaster | null> {
  const code = tripCode.toUpperCase().trim();
  try {
    const data = await authFetch<TripMaster>(`/api/trips/${code}/master`);
    setLocalCache(`trip_master_${code}`, data);
    return data;
  } catch (error) {
    console.warn('getTripMaster failed, checking offline cache:', error);
    return getLocalCache<TripMaster>(`trip_master_${code}`);
  }
}

export async function saveTripMaster(tripCode: string, ownerUid: string, allowOthersToModify: boolean): Promise<void> {
  const code = tripCode.toUpperCase().trim();
  try {
    const data = await authFetch<TripMaster>(`/api/trips/${code}/master`, {
      method: 'PUT',
      body: JSON.stringify({ allowOthersToModify }),
    });
    setLocalCache(`trip_master_${code}`, data);
  } catch (error) {
    console.warn('saveTripMaster failed:', error);
    setLocalCache(`trip_master_${code}`, { tripCode: code, ownerUid, allowOthersToModify });
  }
}

export async function deleteTripMaster(tripCode: string): Promise<void> {
  const code = tripCode.toUpperCase().trim();
  removeLocalCache(`trip_master_${code}`);
  try {
    await authFetch(`/api/trips/${code}/master`, { method: 'DELETE' });
  } catch (error) {
    console.warn('deleteTripMaster failed:', error);
  }
}

// 2. Fetch User Details (own full profile, or a public-safe subset for any other uid)
export async function getUserDetails(uid: string): Promise<UserDetails | null> {
  try {
    const data = await authFetch<UserDetails>(`/api/users/${encodeURIComponent(uid)}`);
    setLocalCache(`users_${uid}`, data);
    if (data.email) setLocalCache(`users_email_${data.email}`, data);

    if (data.sub_end_date || data.sub_start_date || data.subscription_tier || data.userTier) {
      syncLocalSubscriptionFromUser(data);
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    console.warn('getUserDetails failed, checking offline cache:', error);
    return getLocalCache<UserDetails>(`users_${uid}`);
  }
}

export async function getUserDetailsByUserCode(userCode: string): Promise<UserDetails | null> {
  try {
    const data = await authFetch<UserDetails | null>(`/api/users/lookup/by-code/${encodeURIComponent(userCode)}`);
    if (data) setLocalCache(`users_${data.uid}`, data);
    return data;
  } catch (error) {
    console.warn('getUserDetailsByUserCode failed:', error);
    return null;
  }
}

// 3. Fetch current signed-in user's details by their own (verified) email
export async function getUserDetailsByEmail(_email: string): Promise<UserDetails | null> {
  try {
    const data = await authFetch<UserDetails | null>('/api/users/lookup/by-email');
    if (data) {
      setLocalCache(`users_${data.uid}`, data);
      if (data.email) setLocalCache(`users_email_${data.email}`, data);
      syncLocalSubscriptionFromUser(data);
    }
    return data;
  } catch (error) {
    console.warn('getUserDetailsByEmail failed, checking offline cache:', error);
    return getLocalCache<UserDetails>(`users_email_${_email}`);
  }
}

function syncLocalSubscriptionFromUser(data: UserDetails) {
  const rawTier = data.subscription_tier || data.userTier;
  const isLife = rawTier === 'lifetime' || (data.sub_end_date?.startsWith('2099') ?? false);
  const resolvedEndDate = isLife ? '2099-12-31' : data.sub_end_date;
  const isActive = isLife || isSubscriptionActive(resolvedEndDate);
  const resolvedTier = isActive ? (isLife ? 'lifetime' : rawTier && rawTier !== 'free' ? rawTier : 'lifetime') : 'free';
  setUserSubscription({ tier: resolvedTier as any, startDate: data.sub_start_date, endDate: resolvedEndDate });
}

// 4. Save (own) User Details — subscription/tier fields are ignored server-side; they can only be
// changed by a verified payment (see LifetimePassModal / server/routes/payments.ts).
export async function saveUserDetails(uid: string, details: UserDetails): Promise<void> {
  const fullDetails: UserDetails = { ...details, uid };

  setLocalCache(`users_${uid}`, fullDetails);
  if (fullDetails.email) setLocalCache(`users_email_${fullDetails.email}`, fullDetails);

  try {
    const saved = await authFetch<UserDetails>('/api/users/me', {
      method: 'PUT',
      body: JSON.stringify(fullDetails),
    });
    setLocalCache(`users_${uid}`, saved);
    if (saved.email) setLocalCache(`users_email_${saved.email}`, saved);
  } catch (error) {
    console.warn('saveUserDetails failed (offline/network), saved to cache only:', error);
  }
}

// Reactivate the current signed-in user's account if it was previously deleted
export async function reactivateAccountIfDeleted(_email: string, _currentUid: string): Promise<UserDetails | null> {
  try {
    const reactivated = await authFetch<UserDetails | null>('/api/users/reactivate', { method: 'POST' });
    if (reactivated) {
      setUserTier((reactivated.subscription_tier || (reactivated.adTier ? 'lifetime' : 'free')) as any);
    }
    return reactivated;
  } catch (err) {
    console.error('Error during account reactivation:', err);
    return null;
  }
}

// 5. Fetch User Configuration (Checklist and Permissions) by userCode
export async function getUserConfig(userCode: string): Promise<UserConfig | null> {
  try {
    const data = await authFetch<UserConfig>(`/api/users/config/${encodeURIComponent(userCode)}`);
    setLocalCache(`user_configs_${userCode}`, data);
    return data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    console.warn('getUserConfig failed, checking offline cache:', error);
    return getLocalCache<UserConfig>(`user_configs_${userCode}`);
  }
}

// 6. Save User Configuration
export async function saveUserConfig(userCode: string, config: UserConfig): Promise<void> {
  setLocalCache(`user_configs_${userCode}`, config);
  try {
    await authFetch(`/api/users/config/${encodeURIComponent(userCode)}`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  } catch (error) {
    console.warn('saveUserConfig failed (offline/network), saved to cache:', error);
  }
}

// 7. Fetch Trip by Trip Code (6-character uppercase string)
export async function getTripFromDB(tripCode: string): Promise<Trip | null> {
  const code = tripCode.toUpperCase().trim();
  try {
    const data = await authFetch<Trip>(`/api/trips/${code}`);
    setLocalCache(`trips_${code}`, data);
    return data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    console.warn('getTripFromDB failed, checking offline cache:', error);
    return getLocalCache<Trip>(`trips_${code}`);
  }
}

// 8. Save/Update Trip in DB
export async function saveTripToDB(tripCode: string, trip: Trip): Promise<void> {
  const code = tripCode.toUpperCase().trim();
  const tripToSave = { ...trip, code };
  delete (tripToSave as any).allowOthersToModify;

  setLocalCache(`trips_${code}`, tripToSave);
  try {
    const optimizedTrip = await optimizeTripForFirestore(tripToSave);
    await authFetch(`/api/trips/${code}`, { method: 'PUT', body: JSON.stringify(optimizedTrip) });
  } catch (error) {
    console.warn('saveTripToDB failed (offline/network), saved to cache:', error);
    if (!isNetworkError(error)) throw error;
  }
}

// 9. Delete Trip from DB
export async function deleteTripFromDB(tripCode: string): Promise<void> {
  const code = tripCode.toUpperCase().trim();
  removeLocalCache(`trips_${code}`);
  removeLocalCache(`trip_gclist_styling_${code}`);
  try {
    await authFetch(`/api/trips/${code}`, { method: 'DELETE' });
  } catch (error) {
    console.warn('deleteTripFromDB failed:', error);
  }
}

export async function deleteTripGclistStyling(tripCode: string): Promise<void> {
  if (!tripCode) return;
  const code = tripCode.toUpperCase().trim();
  removeLocalCache(`trip_gclist_styling_${code}`);
  try {
    await authFetch(`/api/trips/${code}/gclist-styling`, { method: 'DELETE' });
  } catch (error) {
    console.warn('deleteTripGclistStyling failed:', error);
  }
}

// 10. Static country/currency metadata (bundled locally — no network needed)
export async function getStaticCurrencies(): Promise<StaticCurrency[]> {
  return staticCurrenciesSeed;
}

// 10b. Trip checklist + day styling entry for a trip code
export async function getTripGclistStyling(tripCode: string): Promise<[ChecklistItem[], TripStylingData] | null> {
  if (!tripCode) return null;
  const code = tripCode.toUpperCase().trim();
  const cacheKey = `trip_gclist_styling_${code}`;
  try {
    const data = await authFetch<{ gclist?: ChecklistItem[]; styling?: TripStylingData }>(`/api/trips/${code}/gclist-styling`);
    const list: [ChecklistItem[], TripStylingData] = [data.gclist || [], data.styling || { days: {} }];
    setLocalCache(cacheKey, list);
    return list;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    console.warn('getTripGclistStyling failed, checking offline cache:', error);
    return getLocalCache<[ChecklistItem[], TripStylingData]>(cacheKey);
  }
}

export async function saveTripGclistStyling(tripCode: string, dataList: [ChecklistItem[], TripStylingData]): Promise<void> {
  if (!tripCode) return;
  const code = tripCode.toUpperCase().trim();
  setLocalCache(`trip_gclist_styling_${code}`, dataList);
  try {
    await authFetch(`/api/trips/${code}/gclist-styling`, {
      method: 'PUT',
      body: JSON.stringify({ gclist: dataList[0], styling: dataList[1] }),
    });
  } catch (error) {
    console.warn('saveTripGclistStyling failed (offline/network), saved to cache:', error);
  }
}

export async function initTripGclistStyling(tripCode: string, masterGlobalChecklist: ChecklistItem[]): Promise<[ChecklistItem[], TripStylingData]> {
  if (!tripCode) return [masterGlobalChecklist || [], { days: {} }];
  const existing = await getTripGclistStyling(tripCode);
  if (existing) return existing;
  const gcCopy: ChecklistItem[] = (masterGlobalChecklist || []).map((item) => ({
    ...item,
    id: item.id || `glob-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    checked: false,
  }));
  const initialDataList: [ChecklistItem[], TripStylingData] = [gcCopy, { days: {} }];
  await saveTripGclistStyling(tripCode, initialDataList);
  return initialDataList;
}

// 11. Delete the current signed-in user's account & data (server also preserves userCode/license in deleted_users)
export async function deleteUserAccountData(_uid: string, _userCode?: string | null): Promise<void> {
  try {
    await authFetch('/api/users/me', { method: 'DELETE' });
  } catch (error) {
    console.error('Error during deleteUserAccountData:', error);
  } finally {
    await auth.signOut().catch(() => {});
  }
}

export interface InboundMessageData {
  id?: string;
  name?: string;
  email?: string;
  subject?: string;
  message: string;
  userCode?: string;
  uid?: string;
  createdAt?: string;
  IsResolved?: boolean;
  Response?: string;
}

export async function sendInboundMessage(data: InboundMessageData): Promise<void> {
  try {
    await authFetch('/api/messages', { method: 'POST', body: JSON.stringify(data) });
  } catch (err) {
    console.warn('Failed to send inbound message, storing in local fallback:', err);
    try {
      const existing = JSON.parse(localStorage.getItem('inbound_messages_backup') || '[]');
      existing.push(data);
      localStorage.setItem('inbound_messages_backup', JSON.stringify(existing));
    } catch (e) {
      console.warn('Local storage fallback error:', e);
    }
  }
}

// ----------------------------------------------------
// SUBSCRIPTION PLANS
// ----------------------------------------------------

export async function getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const cacheKey = 'subscription_plans_list';
  try {
    const plans = await authFetch<SubscriptionPlan[]>('/api/subscriptions');
    setLocalCache(cacheKey, plans);
    return plans;
  } catch (error) {
    console.warn('getSubscriptionPlans failed, falling back to local defaults:', error);
    const cached = getLocalCache<SubscriptionPlan[]>(cacheKey);
    return cached && cached.length > 0 ? cached : DEFAULT_SUBSCRIPTION_PLANS;
  }
}

// Admin-only (not used by the app UI) — requires the server's ADMIN_API_SECRET, not exposed here.
export async function saveSubscriptionPlan(plan: SubscriptionPlan): Promise<void> {
  await authFetch(`/api/subscriptions/${encodeURIComponent(plan.id)}`, { method: 'PUT', body: JSON.stringify(plan) });
}

export async function seedSubscriptionPlansIfEmpty(): Promise<SubscriptionPlan[]> {
  // The backend seeds Firestore automatically the first time plans are requested.
  return getSubscriptionPlans();
}

// ----------------------------------------------------
// SUBSCRIPTION TRANSACTIONS
// ----------------------------------------------------

export async function recordTransaction(transactionData: Omit<SubscriptionTransaction, 'id'> | SubscriptionTransaction): Promise<SubscriptionTransaction> {
  try {
    const saved = await authFetch<SubscriptionTransaction>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(transactionData),
    });
    return saved;
  } catch (error) {
    console.warn('Failed persisting transaction:', error);
    return { ...transactionData, id: transactionData.transactionId } as SubscriptionTransaction;
  }
}

export async function getTransactionsByUserCode(userCode: string): Promise<SubscriptionTransaction[]> {
  if (!userCode) return [];
  const userCodeKey = `user_transactions_${userCode}`;
  try {
    const transactions = await authFetch<SubscriptionTransaction[]>(`/api/transactions/by-user-code/${encodeURIComponent(userCode)}`);
    setLocalCache(userCodeKey, transactions);
    return transactions;
  } catch (error) {
    console.warn('getTransactionsByUserCode failed, checking cache:', error);
    return getLocalCache<SubscriptionTransaction[]>(userCodeKey) || [];
  }
}

export async function getTransactionsByUid(_uid: string): Promise<SubscriptionTransaction[]> {
  try {
    return await authFetch<SubscriptionTransaction[]>('/api/transactions/mine');
  } catch (error) {
    console.warn('getTransactionsByUid failed:', error);
    return [];
  }
}

// Allocates the next sequential app user code (e.g. UA000001)
export async function generateNextUserCode(): Promise<string> {
  try {
    const { userCode } = await authFetch<{ userCode: string }>('/api/users/next-code', { method: 'POST' });
    return userCode;
  } catch (error) {
    console.warn('generateNextUserCode failed, using random fallback:', error);
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    return `UA${randomDigits}`;
  }
}
