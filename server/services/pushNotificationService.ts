import { adminDb, adminMessaging } from "../firebaseAdmin";

// Device tokens are stored per userCode (the app's canonical user identifier, used everywhere
// else in this codebase) rather than per Firebase uid, so a single lookup at send time covers a
// user regardless of which of their devices is being notified. Keyed by token itself (not an
// array) so re-registering the same token from the same device is an idempotent overwrite, not a
// growing duplicate list.
type DeviceTokenRecord = {
  token: string;
  platform: "android" | "ios" | "web";
  registeredAt: string;
};

function tokensCollection(userCode: string) {
  return adminDb.collection("user_device_tokens").doc(userCode).collection("tokens");
}

export async function registerDeviceToken(userCode: string, token: string, platform: "android" | "ios" | "web"): Promise<void> {
  await tokensCollection(userCode).doc(token).set(
    { token, platform, registeredAt: new Date().toISOString() } satisfies DeviceTokenRecord,
    { merge: true }
  );
}

export async function unregisterDeviceToken(userCode: string, token: string): Promise<void> {
  await tokensCollection(userCode).doc(token).delete().catch(() => {});
}

async function getDeviceTokensForUserCodes(userCodes: string[]): Promise<string[]> {
  const uniqueCodes = Array.from(new Set(userCodes.filter(Boolean)));
  const tokenLists = await Promise.all(
    uniqueCodes.map(async (userCode) => {
      const snap = await tokensCollection(userCode).get();
      return snap.docs.map((d) => d.id);
    })
  );
  return tokenLists.flat();
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  // Arbitrary key-value data delivered alongside the notification, e.g. { tripCode, type } --
  // read by the client to decide where tapping the notification should navigate.
  data?: Record<string, string>;
}

// Sends a push notification to every registered device across the given userCodes. Best-effort:
// a send failure here should never fail whatever action triggered the notification (a trip save,
// a join approval), so every call site treats this as fire-and-forget. Invalid/expired tokens
// (FCM's messaging/registration-token-not-registered error) are cleaned up automatically so they
// don't keep failing on every future send.
export async function sendPushNotificationToUsers(userCodes: string[], payload: PushNotificationPayload): Promise<void> {
  try {
    const tokens = await getDeviceTokensForUserCodes(userCodes);
    if (tokens.length === 0) return;

    const response = await adminMessaging.sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body },
      data: payload.data || {},
    });

    if (response.failureCount > 0) {
      const staleTokens: string[] = [];
      response.responses.forEach((r, i) => {
        if (!r.success && r.error?.code === "messaging/registration-token-not-registered") {
          staleTokens.push(tokens[i]);
        }
      });
      if (staleTokens.length > 0) {
        // Best-effort cleanup -- doesn't know which userCode a given stale token belonged to
        // without a reverse lookup, so this scans the codes involved in this send. Acceptable
        // cost: this only runs when tokens are actually stale, not on every send.
        const uniqueCodes = Array.from(new Set(userCodes.filter(Boolean)));
        await Promise.all(
          uniqueCodes.map(async (userCode) => {
            await Promise.all(staleTokens.map((t) => unregisterDeviceToken(userCode, t)));
          })
        );
      }
    }
  } catch (err) {
    console.error("sendPushNotificationToUsers failed:", err);
  }
}

// Resolves every real (non-placeholder) userCode associated with a trip via
// trip_owner_user_master.users, optionally excluding one (typically the actor who triggered the
// notification, since they don't need to be told about their own action).
export async function getTripMemberUserCodes(tripCode: string, excludeUserCode?: string | null): Promise<string[]> {
  const snap = await adminDb.collection("trip_owner_user_master").doc(tripCode).get();
  if (!snap.exists) return [];
  const data = snap.data() || {};
  const users = (data.users || {}) as Record<string, { userCode?: string }>;
  const codes = new Set<string>();
  // owner is stored as its own top-level field, separate from the users map -- never part of it.
  if (data.owner) codes.add(data.owner as string);
  for (const u of Object.values(users)) {
    if (u.userCode) codes.add(u.userCode);
  }
  return Array.from(codes).filter((code) => code !== excludeUserCode);
}
