import { adminDb } from "../firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

// Mirrors src/types.ts and src/lib/db.ts exactly -- this is the server-side counterpart to the
// frontend's direct-Firestore join-request implementation, built independently against the same
// schema (see docs/firebase-blueprint-v2.json's TripJoinRequest/UserTripApprovalList entities).
// Not yet called by anything -- the frontend still talks to Firestore directly for this feature.

export type TripRole = "owner" | "moderator" | "companion";

const ROLE_PERMISSIONS: Record<TripRole, { allowModify: boolean; approveChanges: boolean; deleteTrip: boolean }> = {
  owner: { allowModify: true, approveChanges: true, deleteTrip: true },
  moderator: { allowModify: true, approveChanges: true, deleteTrip: false },
  companion: { allowModify: true, approveChanges: false, deleteTrip: false },
};

export interface TripJoinRequestEntry {
  requestId: string;
  tripCode: string;
  tripTitle: string;
  requesterUserCode: string;
  requesterEmail: string;
  requesterName: string;
  matchedTravelerName: string;
  isNewTraveler: boolean;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  direction: "traveler_request" | "owner_invite";
  recipientUserCode?: string;
  recipientEmail?: string;
}

export interface TripJoinRequestsDoc {
  tripCode: string;
  traveler_request?: Record<string, TripJoinRequestEntry>;
  owner_invite?: Record<string, TripJoinRequestEntry>;
}

export interface UserTripApprovalList {
  userCode: string;
  approval_to_grant: string[];
  approval_requested: string[];
}

interface TripOwnerUserMaster {
  tripCode: string;
  owner: string;
  allowModification: boolean;
  users?: Record<string, [TripRole, string, string]>;
}

