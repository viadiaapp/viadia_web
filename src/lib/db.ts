import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  getDocFromCache,
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs, 
  getDocsFromCache,
  deleteDoc,
  runTransaction,
  DocumentReference,
  Query
} from 'firebase/firestore';
import { deleteUser } from 'firebase/auth';
import { db, auth, getLoginProvider } from './auth';
import { UserDetails, DeletedUserDetails, UserConfig, Trip, ChecklistItem, UserTripcodeMaster, TripMaster, StylingItem, TripStylingData, TripGclistStyling, SubscriptionPlan, SubscriptionTransaction } from '../types';
import { staticCurrenciesSeed, StaticCurrency } from '../data/staticCurrencies';
import { DEFAULT_SUBSCRIPTION_PLANS } from '../data/seedSubscriptionPlans';
import { getUserTier, setUserTier, setUserSubscription, getSubscriptionStartDate, getSubscriptionEndDate, isSubscriptionActive } from './userSubscription';
import { optimizeTripForFirestore } from './imageUtils';

export function cleanUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return null as any;
  }
  if (obj instanceof Date) {
    return obj.toISOString() as any;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => cleanUndefined(item)) as any;
  }
  if (typeof obj === 'object') {
    const clean: any = {};
    for (const key of Object.keys(obj)) {
      const val = (obj as any)[key];
      if (val !== undefined) {
        clean[key] = cleanUndefined(val);
      }
    }
    return clean as T;
  }
  return obj;
}

// Helper: Safely get doc with network timeout fallback to cache
async function safeGetDoc(docRef: DocumentReference, timeoutMs = 2500) {
  try {
    const docPromise = getDoc(docRef);
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    const result = await Promise.race([docPromise, timeoutPromise]);
    if (result) return result;
    return await getDocFromCache(docRef).catch(() => null);
  } catch (err) {
    return await getDocFromCache(docRef).catch(() => null);
  }
}

// Helper: Safely get docs with network timeout fallback to cache
async function safeGetDocs(q: Query, timeoutMs = 2500) {
  try {
    const docsPromise = getDocs(q);
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    const result = await Promise.race([docsPromise, timeoutPromise]);
    if (result) return result;
    return await getDocsFromCache(q).catch(() => null);
  } catch (err) {
    return await getDocsFromCache(q).catch(() => null);
  }
}

function isOfflineOrNetworkError(error: unknown): boolean {
  const errStr = error instanceof Error ? error.message : String(error);
  return (
    errStr.includes('offline') ||
    errStr.includes('network') ||
    errStr.includes('Failed to get document') ||
    errStr.includes('Could not reach Cloud Firestore') ||
    errStr.includes('backend') ||
    errStr.includes('unavailable') ||
    errStr.includes('code=unavailable')
  );
}

// Fetch all trip masters owned by a specific user UID
export async function getTripMastersByOwnerUid(ownerUid: string): Promise<TripMaster[]> {
  if (!ownerUid) return [];
  try {
    const colRef = collection(db, 'trip_master');
    const q = query(colRef, where('ownerUid', '==', ownerUid));
    const querySnapshot = await safeGetDocs(q);
    const masters: TripMaster[] = [];
    if (querySnapshot) {
      querySnapshot.forEach(docSnap => {
        masters.push(docSnap.data() as TripMaster);
      });
    }
    return masters;
  } catch (error) {
    console.warn('getTripMastersByOwnerUid failed:', error);
    return [];
  }
}

// Fetch all trips owned by a specific user UID directly from trips collection
export async function getTripsByOwnerUid(ownerUid: string): Promise<Trip[]> {
  if (!ownerUid) return [];
  try {
    const colRef = collection(db, 'trips');
    const q = query(colRef, where('ownerUid', '==', ownerUid));
    const querySnapshot = await safeGetDocs(q);
    const trips: Trip[] = [];
    if (querySnapshot) {
      querySnapshot.forEach(docSnap => {
        trips.push(docSnap.data() as Trip);
      });
    }
    return trips;
  } catch (error) {
    console.warn('getTripsByOwnerUid failed:', error);
    return [];
  }
}

// Fetch user tripcode master (list of trip codes created by user)
export async function getUserTripcodeMaster(userCode: string): Promise<string[]> {
  const pathName = `user_tripcode_master/${userCode}`;
  try {
    const docRef = doc(db, 'user_tripcode_master', userCode);
    const docSnap = await safeGetDoc(docRef);
    if (docSnap && docSnap.exists()) {
      const data = docSnap.data();
      const codes = data.tripCodes || [];
      setLocalCache(`user_tripcode_master_${userCode}`, codes);
      return codes;
    }
    const cached = getLocalCache<string[]>(`user_tripcode_master_${userCode}`);
    return cached || [];
  } catch (error) {
    console.warn('getUserTripcodeMaster failed, checking offline cache:', error);
    const cached = getLocalCache<string[]>(`user_tripcode_master_${userCode}`);
    return cached || [];
  }
}

