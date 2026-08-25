import { Router } from "express";
import { adminDb } from "../firebaseAdmin";
import { optionalAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Contact-us messages are allowed from guests too (WebLanding.tsx), so this stays optionalAuth.
router.post(
  "/",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const msgId = body.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const record = {
      id: msgId,
      name: body.name || "",
      email: body.email || "",
      subject: body.subject || "Contact Us Inquiry",
      message: body.message || "",
      userCode: body.userCode || "",
      uid: req.uid || body.uid || "",
      createdAt: body.createdAt || new Date().toISOString(),
      IsResolved: false,
      Response: "",
    };
    await adminDb.collection("inbound_messages").doc(msgId).set(record, { merge: true });
    res.json({ success: true });
  })
);

export default router;