function generateJoinRequestId(): string {
  return `REQ${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

function resolveUserRoleOnTrip(master: TripOwnerUserMaster | null, userCode: string): TripRole | null {
  if (!master || !userCode) return null;
  if (master.owner === userCode) return "owner";
  for (const tuple of Object.values(master.users || {})) {
    if (tuple[1] === userCode) return tuple[0];
  }
  return null;
}

async function getTripOwnerMaster(tripCode: string): Promise<TripOwnerUserMaster | null> {
  const snap = await adminDb.collection("trip_owner_user_master").doc(tripCode).get();
  return snap.exists ? (snap.data() as TripOwnerUserMaster) : null;
}

export async function getTripJoinRequestsDoc(tripCode: string): Promise<TripJoinRequestsDoc | null> {
  const snap = await adminDb.collection("trip_join_requests").doc(tripCode.toUpperCase().trim()).get();
  return snap.exists ? (snap.data() as TripJoinRequestsDoc) : null;
}

function stripUndefined<T extends object>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export interface SubmitJoinRequestInput {
  tripCode: string;
  tripTitle: string;
  requesterUserCode: string;
  requesterEmail: string;
  requesterName: string;
  matchedTravelerName: string;
  isNewTraveler: boolean;
}

// Path: trip_join_requests/{tripCode}.traveler_request.{requestId}. Written inside a transaction
// alongside the approval-list fan-out (owner + every moderator get tripCode added to their
// approval_to_grant; the requester gets it added to their own approval_requested).
export async function submitJoinRequest(input: SubmitJoinRequestInput): Promise<TripJoinRequestEntry> {
  const requestId = generateJoinRequestId();
  const tripCode = input.tripCode.toUpperCase().trim();
  const record: TripJoinRequestEntry = stripUndefined({
    requestId,
    tripCode,
    tripTitle: input.tripTitle || "",
    requesterUserCode: input.requesterUserCode,
    requesterEmail: input.requesterEmail || "",
    requesterName: input.requesterName || "Traveler",
    matchedTravelerName: input.matchedTravelerName,
    isNewTraveler: input.isNewTraveler,
    status: "pending",
    createdAt: new Date().toISOString(),
    direction: "traveler_request",
  });

  const requestsDocRef = adminDb.collection("trip_join_requests").doc(tripCode);
  const masterRef = adminDb.collection("trip_owner_user_master").doc(tripCode);

  await adminDb.runTransaction(async (transaction) => {
    const masterSnap = await transaction.get(masterRef);
    if (!masterSnap.exists) throw new Error("Trip not found.");
    const master = masterSnap.data() as TripOwnerUserMaster;

    const approverUserCodes = new Set<string>();
    if (master.owner) approverUserCodes.add(master.owner);
    for (const tuple of Object.values(master.users || {})) {
      if (tuple[0] === "moderator" && tuple[1]) approverUserCodes.add(tuple[1]);
    }

    transaction.set(requestsDocRef, { tripCode, traveler_request: { [requestId]: record } }, { merge: true });

    for (const userCode of approverUserCodes) {
      const approvalRef = adminDb.collection("user_trip_approval_list").doc(userCode);
      transaction.set(approvalRef, { userCode, approval_to_grant: FieldValue.arrayUnion(tripCode) }, { merge: true });
    }

    const requesterApprovalRef = adminDb.collection("user_trip_approval_list").doc(input.requesterUserCode);
    transaction.set(
      requesterApprovalRef,
      { userCode: input.requesterUserCode, approval_requested: FieldValue.arrayUnion(tripCode) },
      { merge: true }
    );
  });

  return record;
}

export interface CreateOwnerInviteInput {
  tripCode: string;
  tripTitle: string;
  inviterUserCode: string;
  travelerName: string;
  recipientUserCode: string;
  recipientEmail: string;
}

// Path: trip_join_requests/{tripCode}.owner_invite.{requestId}. Same transactional pattern:
// recipient gets approval_to_grant, the inviting owner gets approval_requested.
export async function createOwnerInvite(input: CreateOwnerInviteInput): Promise<TripJoinRequestEntry> {
  const tripCode = input.tripCode.toUpperCase().trim();

  // Idempotency: if this exact recipient already has a pending invite for this trip, return it
  // instead of creating a duplicate.
  const existingDoc = await getTripJoinRequestsDoc(tripCode);
  const existingPending = Object.values(existingDoc?.owner_invite || {}).find(
    (entry) => entry.status === "pending" && entry.recipientUserCode === input.recipientUserCode
  );
  if (existingPending) {
    return existingPending;
  }

  const requestId = generateJoinRequestId();
  const record: TripJoinRequestEntry = stripUndefined({
    requestId,
    tripCode,
    tripTitle: input.tripTitle || "",
    requesterUserCode: input.inviterUserCode,
    requesterEmail: "",
    requesterName: "",
    matchedTravelerName: input.travelerName,
    isNewTraveler: false,
    status: "pending",
    createdAt: new Date().toISOString(),
    direction: "owner_invite",
    recipientUserCode: input.recipientUserCode,
    recipientEmail: input.recipientEmail,
  });

  const requestsDocRef = adminDb.collection("trip_join_requests").doc(tripCode);

  await adminDb.runTransaction(async (transaction) => {
    transaction.set(requestsDocRef, { tripCode, owner_invite: { [requestId]: record } }, { merge: true });

    const recipientApprovalRef = adminDb.collection("user_trip_approval_list").doc(input.recipientUserCode);
    transaction.set(
      recipientApprovalRef,
      { userCode: input.recipientUserCode, approval_to_grant: FieldValue.arrayUnion(tripCode) },
      { merge: true }
    );

    const inviterApprovalRef = adminDb.collection("user_trip_approval_list").doc(input.inviterUserCode);
    transaction.set(
      inviterApprovalRef,
      { userCode: input.inviterUserCode, approval_requested: FieldValue.arrayUnion(tripCode) },
      { merge: true }
    );
  });

  return record;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Records that tripCode should get an owner_invite for this email once they eventually sign up.
// Path: unmapped_email_trip_association/{normalizedEmail}, an array field of trip codes --
// arrayUnion so calling this again for an email already on a trip's list is a safe no-op, and
// existing entries for other trips aren't disturbed.
export async function addUnmappedEmailTripAssociation(email: string, tripCode: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  const code = tripCode.toUpperCase().trim();
  try {
    await adminDb
      .collection("unmapped_email_trip_association")
      .doc(normalizedEmail)
      .set({ tripCodes: FieldValue.arrayUnion(code) }, { merge: true });
    console.log(`[addUnmappedEmailTripAssociation] Added ${code} to ${normalizedEmail}'s pending list.`);
  } catch (e) {
    console.error(`[addUnmappedEmailTripAssociation] Failed adding ${code} to ${normalizedEmail}:`, e);
  }
}

