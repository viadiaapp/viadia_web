import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth, requireAdminSecret } from "../middleware/auth";
import { adminDb } from "../firebaseAdmin";
import {
  submitUserDestination,
  listPendingUserDestinations,
  approveUserDestination,
  rejectUserDestination,
  getApprovedUserDestinationsForCountry,
} from "../services/userDestinationsService";

const router = Router();

async function resolveUserCode(uid?: string): Promise<string | null> {
  if (!uid) return null;
  const snap = await adminDb.collection("users").doc(uid).get();
  return snap.exists ? (snap.data()!.userCode as string) || null : null;
}

router.post(
  "/submit",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name, expectedCountryCode, tripCode } = req.body || {};
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name is required." });
    }
    if (!expectedCountryCode || typeof expectedCountryCode !== "string") {
      return res.status(400).json({ error: "expectedCountryCode is required." });
    }

    const userCode = await resolveUserCode(req.uid);
    if (!userCode) {
      return res.status(403).json({ error: "Could not resolve your user account." });
    }

    const result = await submitUserDestination({
      name,
      expectedCountryCode,
      userCode,
      tripCode: typeof tripCode === "string" ? tripCode : null,
    });

    switch (result.outcome) {
      case "rate_limited":
        return res.status(429).json({ error: "You've reached today's limit for suggesting new places. Try again tomorrow." });
      case "invalid_place":
        return res.status(400).json({ error: result.message });
      case "country_mismatch":
        return res.status(400).json({
          error: `"${name}" appears to be in ${result.resolvedCountryName || "a different country"}, not the expected one.`,
        });
      case "already_exists":
        return res.json({ outcome: "already_exists", destination: result.destination });
      case "already_queued":
        return res.json({ outcome: "already_queued", entry: result.entry });
      case "queued":
        return res.json({ outcome: "queued", entry: result.entry });
    }
  })
);

router.get(
  "/approved",
  asyncHandler(async (req, res) => {
    const country = req.query.country;
    if (!country || typeof country !== "string") {
      return res.status(400).json({ error: "country query parameter is required." });
    }
    const results = await getApprovedUserDestinationsForCountry(country);
    res.json({ results });
  })
);

router.get(
  "/pending",
  requireAdminSecret,
  asyncHandler(async (_req, res) => {
    const results = await listPendingUserDestinations();
    res.json({ results });
  })
);

router.post(
  "/:id/approve",
  requireAdminSecret,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid submission id." });
    }
    const { reviewedBy, adminNotes } = req.body || {};
    const result = await approveUserDestination(id, reviewedBy || "admin", adminNotes);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ destination: result.destination });
  })
);

router.post(
  "/:id/reject",
  requireAdminSecret,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid submission id." });
    }
    const { reviewedBy, adminNotes } = req.body || {};
    const result = await rejectUserDestination(id, reviewedBy || "admin", adminNotes);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ ok: true });
  })
);

export default router;
