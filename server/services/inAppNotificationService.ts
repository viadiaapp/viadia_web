import { adminDb } from "../firebaseAdmin";

export type InAppNotificationType =
  | "member_joined"
  | "expense_added"
  | "expense_updated"
  | "expense_deleted"
  | "upcoming_plan"
  | "checklist_item_added";

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

// Writes one notification per recipient. Best-effort and fire-and-forget at every call site,
// same convention as sendPushNotificationToUsers -- an in-app notification write failing should
// never fail the action (an expense save, a join approval) that triggered it.
export async function writeNotificationToUsers(
  userCodes: string[],
  payload: Omit<InAppNotification, "id" | "recipientUserCode" | "createdAt" | "cleared">
): Promise<void> {
  const uniqueCodes = Array.from(new Set(userCodes.filter(Boolean)));
  if (uniqueCodes.length === 0) return;
  try {
    await Promise.all(
      uniqueCodes.map((userCode) => {
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
