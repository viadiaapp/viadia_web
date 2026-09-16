import { adminDb } from "../firebaseAdmin";

export type InAppNotificationType =
  // Trip membership
  | "invite_received"
  | "invite_declined"
  | "join_request_received"
  | "join_request_approved"
  | "join_request_rejected"
  | "member_joined"
  | "member_removed"
  | "member_left"
  | "trip_deleted"
  // Expenses
  | "expense_added"
  | "expense_updated"
  | "expense_deleted"
  // Checklist
  | "checklist_item_added"
  | "checklist_item_updated"
  | "checklist_item_deleted"
  | "checklist_item_completed"
  // Scheduled (not yet built -- no trigger exists for this type yet, kept defined so the type
  // union and category map are ready once a scheduler exists)
  | "upcoming_plan"
  // Admin-triggered broadcast, not tied to a specific trip
  | "announcement";

export type NotificationCategory = "trip_membership" | "expenses" | "checklist" | "announcements";

// Every type maps to exactly one category -- this is what the Global Settings toggles gate
// against. upcoming_plan deliberately has no mapping yet since nothing triggers it; add one
// when the scheduler is built.
const TYPE_CATEGORY: Record<InAppNotificationType, NotificationCategory> = {
  invite_received: "trip_membership",
  invite_declined: "trip_membership",
  join_request_received: "trip_membership",
  join_request_approved: "trip_membership",
  join_request_rejected: "trip_membership",
  member_joined: "trip_membership",
  member_removed: "trip_membership",
  member_left: "trip_membership",
  trip_deleted: "trip_membership",
  expense_added: "expenses",
  expense_updated: "expenses",
  expense_deleted: "expenses",
  checklist_item_added: "checklist",
  checklist_item_updated: "checklist",
  checklist_item_deleted: "checklist",
  checklist_item_completed: "checklist",
  upcoming_plan: "trip_membership",
  announcement: "announcements",
};

export function categoryForType(type: InAppNotificationType): NotificationCategory {
  return TYPE_CATEGORY[type];
}

export interface InAppNotification {
  id: string;
  recipientUserCode: string;
  tripCode: string;
  tripTitle: string;
  type: InAppNotificationType;
  title: string;
  body: string;
  actorName?: string;
  createdAt: string;
  cleared: boolean;
}

function notificationsCollection(userCode: string) {
  return adminDb.collection("user_notifications").doc(userCode).collection("items");
}

function generateNotificationId(): string {
  return `N-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
}

export type NotificationPreferences = Partial<Record<NotificationCategory, boolean>>;

// Missing/unset means enabled -- a user who's never touched this setting gets notifications by
// default, rather than being silently opted out because a field doesn't exist yet.
async function getEnabledCategoriesForUsers(userCodes: string[]): Promise<Map<string, NotificationPreferences>> {
  const prefsByUser = new Map<string, NotificationPreferences>();
  await Promise.all(
    userCodes.map(async (userCode) => {
      try {
        const snap = await adminDb.collection("user_configs").doc(userCode).get();
        prefsByUser.set(userCode, (snap.exists && snap.data()?.notificationPreferences) || {});
      } catch {
        prefsByUser.set(userCode, {});
      }
    })
  );
  return prefsByUser;
}

// Writes one notification per recipient, but only for recipients who haven't disabled this
// notification's category in Global Settings (per-user; missing preference = enabled). Best-effort
// and fire-and-forget at every call site, same convention as sendPushNotificationToUsers -- an
// in-app notification write failing should never fail the action (an expense save, a join
// approval) that triggered it. This gating applies ONLY to this in-app panel, never to the push
// notification itself (push muting is handled by the user's own Android notification channels,
// not this backend).
export async function writeNotificationToUsers(
  userCodes: string[],
  payload: Omit<InAppNotification, "id" | "recipientUserCode" | "createdAt" | "cleared">
): Promise<void> {
  const uniqueCodes = Array.from(new Set(userCodes.filter(Boolean)));
  if (uniqueCodes.length === 0) return;
  try {
    const category = categoryForType(payload.type);
    const prefsByUser = await getEnabledCategoriesForUsers(uniqueCodes);
    const recipientCodes = uniqueCodes.filter((userCode) => prefsByUser.get(userCode)?.[category] !== false);
    if (recipientCodes.length === 0) return;

    await Promise.all(
      recipientCodes.map((userCode) => {
        const id = generateNotificationId();
        const record: InAppNotification = {
          id,
          recipientUserCode: userCode,
          createdAt: new Date().toISOString(),
          cleared: false,
          ...payload,
        };
        return notificationsCollection(userCode).doc(id).set(record);
      })
    );
  } catch (err) {
    console.error("writeNotificationToUsers failed:", err);
  }
}

// Newest last, matching the requested "stack from below, most recent at the bottom" ordering --
// the client renders this array in the order returned, so the sort direction belongs here, not
// re-derived on every render client-side.
export async function getNotificationsForUser(userCode: string, limit = 100): Promise<InAppNotification[]> {
  const snap = await notificationsCollection(userCode)
    .where("cleared", "==", false)
    .orderBy("createdAt", "asc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as InAppNotification);
}

export async function clearNotification(userCode: string, notificationId: string): Promise<void> {
  await notificationsCollection(userCode).doc(notificationId).set({ cleared: true }, { merge: true });
}

export async function clearAllNotifications(userCode: string): Promise<void> {
  const snap = await notificationsCollection(userCode).where("cleared", "==", false).get();
  if (snap.empty) return;
  const batch = adminDb.batch();
  snap.docs.forEach((d) => batch.update(d.ref, { cleared: true }));
  await batch.commit();
}

export async function getNotificationPreferences(userCode: string): Promise<NotificationPreferences> {
  const snap = await adminDb.collection("user_configs").doc(userCode).get();
  return (snap.exists && snap.data()?.notificationPreferences) || {};
}

export async function setNotificationPreference(userCode: string, category: NotificationCategory, enabled: boolean): Promise<void> {
  await adminDb
    .collection("user_configs")
    .doc(userCode)
    .set({ notificationPreferences: { [category]: enabled } }, { merge: true });
}