// Save user tripcode master
export async function saveUserTripcodeMaster(userCode: string, tripCodes: string[]): Promise<void> {
  const pathName = `user_tripcode_master/${userCode}`;
  setLocalCache(`user_tripcode_master_${userCode}`, tripCodes);
  try {
    const docRef = doc(db, 'user_tripcode_master', userCode);
    const cleaned = cleanUndefined({
      userCode,
      tripCodes
    });
    await setDoc(docRef, cleaned, { merge: true });
  } catch (error) {
    console.warn('saveUserTripcodeMaster failed, saved to cache:', error);
    if (isOfflineOrNetworkError(error)) {
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, pathName);
  }
}

// Fetch trip master (contains ownerUid and allowOthersToModify)
export async function getTripMaster(tripCode: string): Promise<TripMaster | null> {
  const code = tripCode.toUpperCase().trim();
  const pathName = `trip_master/${code}`;
  try {
    const docRef = doc(db, 'trip_master', code);
    const docSnap = await safeGetDoc(docRef);
    if (docSnap && docSnap.exists()) {
      const data = docSnap.data() as TripMaster;
      setLocalCache(`trip_master_${code}`, data);
      return data;
    }
    const cached = getLocalCache<TripMaster>(`trip_master_${code}`);
    return cached || null;
  } catch (error) {
    console.warn('getTripMaster failed, checking offline cache:', error);
    const cached = getLocalCache<TripMaster>(`trip_master_${code}`);
    return cached || null;
  }
}

// Save trip master (ownerUid and allowOthersToModify)
export async function saveTripMaster(tripCode: string, ownerUid: string, allowOthersToModify: boolean): Promise<void> {
  const code = tripCode.toUpperCase().trim();
  const pathName = `trip_master/${code}`;
  const data: TripMaster & { dataList: [string, boolean] } = {
    tripCode: code,
    ownerUid,
    allowOthersToModify,
    dataList: [ownerUid, allowOthersToModify]
  };
  setLocalCache(`trip_master_${code}`, data);
  try {
    const docRef = doc(db, 'trip_master', code);
    const cleaned = cleanUndefined(data);
    await setDoc(docRef, cleaned, { merge: true });
  } catch (error) {
    console.warn('saveTripMaster failed, saved to cache:', error);
    if (isOfflineOrNetworkError(error)) {
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, pathName);
  }
}

// Delete trip master
export async function deleteTripMaster(tripCode: string): Promise<void> {
  const code = tripCode.toUpperCase().trim();
  const pathName = `trip_master/${code}`;
  removeLocalCache(`trip_master_${code}`);
  try {
    const docRef = doc(db, 'trip_master', code);
    await deleteDoc(docRef);
  } catch (error) {
    console.warn('deleteTripMaster failed, removed from cache:', error);
    if (isOfflineOrNetworkError(error)) {
      return;
    }
    handleFirestoreError(error, OperationType.DELETE, pathName);
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const LOCAL_PREFIX = 'nomadsync_offline_fs_';

function getLocalCache<T>(key: string): T | null {
  try {
    const data = localStorage.getItem(LOCAL_PREFIX + key);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.warn('Failed to read from local Firestore cache:', e);
    return null;
  }
}

function setLocalCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.warn('Failed to write to local Firestore cache:', e);
  }
}

