import { Router } from "express";
import crypto from "crypto";
import { adminDb } from "../firebaseAdmin";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { createPresignedUploadUrl, verifyUploadedObjectSize, deleteObject, getPublicUrl } from "../services/r2";

const router = Router();

// Folder prefix per purpose, and the size/content-type limits each is allowed. Kept as one table
// so adding a new upload purpose later is a one-line change here, not scattered validation logic.
const UPLOAD_PURPOSES: Record<string, { prefix: string; allowedTypes: string[]; maxBytes: number }> = {
  "outfit-photo": {
    prefix: "outfit-photos",
    allowedTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 5 * 1024 * 1024, // 5MB
  },
  attachment: {
    prefix: "attachments",
    allowedTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    maxBytes: 10 * 1024 * 1024, // 10MB
  },
};

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

async function resolveUserCode(uid?: string): Promise<string | null> {
  if (!uid) return null;
  const snap = await adminDb.collection("users").doc(uid).get();
  return snap.exists ? (snap.data()!.userCode as string) || null : null;
}

// Everything this app stores in R2 is scoped under {purpose}/{userCode}/{tripCode}/{uuid}.{ext} --
// keeping every user's files under their own userCode segment is what makes the ownership check
// in /confirm and DELETE below a simple prefix match, rather than needing a lookup table.
function buildObjectKey(purpose: string, userCode: string, tripCode: string, contentType: string): string {
  const config = UPLOAD_PURPOSES[purpose];
  const ext = EXT_BY_CONTENT_TYPE[contentType];
  const safeTripCode = (tripCode || "untagged").replace(/[^a-zA-Z0-9_-]/g, "");
  return `${config.prefix}/${userCode}/${safeTripCode}/${crypto.randomUUID()}.${ext}`;
}

function ownsKey(key: string, userCode: string): boolean {
  // key looks like "{prefix}/{userCode}/{tripCode}/{uuid}.{ext}" -- the userCode segment must
  // match the caller's own, for every purpose prefix.
  const segments = key.split("/");
  return segments.length >= 2 && segments[1] === userCode;
}

router.post(
  "/presign",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { purpose, tripCode, contentType, declaredSizeBytes } = req.body || {};

    const config = UPLOAD_PURPOSES[purpose];
    if (!config) {
      return res.status(400).json({ error: `Unknown upload purpose. Expected one of: ${Object.keys(UPLOAD_PURPOSES).join(", ")}.` });
    }
    if (!contentType || !config.allowedTypes.includes(contentType)) {
      return res.status(400).json({ error: `Unsupported content type for ${purpose}. Allowed: ${config.allowedTypes.join(", ")}.` });
    }
    // Soft check only -- a presigned PUT can't itself enforce size, this just rejects obviously
    // oversized requests early. The real enforcement is the HEAD check in /confirm.
    if (typeof declaredSizeBytes === "number" && declaredSizeBytes > config.maxBytes) {
      return res.status(400).json({ error: `File exceeds the ${config.maxBytes} byte limit for ${purpose}.` });
    }

    const userCode = await resolveUserCode(req.uid);
    if (!userCode) {
      return res.status(400).json({ error: "This account has no userCode assigned yet." });
    }

    try {
      const key = buildObjectKey(purpose, userCode, tripCode, contentType);
      const { uploadUrl, publicUrl } = await createPresignedUploadUrl({ key, contentType });
      res.json({ key, uploadUrl, publicUrl, expiresInSeconds: 300 });
    } catch (err: any) {
      console.error("R2 presign failed:", err?.message || err);
      res.status(500).json({ error: "Failed to create an upload URL. R2 may not be configured on the server yet." });
    }
  })
);

// Called by the client once the direct-to-R2 PUT has finished. Confirms the object actually
// exists and is within size limits (undoing/deleting it if not), since the presigned PUT itself
// can't enforce that.
router.post(
  "/confirm",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { key, purpose } = req.body || {};
    const config = UPLOAD_PURPOSES[purpose];
    if (!key || typeof key !== "string" || !config) {
      return res.status(400).json({ error: "Missing or invalid key/purpose." });
    }

    const userCode = await resolveUserCode(req.uid);
    if (!userCode || !ownsKey(key, userCode)) {
      return res.status(403).json({ error: "This object does not belong to this account." });
    }

    try {
      const sizeBytes = await verifyUploadedObjectSize(key, config.maxBytes);
      res.json({ success: true, publicUrl: getPublicUrl(key), sizeBytes });
    } catch (err: any) {
      console.error("R2 confirm failed:", err?.message || err);
      res.status(400).json({ error: err?.message || "Could not verify the uploaded object." });
    }
  })
);

router.delete(
  "/object",
  requireAuth,
  asyncHandler(async (req, res) => {
    const key = (req.query.key as string) || (req.body && req.body.key);
    if (!key || typeof key !== "string") {
      return res.status(400).json({ error: "Missing key." });
    }

    const userCode = await resolveUserCode(req.uid);
    if (!userCode || !ownsKey(key, userCode)) {
      return res.status(403).json({ error: "This object does not belong to this account." });
    }

    try {
      await deleteObject(key);
      res.json({ success: true });
    } catch (err: any) {
      console.error("R2 delete failed:", err?.message || err);
      res.status(500).json({ error: "Failed to delete the object." });
    }
  })
);

export default router;