// Called once, right after a brand-new account finishes signing up. Looks up every trip this
// email was invited to before they had an account, creates a real owner_invite for each one that
// still qualifies (status is 'planned' or 'active' -- not 'completed'/'cancelled', since inviting
// someone to a trip that's already over doesn't make sense), then clears the whole entry
// regardless of how many trips actually qualified -- this is a one-time process, not something
// that keeps retrying stale entries later.
export async function processUnmappedEmailSignup(email: string, newUserCode: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  const docRef = adminDb.collection("unmapped_email_trip_association").doc(normalizedEmail);

  try {
    const snap = await docRef.get();
    if (!snap.exists) return;

    const tripCodes: string[] = snap.data()?.tripCodes || [];
    if (tripCodes.length === 0) {
      await docRef.delete().catch(() => {});
      return;
    }

    await Promise.all(
      tripCodes.map(async (tripCode) => {
        try {
          const tripSnap = await adminDb.collection("trips").doc(tripCode).get();
          if (!tripSnap.exists) return;
          const trip = tripSnap.data() as { title?: string; status?: string };
          if (trip.status !== "planned" && trip.status !== "active") return;

          const master = await getTripOwnerMaster(tripCode);
          if (!master?.owner) return;

          await createOwnerInvite({
            tripCode,
            tripTitle: trip.title || "",
            inviterUserCode: master.owner,
            travelerName: normalizedEmail,
            recipientUserCode: newUserCode,
            recipientEmail: normalizedEmail,
          });
          console.log(`[processUnmappedEmailSignup] Created owner_invite for ${normalizedEmail} on trip ${tripCode}.`);
        } catch (e) {
          console.error(`[processUnmappedEmailSignup] Failed processing trip ${tripCode} for ${normalizedEmail}:`, e);
        }
      })
    );

    await docRef.delete();
    console.log(`[processUnmappedEmailSignup] Cleared unmapped_email_trip_association for ${normalizedEmail}.`);
  } catch (e) {
    console.error(`[processUnmappedEmailSignup] Failed processing signup for ${normalizedEmail}:`, e);
  }
}

// "Which trips need MY decision right now" -- pending traveler_requests (only if this user
// currently has approveChanges permission on that trip) and/or a pending owner_invite addressed
// specifically to them.
export async function getApprovalToGrantForUser(userCode: string): Promise<TripJoinRequestEntry[]> {
  if (!userCode) return [];
  const approvalSnap = await adminDb.collection("user_trip_approval_list").doc(userCode).get();
  const tripCodes: string[] = approvalSnap.exists ? (approvalSnap.data() as UserTripApprovalList).approval_to_grant || [] : [];
  if (tripCodes.length === 0) return [];

  const items: TripJoinRequestEntry[] = [];
  await Promise.all(
    tripCodes.map(async (tripCode) => {
      const requestsDoc = await getTripJoinRequestsDoc(tripCode);
      if (!requestsDoc) return;

      for (const entry of Object.values(requestsDoc.owner_invite || {})) {
        if (entry.status === "pending" && entry.recipientUserCode === userCode) items.push(entry);
      }

      const pendingTravelerRequests = Object.values(requestsDoc.traveler_request || {}).filter((r) => r.status === "pending");
      if (pendingTravelerRequests.length > 0) {
        const master = await getTripOwnerMaster(tripCode);
        const role = resolveUserRoleOnTrip(master, userCode);
        if (role && ROLE_PERMISSIONS[role].approveChanges) {
          items.push(...pendingTravelerRequests);
        }
      }
    })
  );

  items.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return items;
}

