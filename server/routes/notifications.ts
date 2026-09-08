import { Router } from "express";
import { adminDb } from "../firebaseAdmin";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { getNotificationsForUser, clearNotification, clearAllNotifications } from "../services/inAppNotificationService";

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

export default router;