function removeLocalCache(key: string): void {
  try {
    localStorage.removeItem(LOCAL_PREFIX + key);
  } catch (e) {
    console.warn('Failed to remove from local Firestore cache:', e);
  }
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

// Increment series letter code: A -> B, Z -> AA, AA -> AB
export function getNextSeriesCode(code: string): string {
  if (!code) return 'A';
  const chars = code.trim().toUpperCase().split('');
  let i = chars.length - 1;
  while (i >= 0) {
    if (chars[i] === 'Z') {
      chars[i] = 'A';
      i--;
    } else {
      chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
      return chars.join('');
    }
  }
  return 'A' + chars.join('');
}

// Generate sequential user code from series_code table in Firestore
export async function generateNextUserCode(): Promise<string> {
  const counterDocRef = doc(db, 'series_code', 'current');
  try {
    const allocatedCode = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(counterDocRef);
      let seriesCode = 'A';
      let seriesNum = 1;

      if (snap.exists()) {
        const data = snap.data();
        if (data.SERIES_CODE) seriesCode = String(data.SERIES_CODE).toUpperCase().trim();
        if (typeof data.SERIES_NUMBER === 'number' && data.SERIES_NUMBER >= 1) {
          seriesNum = Math.floor(data.SERIES_NUMBER);
        }
      }

      // Assign current series code & number (e.g., UA000001)
      const formattedNum = String(seriesNum).padStart(6, '0');
      const assignedCode = `U${seriesCode}${formattedNum}`;

      // Calculate next available values for the database
      let nextSeriesCode = seriesCode;
      let nextSeriesNum = seriesNum + 1;

      if (seriesNum >= 999999) {
        nextSeriesCode = getNextSeriesCode(seriesCode);
        nextSeriesNum = 1;
      }

      transaction.set(counterDocRef, {
        SERIES_CODE: nextSeriesCode,
        SERIES_NUMBER: nextSeriesNum,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      return assignedCode;
    });

    return allocatedCode;
  } catch (error) {
    console.warn('generateNextUserCode transaction failed, using fallback:', error);
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    return `UA${randomDigits}`;
  }
}

// 2. Fetch User Details by UID
export async function getUserDetails(uid: string): Promise<UserDetails | null> {
  const pathName = `users/${uid}`;
  try {
    const docRef = doc(db, 'users', uid);
    const docSnap = await safeGetDoc(docRef);
    if (docSnap && docSnap.exists()) {
      const data = docSnap.data() as UserDetails;
      setLocalCache(`users_${uid}`, data);
      if (data.email) {
        setLocalCache(`users_email_${data.email}`, data);
      }

      // Sync active subscription status into local store
      if (data.sub_end_date || data.sub_start_date || data.subscription_tier || data.userTier) {
        const rawTier = data.subscription_tier || data.userTier;
        const isLife = rawTier === 'lifetime' || (data.sub_end_date?.startsWith('2099') ?? false);
        const resolvedEndDate = isLife ? '2099-12-31' : data.sub_end_date;
        const isActive = isLife || isSubscriptionActive(resolvedEndDate);
        const resolvedTier = isActive
          ? (isLife ? 'lifetime' : (rawTier && rawTier !== 'free' ? rawTier : 'lifetime'))
          : 'free';
        setUserSubscription({
          tier: resolvedTier,
          startDate: data.sub_start_date,
          endDate: resolvedEndDate,
        });
      }

      return data;
    }
    const cached = getLocalCache<UserDetails>(`users_${uid}`);
    if (cached) return cached;
    return null;
  } catch (error) {
    console.warn('getUserDetails failed, checking offline cache:', error);
    const cached = getLocalCache<UserDetails>(`users_${uid}`);
    if (cached) {
      console.log('Returned cached user details for', uid);
      return cached;
    }
    return null;
  }
}

// Fetch User Details by User Code
export async function getUserDetailsByUserCode(userCode: string): Promise<UserDetails | null> {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('userCode', '==', userCode), limit(1));
    const querySnapshot = await safeGetDocs(q);
    if (querySnapshot && !querySnapshot.empty) {
      const data = querySnapshot.docs[0].data() as UserDetails;
      setLocalCache(`users_${data.uid}`, data);
      return data;
    }
    return null;
  } catch (error) {
    console.warn('getUserDetailsByUserCode failed:', error);
    return null;
  }
}

// 3. Fetch User Details by Email (Google Sign-In)
export async function getUserDetailsByEmail(email: string): Promise<UserDetails | null> {
  const pathName = 'users';
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email), limit(1));
    const querySnapshot = await safeGetDocs(q);
    if (querySnapshot && !querySnapshot.empty) {
      const data = querySnapshot.docs[0].data() as UserDetails;
      setLocalCache(`users_${data.uid}`, data);
      setLocalCache(`users_email_${email}`, data);

      if (data.sub_end_date || data.sub_start_date || data.subscription_tier || data.userTier) {
        const rawTier = data.subscription_tier || data.userTier;
        const isLife = rawTier === 'lifetime' || (data.sub_end_date?.startsWith('2099') ?? false);
        const resolvedEndDate = isLife ? '2099-12-31' : data.sub_end_date;
        const isActive = isLife || isSubscriptionActive(resolvedEndDate);
        const resolvedTier = isActive
          ? (isLife ? 'lifetime' : (rawTier && rawTier !== 'free' ? rawTier : 'lifetime'))
          : 'free';
        setUserSubscription({
          tier: resolvedTier,
          startDate: data.sub_start_date,
          endDate: resolvedEndDate,
        });
      }

      return data;
    }
    const cached = getLocalCache<UserDetails>(`users_email_${email}`);
    return cached || null;
  } catch (error) {
    console.warn('getUserDetailsByEmail failed, checking offline cache:', error);
    const cached = getLocalCache<UserDetails>(`users_email_${email}`);
    if (cached) {
      return cached;
    }
    return null;
  }
}

// 4. Save User Details
export async function saveUserDetails(uid: string, details: UserDetails): Promise<void> {
  const pathName = `users/${uid}`;
  const startDate = details.sub_start_date !== undefined ? details.sub_start_date : (getSubscriptionStartDate() || undefined);
  const endDate = details.sub_end_date !== undefined ? details.sub_end_date : (getSubscriptionEndDate() || undefined);
  const isAdFree = isSubscriptionActive(endDate);
  const tierName = details.subscription_tier || details.userTier || (isAdFree ? 'lifetime' : 'free');
  const provider = details.authProvider || getLoginProvider();

  const fullDetails: UserDetails = {
    ...details,
    uid, // Ensure UID field is stored on document
    userCode: details.userCode || null, // Ensure userCode field is stored on document
    authProvider: provider,
    adTier: isAdFree,
    userTier: tierName,
    subscription_tier: tierName,
    sub_start_date: startDate || undefined,
    sub_end_date: endDate || undefined,
    createdAt: details.createdAt || new Date().toISOString()
  };

  setLocalCache(`users_${uid}`, fullDetails);
  if (fullDetails.email) {
    setLocalCache(`users_email_${fullDetails.email}`, fullDetails);
  }
  try {
    const docRef = doc(db, 'users', uid);
    const cleanedDetails = cleanUndefined(fullDetails);
    await setDoc(docRef, cleanedDetails, { merge: true });
  } catch (error) {
    console.warn('saveUserDetails failed (offline/network), saved to cache:', error);
    if (isOfflineOrNetworkError(error)) {
      return; // Accept locally
    }
    handleFirestoreError(error, OperationType.WRITE, pathName);
  }
}