// "Which trips am I waiting on someone else for" -- this user's own pending traveler_request or
// owner_invite entries, across every trip in their approval_requested list.
export async function getApprovalRequestedForUser(userCode: string): Promise<TripJoinRequestEntry[]> {
  if (!userCode) return [];
  const approvalSnap = await adminDb.collection("user_trip_approval_list").doc(userCode).get();
  const tripCodes: string[] = approvalSnap.exists ? (approvalSnap.data() as UserTripApprovalList).approval_requested || [] : [];
  if (tripCodes.length === 0) return [];

  const items: TripJoinRequestEntry[] = [];
  await Promise.all(
    tripCodes.map(async (tripCode) => {
      const requestsDoc = await getTripJoinRequestsDoc(tripCode);
      if (!requestsDoc) return;
      for (const entry of Object.values(requestsDoc.traveler_request || {})) {
        if (entry.status === "pending" && entry.requesterUserCode === userCode) items.push(entry);
      }
      for (const entry of Object.values(requestsDoc.owner_invite || {})) {
        if (entry.status === "pending" && entry.requesterUserCode === userCode) items.push(entry);
      }
    })
  );

  items.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return items;
}

// Multi-approver cleanup scan. Called fire-and-forget (not awaited by the route handler) right
// after every approve/reject.
export async function cleanupApprovalToGrantForTrip(tripCode: string): Promise<void> {
  try {
    const requestsDoc = await getTripJoinRequestsDoc(tripCode);
    const stillPending = Object.values(requestsDoc?.traveler_request || {}).some((r) => r.status === "pending");
    if (stillPending) return;

    const master = await getTripOwnerMaster(tripCode);
    if (!master) return;

    const approverUserCodes = new Set<string>();
    if (master.owner) approverUserCodes.add(master.owner);
    for (const tuple of Object.values(master.users || {})) {
      if (tuple[0] === "moderator" && tuple[1]) approverUserCodes.add(tuple[1]);
    }

    await Promise.all(
      Array.from(approverUserCodes).map((userCode) =>
        adminDb
          .collection("user_trip_approval_list")
          .doc(userCode)
          .update({ approval_to_grant: FieldValue.arrayRemove(tripCode) })
          .catch(() => {})
      )
    );
  } catch (err) {
    console.error("cleanupApprovalToGrantForTrip failed:", err);
  }
}

// Full sweep for a trip whose status just became 'completed' or 'cancelled': removes the entire
// trip_join_requests/{tripCode} doc and clears tripCode out of every associated user's
// approval_to_grant/approval_requested lists.
export async function sweepTripJoinRequestsForTrip(tripCode: string): Promise<void> {
  const code = tripCode.toUpperCase().trim();
  try {
    const requestsDoc = await getTripJoinRequestsDoc(code);
    const userCodes = new Set<string>();
    if (requestsDoc) {
      for (const entry of Object.values(requestsDoc.traveler_request || {})) {
        if (entry.requesterUserCode) userCodes.add(entry.requesterUserCode);
      }
      for (const entry of Object.values(requestsDoc.owner_invite || {})) {
        if (entry.requesterUserCode) userCodes.add(entry.requesterUserCode);
        if (entry.recipientUserCode) userCodes.add(entry.recipientUserCode);
      }
    }
    const master = await getTripOwnerMaster(code);
    if (master?.owner) userCodes.add(master.owner);
    for (const tuple of Object.values(master?.users || {})) {
      if (tuple[1]) userCodes.add(tuple[1]);
    }

    await Promise.all(
      Array.from(userCodes).map((userCode) =>
        adminDb
          .collection("user_trip_approval_list")
          .doc(userCode)
          .update({
            approval_to_grant: FieldValue.arrayRemove(code),
            approval_requested: FieldValue.arrayRemove(code),
          })
          .catch(() => {})
      )
    );

    await adminDb.collection("trip_join_requests").doc(code).delete().catch(() => {});
  } catch (err) {
    console.error("sweepTripJoinRequestsForTrip failed:", err);
  }
}

