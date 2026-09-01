import { Router } from "express";
import { adminDb } from "../firebaseAdmin";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import {
  submitJoinRequest,
  createOwnerInvite,
  approveJoinRequest,
  rejectJoinRequest,
  acceptOwnerInvite,
  declineOwnerInvite,
  getApprovalToGrantForUser,
  getApprovalRequestedForUser,
  getTripOwnerMaster,
  resolveRole,
  hasApprovePermission,
  addUnmappedEmailTripAssociation,
  processUnmappedEmailSignup,
} from "../services/joinRequestService";
import { sendExistingAccountInviteEmail, sendSignupInviteEmail } from "../services/emailService";

const router = Router();

// Not yet called by anything -- the frontend still talks to Firestore directly for this feature
// (see src/lib/db.ts). Built independently against the same schema so it's ready once the
// frontend->backend migration happens.

async function resolveUserCode(uid: string | undefined): Promise<string | null> {
  if (!uid) return null;
  const snap = await adminDb.collection("users").doc(uid).get();
  return snap.exists ? snap.data()?.userCode || null : null;
}

async function resolveUserName(uid: string | undefined): Promise<string> {
  if (!uid) return "Someone";
  const snap = await adminDb.collection("users").doc(uid).get();
  return (snap.exists && snap.data()?.name) || "Someone";
}

router.post(
  "/submit",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userCode = await resolveUserCode(req.uid);
    if (!userCode) return res.status(400).json({ error: "This account has no userCode assigned yet." });

    const { tripCode, tripTitle, requesterEmail, requesterName, matchedTravelerName, isNewTraveler } = req.body || {};
    if (!tripCode || !matchedTravelerName) {
      return res.status(400).json({ error: "Missing tripCode or matchedTravelerName." });
    }

    try {
      const record = await submitJoinRequest({
        tripCode,
        tripTitle: tripTitle || "",
        requesterUserCode: userCode,
        requesterEmail: requesterEmail || "",
        requesterName: requesterName || "Traveler",
        matchedTravelerName,
        isNewTraveler: !!isNewTraveler,
      });
      res.json({ success: true, request: record });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Could not submit join request." });
    }
  })
);

router.post(
  "/invite",
  requireAuth,
  asyncHandler(async (req, res) => {
    const inviterUserCode = await resolveUserCode(req.uid);
    if (!inviterUserCode) return res.status(400).json({ error: "This account has no userCode assigned yet." });

    const { tripCode, tripTitle, travelerName, recipientUserCode, recipientEmail } = req.body || {};
    if (!tripCode || !travelerName || !recipientUserCode) {
      return res.status(400).json({ error: "Missing tripCode, travelerName, or recipientUserCode." });
    }

    const master = await getTripOwnerMaster(tripCode);
    const role = resolveRole(master, inviterUserCode);
    if (role !== "owner") {
      return res.status(403).json({ error: "Only the trip owner can send invites." });
    }

    try {
      const record = await createOwnerInvite({
        tripCode,
        tripTitle: tripTitle || "",
        inviterUserCode,
        travelerName,
        recipientUserCode,
        recipientEmail: recipientEmail || "",
      });

      if (recipientEmail) {
        const inviterName = await resolveUserName(req.uid);
        void sendExistingAccountInviteEmail({
          toEmail: recipientEmail,
          inviterName,
          tripTitle: tripTitle || "this trip",
        });
      }

      res.json({ success: true, request: record });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Could not create invite." });
    }
  })
);

router.post(
  "/invite-unregistered",
  requireAuth,
  asyncHandler(async (req, res) => {
    const inviterUserCode = await resolveUserCode(req.uid);
    if (!inviterUserCode) return res.status(400).json({ error: "This account has no userCode assigned yet." });

    const { tripCode, tripTitle, recipientEmail } = req.body || {};
    if (!tripCode || !recipientEmail) {
      return res.status(400).json({ error: "Missing tripCode or recipientEmail." });
    }

    const master = await getTripOwnerMaster(tripCode);
    const role = resolveRole(master, inviterUserCode);
    if (role !== "owner") {
      return res.status(403).json({ error: "Only the trip owner can send invites." });
    }

    try {
      await addUnmappedEmailTripAssociation(recipientEmail, tripCode);
      const inviterName = await resolveUserName(req.uid);
      void sendSignupInviteEmail({
        toEmail: recipientEmail,
        inviterName,
        tripTitle: tripTitle || "this trip",
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Could not process invite for this email." });
    }
  })
);

router.post(
  "/process-unmapped-signup",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userCode = await resolveUserCode(req.uid);
    if (!userCode) return res.status(400).json({ error: "This account has no userCode assigned yet." });

    const email = req.body?.email;
    if (!email) return res.status(400).json({ error: "Missing email." });

    try {
      await processUnmappedEmailSignup(email, userCode);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Could not process pending invites for this email." });
    }
  })
);

router.post(
  "/:tripCode/:requestId/approve",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userCode = await resolveUserCode(req.uid);
    if (!userCode) return res.status(400).json({ error: "This account has no userCode assigned yet." });

    const { tripCode, requestId } = req.params;
    const master = await getTripOwnerMaster(tripCode);
    const role = resolveRole(master, userCode);
    if (!hasApprovePermission(role)) {
      return res.status(403).json({ error: "You do not have permission to approve requests for this trip." });
    }

    try {
      await approveJoinRequest(tripCode, requestId, userCode);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Could not approve join request." });
    }
  })
);

router.post(
  "/:tripCode/:requestId/reject",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userCode = await resolveUserCode(req.uid);
    if (!userCode) return res.status(400).json({ error: "This account has no userCode assigned yet." });

    const { tripCode, requestId } = req.params;
    const master = await getTripOwnerMaster(tripCode);
    const role = resolveRole(master, userCode);
    if (!hasApprovePermission(role)) {
      return res.status(403).json({ error: "You do not have permission to reject requests for this trip." });
    }

    try {
      await rejectJoinRequest(tripCode, requestId, userCode);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Could not reject join request." });
    }
  })
);

router.post(
  "/:tripCode/:requestId/accept-invite",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userCode = await resolveUserCode(req.uid);
    if (!userCode) return res.status(400).json({ error: "This account has no userCode assigned yet." });

    const { tripCode, requestId } = req.params;
    try {
      await acceptOwnerInvite(tripCode, requestId, userCode);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Could not accept invite." });
    }
  })
);

router.post(
  "/:tripCode/:requestId/decline-invite",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userCode = await resolveUserCode(req.uid);
    if (!userCode) return res.status(400).json({ error: "This account has no userCode assigned yet." });

    const { tripCode, requestId } = req.params;
    try {
      await declineOwnerInvite(tripCode, requestId, userCode);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Could not decline invite." });
    }
  })
);

router.get(
  "/approval-to-grant",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userCode = await resolveUserCode(req.uid);
    if (!userCode) return res.status(400).json({ error: "This account has no userCode assigned yet." });
    const items = await getApprovalToGrantForUser(userCode);
    res.json({ items });
  })
);

router.get(
  "/approval-requested",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userCode = await resolveUserCode(req.uid);
    if (!userCode) return res.status(400).json({ error: "This account has no userCode assigned yet." });
    const items = await getApprovalRequestedForUser(userCode);
    res.json({ items });
  })
);

export default router;