// Fetch Deleted User Details by Email
export async function getDeletedUserDetailsByEmail(email: string): Promise<DeletedUserDetails | null> {
  if (!email) return null;
  try {
    const colRef = collection(db, 'deleted_users');
    const q = query(colRef, where('email', '==', email), limit(1));
    const querySnapshot = await safeGetDocs(q);
    if (querySnapshot && !querySnapshot.empty) {
      const data = querySnapshot.docs[0].data() as DeletedUserDetails;
      setLocalCache(`deleted_users_email_${email}`, data);
      return data;
    }
    const cached = getLocalCache<DeletedUserDetails>(`deleted_users_email_${email}`);
    return cached || null;
  } catch (error) {
    console.warn('getDeletedUserDetailsByEmail failed, checking cache:', error);
    const cached = getLocalCache<DeletedUserDetails>(`deleted_users_email_${email}`);
    return cached || null;
  }
}

// Fetch Deleted User Details by UID
export async function getDeletedUserDetailsByUid(uid: string): Promise<DeletedUserDetails | null> {
  if (!uid) return null;
  try {
    const docRef = doc(db, 'deleted_users', uid);
    const docSnap = await safeGetDoc(docRef);
    if (docSnap && docSnap.exists()) {
      const data = docSnap.data() as DeletedUserDetails;
      setLocalCache(`deleted_users_${uid}`, data);
      return data;
    }
    const cached = getLocalCache<DeletedUserDetails>(`deleted_users_${uid}`);
    return cached || null;
  } catch (error) {
    console.warn('getDeletedUserDetailsByUid failed, checking cache:', error);
    const cached = getLocalCache<DeletedUserDetails>(`deleted_users_${uid}`);
    return cached || null;
  }
}

// Reactivate user if previously deleted: moves record from deleted_users back to users table
export async function reactivateAccountIfDeleted(email: string, currentUid: string): Promise<UserDetails | null> {
  if (!email) return null;
  try {
    let deletedUser = await getDeletedUserDetailsByEmail(email);
    if (!deletedUser && currentUid) {
      deletedUser = await getDeletedUserDetailsByUid(currentUid);
    }

    if (!deletedUser) {
      return null;
    }

    console.log('Found deleted user record to reactivate:', deletedUser);

    const isAdFree = deletedUser.adTier !== undefined ? deletedUser.adTier : (deletedUser.userTier === 'lifetime');
    const tierName = deletedUser.userTier || (isAdFree ? 'lifetime' : 'free');

    const reactivatedDetails: UserDetails = {
      uid: currentUid,
      email: deletedUser.email || email,
      name: deletedUser.name || 'Traveler',
      userCode: deletedUser.userCode || getDeterministicUserCode(currentUid),
      adTier: isAdFree,
      userTier: tierName,
      createdAt: deletedUser.createdAt || new Date().toISOString()
    };

    // Save back to `users` collection
    await saveUserDetails(currentUid, reactivatedDetails);

    // Remove from `deleted_users` collection
    try {
      const deletedDocUid = deletedUser.uid || currentUid;
      const delDocRef = doc(db, 'deleted_users', deletedDocUid);
      await deleteDoc(delDocRef);

      if (email) {
        try {
          const colRef = collection(db, 'deleted_users');
          const q = query(colRef, where('email', '==', email));
          const snap = await safeGetDocs(q);
          if (snap && !snap.empty) {
            for (const d of snap.docs) {
              await deleteDoc(d.ref);
            }
          }
        } catch (e) {
          console.warn('Failed cleaning up deleted_users by email:', e);
        }
      }

      removeLocalCache(`deleted_users_${deletedDocUid}`);
      if (email) removeLocalCache(`deleted_users_email_${email}`);
      if (deletedUser.uid) removeLocalCache(`deleted_users_${deletedUser.uid}`);
    } catch (delErr) {
      console.warn('Could not remove record from deleted_users:', delErr);
    }

    // Restore license in local storage
    setUserTier(isAdFree ? 'lifetime' : 'free');

    return reactivatedDetails;
  } catch (err) {
    console.error('Error during account reactivation:', err);
    return null;
  }
}