// Server-side permission check (used by route handlers to authorize approve/reject).
export function resolveRole(master: TripOwnerUserMaster | null, userCode: string | null): TripRole | null {
  return resolveUserRoleOnTrip(master, userCode || "");
}
export function hasApprovePermission(role: TripRole | null): boolean {
  return !!role && ROLE_PERMISSIONS[role].approveChanges;
}
export { getTripOwnerMaster };

// ---- Shared helpers for the four functions below ----

interface TripDoc {
  code?: string;
  travelers?: string[];
  travelerEmails?: Record<string, string>;
  [key: string]: any;
}

async function getTrip(tripCode: string): Promise<TripDoc | null> {
  const snap = await adminDb.collection("trips").doc(tripCode).get();
  return snap.exists ? (snap.data() as TripDoc) : null;
}

async function getUserNameByUserCode(userCode: string): Promise<string | null> {
  const snap = await adminDb.collection("users").where("userCode", "==", userCode).limit(1).get();
  if (snap.empty) return null;
  const name = snap.docs[0].data()?.name;
  return typeof name === "string" ? name.trim() || null : null;
}

// Surgically removes a single key from Trip.travelerEmails via FieldValue.delete(). Needed
// because a merge:true .set() write can never do this on its own -- Firestore's merge semantics
// for nested map fields only add/update keys present in the write payload, they never remove a
// key just because it's absent. Logs explicitly (not silently swallowed) so failures are visible.
async function removeTravelerEmailEntry(tripCode: string, travelerName: string): Promise<void> {
  const code = tripCode.toUpperCase().trim();
  console.log(`[removeTravelerEmailEntry] Attempting to delete travelerEmails.${travelerName} on trip ${code}`);
  try {
    await adminDb
      .collection("trips")
      .doc(code)
      .update({ [`travelerEmails.${travelerName}`]: FieldValue.delete() });
    console.log(`[removeTravelerEmailEntry] Successfully deleted travelerEmails.${travelerName} on trip ${code}`);
  } catch (e) {
    console.error(`[removeTravelerEmailEntry] FAILED deleting travelerEmails.${travelerName} on trip ${code} -- error:`, e);
  }
}

async function saveTripOwnerMaster(
  tripCode: string,
  owner: string,
  allowModification: boolean,
  users?: Record<string, [TripRole, string, string]>
): Promise<void> {
  await adminDb
    .collection("trip_owner_user_master")
    .doc(tripCode)
    .set({ tripCode, owner, allowModification: !!allowModification, ...(users ? { users } : {}) }, { merge: true });
}

async function setUserTripRole(userCode: string, tripCode: string, role: TripRole): Promise<void> {
  if (!userCode || !tripCode) return;
  await adminDb.collection("user_trip_association_master").doc(userCode).set({ [tripCode]: role }, { merge: true });
}

