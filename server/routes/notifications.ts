import { Router } from "express";
import { adminDb } from "../firebaseAdmin";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { getNotificationsForUser, clearNotification, clearAllNotifications, getNotificationPreferences, setNotificationPreference, NotificationCategory } from "../services/inAppNotificationService";

const router = Router();

// Resolves the calling Firebase user's app userCode from users/{uid}. Mirrors trips.ts's
// identical helper -- kept local rather than shared since that's the established pattern in
// this codebase (joinRequestService.ts, users.ts, and trips.ts each define their own copy).
async function resolveUserCode(uid?: string): Promise<string | null> {
  if (!uid) return null;
  const snap = await adminDb.collection("users").doc(uid).get();
  return snap.exists ? (snap.data()!.userCode as string) || null : null;
}

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userCode = await resolveUserCode(req.uid);
    if (!userCode) return res.json([]);
    const notifications = await getNotificationsForUser(userCode);
    res.json(notifications);
  })
);

router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userCode = await resolveUserCode(req.uid);
    if (!userCode) return res.status(404).json({ error: "User not found." });
    await clearNotification(userCode, String(req.params.id));
    res.json({ success: true });
  })
);

router.delete(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userCode = await resolveUserCode(req.uid);
    if (!userCode) return res.status(404).json({ error: "User not found." });
    await clearAllNotifications(userCode);
    res.json({ success: true });
  })
);

const VALID_CATEGORIES: NotificationCategory[] = ["trip_membership", "expenses", "checklist", "announcements"];

router.get(
  "/preferences",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userCode = await resolveUserCode(req.uid);
    if (!userCode) return res.status(404).json({ error: "User not found." });
    const prefs = await getNotificationPreferences(userCode);
    res.json(prefs);
  })
);

router.put(
  "/preferences/:category",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userCode = await resolveUserCode(req.uid);
    if (!userCode) return res.status(404).json({ error: "User not found." });
    const category = req.params.category as NotificationCategory;
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(", ")}.` });
    }
    const { enabled } = req.body || {};
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled must be a boolean." });
    }
    await setNotificationPreference(userCode, category, enabled);
    res.json({ success: true });
  })
);

export default router;