// 5. Fetch User Configuration (Checklist and Permissions) by userCode
export async function getUserConfig(userCode: string): Promise<UserConfig | null> {
  const pathName = `user_configs/${userCode}`;
  try {
    const docRef = doc(db, 'user_configs', userCode);
    const docSnap = await safeGetDoc(docRef);
    if (docSnap && docSnap.exists()) {
      const data = docSnap.data() as UserConfig;
      setLocalCache(`user_configs_${userCode}`, data);
      return data;
    }
    const cached = getLocalCache<UserConfig>(`user_configs_${userCode}`);
    return cached || null;
  } catch (error) {
    console.warn('getUserConfig failed, checking offline cache:', error);
    const cached = getLocalCache<UserConfig>(`user_configs_${userCode}`);
    if (cached) {
      return cached;
    }
    return null;
  }
}

// 6. Save User Configuration
export async function saveUserConfig(userCode: string, config: UserConfig): Promise<void> {
  const pathName = `user_configs/${userCode}`;
  setLocalCache(`user_configs_${userCode}`, config);
  try {
    const docRef = doc(db, 'user_configs', userCode);
    const cleanedConfig = cleanUndefined({
      ...config,
      updatedAt: new Date().toISOString()
    });
    await setDoc(docRef, cleanedConfig, { merge: true });
  } catch (error) {
    console.warn('saveUserConfig failed (offline/network), saved to cache:', error);
    if (isOfflineOrNetworkError(error)) {
      return; // Accept locally
    }
    handleFirestoreError(error, OperationType.WRITE, pathName);
  }
}

// 7. Fetch Trip by Trip Code (6-character uppercase string)
export async function getTripFromDB(tripCode: string): Promise<Trip | null> {
  const code = tripCode.toUpperCase().trim();
  const pathName = `trips/${code}`;
  try {
    const docRef = doc(db, 'trips', code);
    const docSnap = await safeGetDoc(docRef);
    if (docSnap && docSnap.exists()) {
      const data = docSnap.data() as Trip;
      setLocalCache(`trips_${code}`, data);
      return data;
    }
    const cached = getLocalCache<Trip>(`trips_${code}`);
    return cached || null;
  } catch (error) {
    console.warn('getTripFromDB failed, checking offline cache:', error);
    const cached = getLocalCache<Trip>(`trips_${code}`);
    if (cached) {
      return cached;
    }
    return null;
  }
}

// 8. Save/Update Trip in DB
export async function saveTripToDB(tripCode: string, trip: Trip): Promise<void> {
  const code = tripCode.toUpperCase().trim();
  const pathName = `trips/${code}`;
  const tripToSave = { ...trip, code };
  // Strip allowOthersToModify flag as it must only be stored in trip_master
  delete (tripToSave as any).allowOthersToModify;
  
  setLocalCache(`trips_${code}`, tripToSave);
  try {
    const docRef = doc(db, 'trips', code);
    const cleanedTrip = cleanUndefined(tripToSave);
    const optimizedTrip = await optimizeTripForFirestore(cleanedTrip);
    await setDoc(docRef, optimizedTrip, { merge: true });
  } catch (error) {
    console.warn('saveTripToDB failed (offline/network), saved to cache:', error);
    if (isOfflineOrNetworkError(error)) {
      return; // Accept locally
    }
    handleFirestoreError(error, OperationType.WRITE, pathName);
  }
}

// 9. Delete Trip from DB
export async function deleteTripFromDB(tripCode: string): Promise<void> {
  const code = tripCode.toUpperCase().trim();
  const pathName = `trips/${code}`;
  removeLocalCache(`trips_${code}`);
  
  // Clean up associated trip_gclist_styling entry from Firestore and local cache
  await deleteTripGclistStyling(code).catch(e => console.warn(`Error deleting trip_gclist_styling for ${code}:`, e));

  try {
    const docRef = doc(db, 'trips', code);
    await deleteDoc(docRef);
  } catch (error) {
    console.warn('deleteTripFromDB failed (offline/network), removed from cache:', error);
    if (isOfflineOrNetworkError(error)) {
      return; // Accept locally
    }
    handleFirestoreError(error, OperationType.DELETE, pathName);
  }
}

// 9b. Delete trip_gclist_styling entry for a trip code
export async function deleteTripGclistStyling(tripCode: string): Promise<void> {
  if (!tripCode) return;
  const code = tripCode.toUpperCase().trim();
  const pathName = `trip_gclist_styling/${code}`;
  removeLocalCache(`trip_gclist_styling_${code}`);
  try {
    const docRef = doc(db, 'trip_gclist_styling', code);
    await deleteDoc(docRef);
  } catch (error) {
    console.warn('deleteTripGclistStyling failed (offline/network), removed from cache:', error);
    if (isOfflineOrNetworkError(error)) {
      return; // Accept locally
    }
    handleFirestoreError(error, OperationType.DELETE, pathName);
  }
}

// 10. Fetch static country and currency metadata
export async function getStaticCurrencies(): Promise<StaticCurrency[]> {
  return staticCurrenciesSeed;
}