async function seedUserTripListEntry(userCode: string, tripCode: string): Promise<void> {
  const existingSnap = await adminDb.collection("user_specific_trip_list").doc(`${userCode}_${tripCode}`).get();
  if (existingSnap.exists) return;

  const configSnap = await adminDb.collection("user_configs").doc(userCode).get();
  const globalChecklist = configSnap.exists ? configSnap.data()?.globalChecklist || [] : [];
  const gcCopy = globalChecklist.map((item: any) => ({
    ...item,
    id: item.id || `glob-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    checked: false,
  }));

  await adminDb
    .collection("user_specific_trip_list")
    .doc(`${userCode}_${tripCode}`)
    .set(
      { userCode, tripCode, globalChecklist: gcCopy, outfitDetails: { days: {} } },
      { merge: true }
    );
}

// Owner/moderator approves a request: performs the actual userCode/email mapping (and
// Trip.travelers update for a brand-new traveler), creates the user_trip_association_master
// entry, and seeds the requester's per-trip checklist snapshot. The request entry is kept (status
// set to 'approved', not deleted). Triggers the multi-approver cleanup scan without waiting on it.
export async function approveJoinRequest(tripCode: string, requestId: string, resolvedByUserCode: string): Promise<void> {
  const code = tripCode.toUpperCase().trim();
  const requestsDocRef = adminDb.collection("trip_join_requests").doc(code);
  const requestsDoc = await getTripJoinRequestsDoc(code);
  const request = requestsDoc?.traveler_request?.[requestId];
  if (!request || request.status !== "pending") throw new Error("Request not found or already resolved.");

  const master = await getTripOwnerMaster(code);
  if (!master) throw new Error("Trip not found.");

  let role: TripRole = "companion";

  if (request.isNewTraveler) {
    const trip = await getTrip(code);
    if (trip) {
      const travelers = trip.travelers || [];
      const nextTravelers = travelers.includes(request.matchedTravelerName) ? travelers : [...travelers, request.matchedTravelerName];
      await adminDb
        .collection("trips")
        .doc(code)
        .set(
          {
            travelers: nextTravelers,
            travelerEmails: { ...(trip.travelerEmails || {}), [request.matchedTravelerName]: request.requesterEmail },
          },
          { merge: true }
        );
    }

    const nextUsers: Record<string, [TripRole, string, string]> = {
      ...(master.users || {}),
      [request.matchedTravelerName]: ["companion", request.requesterUserCode, request.requesterEmail],
    };
    await saveTripOwnerMaster(code, master.owner, master.allowModification, nextUsers);
  } else {
    const priorTuple = master.users?.[request.matchedTravelerName];
    role = priorTuple?.[0] || "companion";

    const nextUsers: Record<string, [TripRole, string, string]> = {
      ...(master.users || {}),
      [request.matchedTravelerName]: [role, request.requesterUserCode, request.requesterEmail],
    };
    await saveTripOwnerMaster(code, master.owner, master.allowModification, nextUsers);

    const trip = await getTrip(code);
    if (trip) {
      await adminDb
        .collection("trips")
        .doc(code)
        .set(
          { travelerEmails: { ...(trip.travelerEmails || {}), [request.matchedTravelerName]: request.requesterEmail } },
          { merge: true }
        );
    }
  }

  await setUserTripRole(request.requesterUserCode, code, role);

  try {
    await seedUserTripListEntry(request.requesterUserCode, code);
  } catch (e) {
    console.error("Failed seeding user_specific_trip_list after join approval:", e);
  }

  await requestsDocRef.update({
    [`traveler_request.${requestId}.status`]: "approved",
    [`traveler_request.${requestId}.resolvedAt`]: new Date().toISOString(),
    [`traveler_request.${requestId}.resolvedBy`]: resolvedByUserCode,
  });

  await adminDb
    .collection("user_trip_approval_list")
    .doc(request.requesterUserCode)
    .update({ approval_requested: FieldValue.arrayRemove(code) })
    .catch(() => {});

  void cleanupApprovalToGrantForTrip(code);
}

// Owner/moderator rejects a request: no data changes beyond the request's own status.
export async function rejectJoinRequest(tripCode: string, requestId: string, resolvedByUserCode: string): Promise<void> {
  const code = tripCode.toUpperCase().trim();
  const requestsDocRef = adminDb.collection("trip_join_requests").doc(code);
  const requestsDoc = await getTripJoinRequestsDoc(code);
  const request = requestsDoc?.traveler_request?.[requestId];
  if (!request) throw new Error("Request not found.");

  await requestsDocRef.update({
    [`traveler_request.${requestId}.status`]: "rejected",
    [`traveler_request.${requestId}.resolvedAt`]: new Date().toISOString(),
    [`traveler_request.${requestId}.resolvedBy`]: resolvedByUserCode,
  });

  await adminDb
    .collection("user_trip_approval_list")
    .doc(request.requesterUserCode)
    .update({ approval_requested: FieldValue.arrayRemove(code) })
    .catch(() => {});

  void cleanupApprovalToGrantForTrip(code);
}

// The invited user accepts: grants actual access. Single-recipient, so approval-list cleanup
// happens directly here (no scan needed, unlike the multi-approver traveler_request case).
export async function acceptOwnerInvite(tripCode: string, requestId: string, acceptingUserCode: string): Promise<void> {
  const code = tripCode.toUpperCase().trim();
  const requestsDocRef = adminDb.collection("trip_join_requests").doc(code);
  const requestsDoc = await getTripJoinRequestsDoc(code);
  const request = requestsDoc?.owner_invite?.[requestId];
  if (!request || request.status !== "pending" || request.recipientUserCode !== acceptingUserCode) {
    throw new Error("Invite not found, already resolved, or not addressed to this account.");
  }

  const master = await getTripOwnerMaster(code);
  const placeholderName = request.matchedTravelerName;
  const role: TripRole = master?.users?.[placeholderName]?.[0] || "companion";
  const trip = await getTrip(code);

  // Replace the placeholder (typically the invited email) with the accepting user's actual
  // display name, de-duplicated against every other current traveler name on this trip
  // (name, name_2, name_3, ...). Falls back to keeping the placeholder if no real name is on file.
  let finalName = placeholderName;
  try {
    const realName = await getUserNameByUserCode(acceptingUserCode);
    if (realName) {
      const existingNames = new Set(
        ((trip?.travelers as string[]) || []).filter((n) => n !== placeholderName).map((n) => n.toLowerCase())
      );
      let candidate = realName;
      let suffix = 2;
      while (existingNames.has(candidate.toLowerCase())) {
        candidate = `${realName}_${suffix}`;
        suffix++;
      }
      finalName = candidate;
    }
  } catch (e) {
    console.error("Failed resolving real name for accepted invite, keeping placeholder name:", e);
  }

  // Only now -- at acceptance, not invite creation -- does the real userCode/email get written
  // into trip_owner_user_master.users and Trip.travelerEmails, and the placeholder name gets
  // replaced with the accepting user's real name.
  try {
    const nextUsers: Record<string, [TripRole, string, string]> = { ...(master?.users || {}) };
    delete nextUsers[placeholderName];
    nextUsers[finalName] = [role, acceptingUserCode, request.recipientEmail || ""];
    await saveTripOwnerMaster(code, master?.owner || "", master?.allowModification ?? false, nextUsers);

    if (trip) {
      const nextTravelers = ((trip.travelers as string[]) || []).map((n) => (n === placeholderName ? finalName : n));
      const nextEmails: Record<string, string> = { ...((trip.travelerEmails as Record<string, string>) || {}) };
      delete nextEmails[placeholderName];
      nextEmails[finalName] = request.recipientEmail || "";

      // Carry the rename through any expense/checklist references made to the placeholder before
      // the invite was accepted (same as the frontend's manual rename handling).
      const nextExpenses = ((trip.expenses as any[]) || []).map((exp) => {
        let updated = { ...exp };
        let changed = false;
        if (updated.paidBy === placeholderName) {
          updated.paidBy = finalName;
          changed = true;
        }
        if (updated.splits && updated.splits.length > 0) {
          const nextSplits = updated.splits.map((s: any) =>
            s.traveler === placeholderName ? { ...s, traveler: finalName } : s
          );
          if (changed || nextSplits.some((s: any, i: number) => s.traveler !== updated.splits[i].traveler)) {
            updated.splits = nextSplits;
            changed = true;
          }
        }
        return changed ? updated : exp;
      });
      const nextChecklist = ((trip.checklist as any[]) || []).map((item) =>
        item.assignedTo === placeholderName ? { ...item, assignedTo: finalName } : item
      );

      await adminDb
        .collection("trips")
        .doc(code)
        .set(
          {
            travelers: nextTravelers,
            travelerEmails: nextEmails,
            expenses: nextExpenses,
            checklist: nextChecklist,
          },
          { merge: true }
        );

      // The above merge write cannot remove the old placeholder key on its own -- same fix as
      // declineOwnerInvite.
      if (finalName !== placeholderName) {
        await removeTravelerEmailEntry(code, placeholderName);
      }
    }
  } catch (e) {
    console.error("Failed writing accepted invite identity mapping:", e);
  }

  await setUserTripRole(acceptingUserCode, code, role);

  try {
    await seedUserTripListEntry(acceptingUserCode, code);
  } catch (e) {
    console.error("Failed seeding user_specific_trip_list after invite acceptance:", e);
  }

  await requestsDocRef.update({
    [`owner_invite.${requestId}.status`]: "approved",
    [`owner_invite.${requestId}.resolvedAt`]: new Date().toISOString(),
    [`owner_invite.${requestId}.resolvedBy`]: acceptingUserCode,
  });

  await Promise.all([
    adminDb
      .collection("user_trip_approval_list")
      .doc(acceptingUserCode)
      .update({ approval_to_grant: FieldValue.arrayRemove(code) })
      .catch(() => {}),
    adminDb
      .collection("user_trip_approval_list")
      .doc(request.requesterUserCode)
      .update({ approval_requested: FieldValue.arrayRemove(code) })
      .catch(() => {}),
  ]);
}

// The invited user declines: the placeholder traveler slot is removed immediately (unchanged,
// separate concern from request-record persistence). The request entry itself is kept (status set
// to 'rejected'), not hard-deleted.
export async function declineOwnerInvite(tripCode: string, requestId: string, decliningUserCode: string): Promise<void> {
  const code = tripCode.toUpperCase().trim();
  const requestsDocRef = adminDb.collection("trip_join_requests").doc(code);
  const requestsDoc = await getTripJoinRequestsDoc(code);
  const request = requestsDoc?.owner_invite?.[requestId];
  if (!request || request.recipientUserCode !== decliningUserCode) {
    throw new Error("Invite not found or not addressed to this account.");
  }

  try {
    const master = await getTripOwnerMaster(code);
    if (master?.users && master.users[request.matchedTravelerName]) {
      const nextUsers = { ...master.users };
      delete nextUsers[request.matchedTravelerName];
      await saveTripOwnerMaster(code, master.owner, master.allowModification, nextUsers);
    }
  } catch (e) {
    console.error("Failed removing trip_owner_user_master placeholder on decline:", e);
  }

  try {
    const trip = await getTrip(code);
    if (trip) {
      const nextTravelers = (trip.travelers || []).filter((n) => n !== request.matchedTravelerName);
      await adminDb.collection("trips").doc(code).set({ travelers: nextTravelers }, { merge: true });
    }
    // The above set({merge: true}) correctly replaces the whole travelers array, but merge
    // semantics never remove a nested travelerEmails map key just because it's absent from the
    // write payload -- removeTravelerEmailEntry uses FieldValue.delete() via a targeted update,
    // the only way to actually remove it.
    await removeTravelerEmailEntry(code, request.matchedTravelerName);
  } catch (e) {
    console.error("Failed removing Trip.travelers placeholder on decline:", e);
  }

  await requestsDocRef.update({
    [`owner_invite.${requestId}.status`]: "rejected",
    [`owner_invite.${requestId}.resolvedAt`]: new Date().toISOString(),
    [`owner_invite.${requestId}.resolvedBy`]: decliningUserCode,
  });

  await Promise.all([
    adminDb
      .collection("user_trip_approval_list")
      .doc(decliningUserCode)
      .update({ approval_to_grant: FieldValue.arrayRemove(code) })
      .catch(() => {}),
    adminDb
      .collection("user_trip_approval_list")
      .doc(request.requesterUserCode)
      .update({ approval_requested: FieldValue.arrayRemove(code) })
      .catch(() => {}),
  ]);
}
