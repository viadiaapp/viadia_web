import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import {
  findDestinationByCountryAndName,
  getDestinationFull,
  insertNewDestination,
  backfillContentIfMissing,
  backfillImageIfMissing,
  resolveCountryForPlaceName,
} from "../services/destinationsService";

const router = Router();

router.post(
  "/resolve",
  asyncHandler(async (req, res) => {
    const { name, expectedCountryCode, trustedCountry } = req.body || {};
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name is required." });
    }
    if (!expectedCountryCode || typeof expectedCountryCode !== "string") {
      return res.status(400).json({ error: "expectedCountryCode is required." });
    }
    const placeName = name.trim();
    const isoCode = expectedCountryCode.trim().toUpperCase();

    // Free-typed entries (not picked from the existing suggestions list) need Gemini to verify
    // the place is actually in the country the user was browsing -- trusted entries (tapped from
    // the list, already grouped by country) skip this since the country is already known-good.
    let countryName: string | undefined;
    if (!trustedCountry) {
      const resolved = await resolveCountryForPlaceName(placeName);
      if (!resolved) {
        return res.status(400).json({ error: `Could not identify "${placeName}" as a real place.` });
      }
      if (resolved.isoCode !== isoCode) {
        return res.status(400).json({
          error: `"${placeName}" appears to be in ${resolved.countryName || resolved.isoCode}, not the expected country.`,
          resolvedCountry: resolved,
        });
      }
      countryName = resolved.countryName;
    }

    const existing = await findDestinationByCountryAndName(isoCode, placeName);

    if (existing) {
      const full = await getDestinationFull(existing.destination_id);
      const needsContent = !full?.content;
      const needsImage = !full?.image;
      if (needsContent) void backfillContentIfMissing(existing.destination_id, placeName, countryName || isoCode);
      if (needsImage) void backfillImageIfMissing(existing.destination_id, placeName, countryName || isoCode);

      return res.json({
        destination: full!.destination,
        content: full!.content,
        image: full!.image,
        generating: needsContent || needsImage,
      });
    }

    // Brand-new destination: insert the base row now, kick off content + image generation in the
    // background, and respond immediately -- the frontend re-fetches via GET /:destinationId once
    // ready, per the async design.
    const created = await insertNewDestination({ isoCode, name: placeName });
    void backfillContentIfMissing(created.destination_id, placeName, countryName || isoCode);
    void backfillImageIfMissing(created.destination_id, placeName, countryName || isoCode);

    res.json({
      destination: created,
      content: null,
      image: null,
      generating: true,
    });
  })
);

router.get(
  "/:destinationId",
  asyncHandler(async (req, res) => {
    const destinationId = String(req.params.destinationId);
    const full = await getDestinationFull(destinationId);
    if (!full) {
      return res.status(404).json({ error: "Destination not found." });
    }
    res.json({
      destination: full.destination,
      content: full.content,
      image: full.image,
      generating: !full.content || !full.image,
    });
  })
);

export default router;