// 10b. Fetch trip_gclist_styling entry for a trip code
export async function getTripGclistStyling(tripCode: string): Promise<[ChecklistItem[], TripStylingData] | null> {
  if (!tripCode) return null;
  const code = tripCode.toUpperCase().trim();
  const cacheKey = `trip_gclist_styling_${code}`;
  try {
    const docRef = doc(db, 'trip_gclist_styling', code);
    const docSnap = await safeGetDoc(docRef);
    if (docSnap && docSnap.exists()) {
      const data = docSnap.data();
      let list: [ChecklistItem[], TripStylingData] | null = null;
      if (data.gclist || data.styling) {
        list = [data.gclist || [], data.styling || { days: {} }];
      } else if (Array.isArray(data.dataList) && data.dataList.length >= 2) {
        list = [data.dataList[0] || [], data.dataList[1] || { days: {} }];
      }
      if (list) {
        setLocalCache(cacheKey, list);
        return list;
      }
    }
    const cached = getLocalCache<[ChecklistItem[], TripStylingData]>(cacheKey);
    return cached || null;
  } catch (error) {
    console.warn('getTripGclistStyling failed, checking offline cache:', error);
    const cached = getLocalCache<[ChecklistItem[], TripStylingData]>(cacheKey);
    return cached || null;
  }
}

// Save trip_gclist_styling entry for a trip code
export async function saveTripGclistStyling(tripCode: string, dataList: [ChecklistItem[], TripStylingData]): Promise<void> {
  if (!tripCode) return;
  const code = tripCode.toUpperCase().trim();
  const cacheKey = `trip_gclist_styling_${code}`;
  setLocalCache(cacheKey, dataList);
  try {
    const docRef = doc(db, 'trip_gclist_styling', code);
    const cleaned = cleanUndefined({
      tripCode: code,
      gclist: dataList[0],
      styling: dataList[1],
      updatedAt: new Date().toISOString()
    });
    await setDoc(docRef, cleaned, { merge: true });
  } catch (error) {
    console.warn('saveTripGclistStyling failed (offline/network), saved to cache:', error);
    if (isOfflineOrNetworkError(error)) {
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, `trip_gclist_styling/${code}`);
  }
}

