import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import {
  findDestinationByCountryAndName,
  getDestinationFull,
  insertNewDestination,
  backfillContentIfMissing,
  backfillImageIfMissing,
  resolveCountryForPlaceName,
  batchGetCachedImages,
  getCuratedDestinationsForCountries,
} from "../services/destinationsService";
import { getApprovedUserDestinationsForCountry } from "../services/userDestinationsService";

const router = Router();

// Replaces the static per-country JSON files the frontend used to bundle -- one request covers
// every country in a multi-country trip, AND both the curated (ranked) list and the approved
// "visited by other travellers" list for each -- merged into one response since the frontend
// always wants both together. Previously two separate round-trips (this endpoint, batched, plus
// one call per country to /api/user-destinations/approved); that endpoint is left in place for
// any future caller that only needs the travellers list on its own. Read-only, no auth needed.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const countriesParam = req.query.countries;
    if (!countriesParam || typeof countriesParam !== "string") {
      return res.status(400).json({ error: "countries query parameter is required (comma-separated ISO codes)." });
    }
    const codes = countriesParam.split(",").map((c) => c.trim()).filter(Boolean);
    if (codes.length === 0) {
      return res.status(400).json({ error: "countries query parameter must contain at least one code." });
    }

    const [curatedGrouped, travellersPerCode] = await Promise.all([
      getCuratedDestinationsForCountries(codes),
      Promise.all(codes.map(async (code) => ({ code, travellers: await getApprovedUserDestinationsForCountry(code) }))),
    ]);
    const travellersByCode = new Map(travellersPerCode.map((t) => [t.code, t.travellers]));

    const results: Record<string, { curated: unknown; travellers: unknown }> = {};
    for (const code of codes) {
      results[code] = {
        curated: curatedGrouped.get(code) || [],
        travellers: travellersByCode.get(code) || [],
      };
    }
    res.json({ results });
  })
);

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

    if (!existing) {
      if (!trustedCountry) {
        // Free-typed entries no longer insert directly here -- they go through the moderation
        // queue (POST /api/user-destinations/submit) instead, so the main destinations table
        // never gets an unreviewed user-typed entry.
        return res.status(404).json({
          error: `"${placeName}" isn't in our destinations list yet. Use the submit endpoint to suggest adding it.`,
          requiresSubmission: true,
        });
      }

      // Trusted (tapped from the curated suggestions list) miss: still inserts directly, since
      // this is a known-good source that was never the thing moderation needed to gate.
      const created = await insertNewDestination({ isoCode, name: placeName, source: "curated" });
      void backfillContentIfMissing(created.destination_id, placeName, countryName || isoCode);
      void backfillImageIfMissing(created.destination_id, placeName, countryName || isoCode);

      return res.json({
        destination: created,
        content: null,
        image: null,
        generating: true,
      });
    }

    const full = await getDestinationFull(existing.destination_id);
    const needsContent = !full?.content;
    const needsImage = !full?.image;
    if (needsContent) void backfillContentIfMissing(existing.destination_id, placeName, countryName || isoCode);
    if (needsImage) void backfillImageIfMissing(existing.destination_id, placeName, countryName || isoCode);

    res.json({
      destination: full!.destination,
      content: full!.content,
      image: full!.image,
      generating: needsContent || needsImage,
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

// Strictly read-only, batched -- returns whichever of the given destinations already have a
// cached cover image, in one query. Never inserts a destination, never triggers Gemini/DeepSeek/
// Unsplash. Intended for list/thumbnail views showing many destinations at once, where the old
// behavior (each thumbnail calling /resolve independently) meant opening a country's destination
// list could kick off a generation call for every single uncached destination simultaneously.
router.post(
  "/batch-images",
  asyncHandler(async (req, res) => {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items must be a non-empty array." });
    }
    if (items.length > 100) {
      return res.status(400).json({ error: "items must contain at most 100 entries per request." });
    }
    for (const item of items) {
      if (!item || typeof item.name !== "string" || typeof item.countryCode !== "string") {
        return res.status(400).json({ error: "Each item must have a name and countryCode string." });
      }
    }

    const results = await batchGetCachedImages(items);
    res.json({ results });
  })
);

export default router;
