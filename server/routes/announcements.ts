import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAdminSecret } from "../middleware/auth";
import { adminDb } from "../firebaseAdmin";
import { sendPushNotificationToUsers } from "../services/pushNotificationService";
import { writeNotificationToUsers } from "../services/inAppNotificationService";

const router = Router();

async function getAllUserCodes(): Promise<string[]> {
  // A full collection scan is acceptable here -- this is an infrequent, admin-triggered action,
  // not a hot path. Revisit with pagination if the user base grows large enough for this to
  // become a real cost, but that's not a concern at today's scale.
  const snap = await adminDb.collection("users").get();
  const codes: string[] = [];
  for (const doc of snap.docs) {
    const userCode = doc.data()?.userCode;
    if (userCode) codes.push(userCode);
  }
  return codes;
}

// POST /api/announcements -- { title: string, body: string }
// Filtering by segment (country, active-trip status, signup date, etc.) is explicitly deferred
// to the future admin panel work, same shape as destination moderation's admin UI -- this
// endpoint is the underlying send capability only, broadcasting to every user for now.
router.post(
  "/",
  requireAdminSecret,
  asyncHandler(async (req, res) => {
    const { title, body } = req.body || {};
    if (!title || typeof title !== "string" || !body || typeof body !== "string") {
      return res.status(400).json({ error: "title and body are required." });
    }

    const userCodes = await getAllUserCodes();
    if (userCodes.length === 0) {
      return res.json({ success: true, recipientCount: 0 });
    }

    await Promise.all([
      sendPushNotificationToUsers(userCodes, {
        title,
        body,
        data: { type: "announcement" },
      }),
      writeNotificationToUsers(userCodes, {
        tripCode: "",
        tripTitle: "",
        type: "announcement",
        title,
        body,
      }),
    ]);

    res.json({ success: true, recipientCount: userCodes.length });
  })
);

export default router;