// Initialize trip_gclist_styling if missing
export async function initTripGclistStyling(tripCode: string, masterGlobalChecklist: ChecklistItem[]): Promise<[ChecklistItem[], TripStylingData]> {
  if (!tripCode) return [masterGlobalChecklist || [], { days: {} }];
  const existing = await getTripGclistStyling(tripCode);
  if (existing) {
    return existing;
  }
  const gcCopy: ChecklistItem[] = (masterGlobalChecklist || []).map(item => ({
    ...item,
    id: item.id || `glob-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    checked: false
  }));
  const initialDataList: [ChecklistItem[], TripStylingData] = [gcCopy, { days: {} }];
  await saveTripGclistStyling(tripCode, initialDataList);
  return initialDataList;
}

// 11. Delete user account data & move user record to deleted_users table to preserve userCode & license
export async function deleteUserAccountData(uid: string, userCode?: string | null): Promise<void> {
  if (!uid && !userCode) return;

  try {
    let uDetails = uid ? await getUserDetails(uid) : null;
    if (!uDetails && auth.currentUser?.email) {
      uDetails = await getUserDetailsByEmail(auth.currentUser.email);
    }

    const targetUid = uid || uDetails?.uid || auth.currentUser?.uid || '';
    const codeToDelete = userCode || uDetails?.userCode || (targetUid ? getDeterministicUserCode(targetUid) : null);
    const isAdFree = uDetails?.adTier !== undefined ? uDetails.adTier : isSubscriptionActive();
    const tierName = uDetails?.subscription_tier || uDetails?.userTier || getUserTier();

    // Create record in `deleted_users` table
    if (targetUid) {
      const deletedRecord: DeletedUserDetails = {
        uid: targetUid,
        email: uDetails?.email || auth.currentUser?.email || null,
        name: uDetails?.name || auth.currentUser?.displayName || 'Traveler',
        userCode: codeToDelete,
        adTier: isAdFree,
        userTier: tierName,
        createdAt: uDetails?.createdAt || new Date().toISOString(),
        deletedAt: new Date().toISOString()
      };

      try {
        const deletedDocRef = doc(db, 'deleted_users', targetUid);
        const cleaned = cleanUndefined(deletedRecord);
        await setDoc(deletedDocRef, cleaned, { merge: true });
        setLocalCache(`deleted_users_${targetUid}`, deletedRecord);
        if (deletedRecord.email) {
          setLocalCache(`deleted_users_email_${deletedRecord.email}`, deletedRecord);
        }
      } catch (err) {
        console.warn('Failed saving to deleted_users table:', err);
      }
    }

    const ownedTripCodes = new Set<string>();

    // Gather trips owned by UID
    if (targetUid) {
      try {
        const ownedTrips = await getTripsByOwnerUid(targetUid);
        ownedTrips.forEach(t => {
          if (t.code) ownedTripCodes.add(t.code.toUpperCase().trim());
        });
      } catch (e) {
        console.warn('Failed fetching owned trips by uid:', e);
      }

      try {
        const ownedMasters = await getTripMastersByOwnerUid(targetUid);
        ownedMasters.forEach(m => {
          if (m.tripCode) ownedTripCodes.add(m.tripCode.toUpperCase().trim());
        });
      } catch (e) {
        console.warn('Failed fetching trip masters by uid:', e);
      }
    }

    if (codeToDelete) {
      try {
        const userMasterCodes = await getUserTripcodeMaster(codeToDelete);
        userMasterCodes.forEach(c => {
          if (c) ownedTripCodes.add(c.toUpperCase().trim());
        });
      } catch (e) {
        console.warn('Failed fetching user tripcode master:', e);
      }
    }

    // Delete all user trips from `trips` and `trip_master`
    for (const tripCode of Array.from(ownedTripCodes)) {
      if (!tripCode) continue;
      await deleteTripFromDB(tripCode).catch(e => console.warn(`Error deleting trip ${tripCode}:`, e));
      await deleteTripMaster(tripCode).catch(e => console.warn(`Error deleting trip_master ${tripCode}:`, e));
    }

    // Delete user_tripcode_master & user_configs if codeToDelete exists
    if (codeToDelete) {
      try {
        const tcmRef = doc(db, 'user_tripcode_master', codeToDelete);
        await deleteDoc(tcmRef);
        removeLocalCache(`user_tripcode_master_${codeToDelete}`);
      } catch (e) {
        console.warn('Failed deleting user_tripcode_master:', e);
      }

      try {
        const ucRef = doc(db, 'user_configs', codeToDelete);
        await deleteDoc(ucRef);
        removeLocalCache(`user_configs_${codeToDelete}`);
      } catch (e) {
        console.warn('Failed deleting user_configs:', e);
      }
    }

    // Remove user doc from `users` collection (moved to `deleted_users`)
    if (targetUid) {
      try {
        const userRef = doc(db, 'users', targetUid);
        await deleteDoc(userRef);
        removeLocalCache(`users_${targetUid}`);
        if (uid) removeLocalCache(`users_${uid}`);
        if (uDetails?.email) removeLocalCache(`users_email_${uDetails.email}`);
        if (auth.currentUser?.email) removeLocalCache(`users_email_${auth.currentUser.email}`);
      } catch (e) {
        console.warn('Failed deleting user doc from users collection:', e);
      }
    }

    // Attempt Firebase user account deletion & sign out
    if (auth.currentUser) {
      try {
        await deleteUser(auth.currentUser);
      } catch (authDeleteErr) {
        console.warn('Firebase user deleteUser error, falling back to signOut:', authDeleteErr);
        await auth.signOut().catch(() => {});
      }
    }
  } catch (error) {
    console.error('Error during deleteUserAccountData:', error);
    if (auth.currentUser) {
      await auth.signOut().catch(() => {});
    }
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
  const msgId = data.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const record: InboundMessageData = {
    id: msgId,
    name: data.name || '',
    email: data.email || '',
    subject: data.subject || 'Contact Us Inquiry',
    message: data.message,
    userCode: data.userCode || '',
    uid: data.uid || '',
    createdAt: data.createdAt || new Date().toISOString(),
    IsResolved: data.IsResolved !== undefined ? data.IsResolved : false,
    Response: data.Response || ''
  };

  try {
    const docRef = doc(db, 'inbound_messages', msgId);
    const cleaned = cleanUndefined(record);
    await setDoc(docRef, cleaned, { merge: true });
  } catch (err) {
    console.warn('Failed to send inbound message to Firestore, storing in local fallback:', err);
    // Fallback storing in localStorage if network fails
    try {
      const existing = JSON.parse(localStorage.getItem('inbound_messages_backup') || '[]');
      existing.push(record);
      localStorage.setItem('inbound_messages_backup', JSON.stringify(existing));
    } catch (e) {
      console.warn('Local storage fallback error:', e);
    }
  }
}

// ----------------------------------------------------
// SUBSCRIPTION PLANS OPERATIONS (subscription_plans table)
// ----------------------------------------------------

export async function getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const cacheKey = 'subscription_plans_list';
  try {
    const colRef = collection(db, 'subscription_plans');
    const querySnapshot = await safeGetDocs(colRef);
    if (querySnapshot && !querySnapshot.empty) {
      const plans: SubscriptionPlan[] = [];
      querySnapshot.forEach((docSnap) => {
        plans.push(docSnap.data() as SubscriptionPlan);
      });
      // Sort in logical duration order: 1_year, 2_year, 3_year, 5_year, lifetime
      const order = ['1_year', '2_year', '3_year', '5_year', 'lifetime'];
      plans.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      setLocalCache(cacheKey, plans);
      return plans;
    }

    // If Firestore collection is empty, seed it with default plans
    return await seedSubscriptionPlansIfEmpty();
  } catch (error) {
    console.warn('getSubscriptionPlans failed, falling back to local defaults:', error);
    const cached = getLocalCache<SubscriptionPlan[]>(cacheKey);
    if (cached && cached.length > 0) {
      return cached;
    }
    return DEFAULT_SUBSCRIPTION_PLANS;
  }
}

export async function saveSubscriptionPlan(plan: SubscriptionPlan): Promise<void> {
  const pathName = `subscription_plans/${plan.id}`;
  try {
    const docRef = doc(db, 'subscription_plans', plan.id);
    const cleaned = cleanUndefined(plan);
    await setDoc(docRef, cleaned, { merge: true });
  } catch (error) {
    console.warn(`saveSubscriptionPlan failed for ${plan.id}:`, error);
    if (isOfflineOrNetworkError(error)) {
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, pathName);
  }
}

export async function seedSubscriptionPlansIfEmpty(): Promise<SubscriptionPlan[]> {
  try {
    const promises = DEFAULT_SUBSCRIPTION_PLANS.map(async (plan) => {
      const docRef = doc(db, 'subscription_plans', plan.id);
      const cleaned = cleanUndefined(plan);
      await setDoc(docRef, cleaned, { merge: true });
    });
    await Promise.all(promises);
    setLocalCache('subscription_plans_list', DEFAULT_SUBSCRIPTION_PLANS);
    return DEFAULT_SUBSCRIPTION_PLANS;
  } catch (err) {
    console.warn('seedSubscriptionPlansIfEmpty encountered error:', err);
    return DEFAULT_SUBSCRIPTION_PLANS;
  }
}

// ----------------------------------------------------
// SUBSCRIPTION TRANSACTIONS OPERATIONS (transactions table)
// ----------------------------------------------------

export async function recordTransaction(transactionData: Omit<SubscriptionTransaction, 'id'> | SubscriptionTransaction): Promise<SubscriptionTransaction> {
  const transactionId = transactionData.transactionId || `txn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const fullTransaction: SubscriptionTransaction = {
    ...transactionData,
    id: transactionId,
    transactionId,
    createdAt: transactionData.createdAt || new Date().toISOString()
  };

  const pathName = `transactions/${transactionId}`;

  // Update local cache and local backup history immediately
  try {
    const userCodeKey = `user_transactions_${fullTransaction.userCode}`;
    const cached = getLocalCache<SubscriptionTransaction[]>(userCodeKey) || [];
    const updated = [fullTransaction, ...cached.filter(t => t.transactionId !== transactionId)];
    setLocalCache(userCodeKey, updated);

    const allTxnsKey = 'all_transactions_backup';
    const allCached = JSON.parse(localStorage.getItem(allTxnsKey) || '[]');
    allCached.unshift(fullTransaction);
    localStorage.setItem(allTxnsKey, JSON.stringify(allCached.slice(0, 100)));
  } catch (cacheErr) {
    console.warn('Failed saving transaction to local cache:', cacheErr);
  }

  // Persist to Cloud Firestore
  try {
    const docRef = doc(db, 'transactions', transactionId);
    const cleaned = cleanUndefined(fullTransaction);
    await setDoc(docRef, cleaned, { merge: true });
  } catch (error) {
    console.warn('Failed persisting transaction to Firestore, fallback cached:', error);
    if (!isOfflineOrNetworkError(error)) {
      handleFirestoreError(error, OperationType.WRITE, pathName);
    }
  }

  return fullTransaction;
}

export async function getTransactionsByUserCode(userCode: string): Promise<SubscriptionTransaction[]> {
  if (!userCode) return [];
  const userCodeKey = `user_transactions_${userCode}`;
  try {
    const colRef = collection(db, 'transactions');
    const q = query(colRef, where('userCode', '==', userCode), orderBy('createdAt', 'desc'));
    const querySnapshot = await safeGetDocs(q);
    if (querySnapshot && !querySnapshot.empty) {
      const transactions: SubscriptionTransaction[] = [];
      querySnapshot.forEach((docSnap) => {
        transactions.push(docSnap.data() as SubscriptionTransaction);
      });
      setLocalCache(userCodeKey, transactions);
      return transactions;
    }
    const cached = getLocalCache<SubscriptionTransaction[]>(userCodeKey);
    return cached || [];
  } catch (error) {
    console.warn('getTransactionsByUserCode failed, checking cache:', error);
    const cached = getLocalCache<SubscriptionTransaction[]>(userCodeKey);
    return cached || [];
  }
}

export async function getTransactionsByUid(uid: string): Promise<SubscriptionTransaction[]> {
  if (!uid) return [];
  try {
    const colRef = collection(db, 'transactions');
    const q = query(colRef, where('uid', '==', uid), orderBy('createdAt', 'desc'));
    const querySnapshot = await safeGetDocs(q);
    if (querySnapshot && !querySnapshot.empty) {
      const transactions: SubscriptionTransaction[] = [];
      querySnapshot.forEach((docSnap) => {
        transactions.push(docSnap.data() as SubscriptionTransaction);
      });
      return transactions;
    }
    return [];
  } catch (error) {
    console.warn('getTransactionsByUid failed:', error);
    return [];
  }
}


