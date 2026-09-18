import { Router } from "express";
import { adminDb } from "../firebaseAdmin";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Path: app_config/ads -- { interstitialAdsEnabled: boolean, rewardedAdsEnabled: boolean,
// interstitialMinGapMinutes: number }.
// Public, no auth required -- every client (signed-in or guest) needs this to decide whether to
// show ads at all, read once per app session. Missing doc, or a missing/non-false field, defaults
// to enabled (ads are the default state; someone has to deliberately flip this off in Firestore,
// not deliberately turn it on). interstitialMinGapMinutes defaults to 10 (the previous hardcoded
// value) if missing, non-numeric, or not a positive number -- a malformed Firestore value should
// never produce a zero or negative gap, which would defeat the whole point of the floor.
router.get(
  "/ads",
  asyncHandler(async (_req, res) => {
    const snap = await adminDb.collection("app_config").doc("ads").get();
    const data = snap.exists ? snap.data() || {} : {};
    const rawGap = Number(data.interstitialMinGapMinutes);
    res.json({
      interstitialAdsEnabled: data.interstitialAdsEnabled !== false,
      rewardedAdsEnabled: data.rewardedAdsEnabled !== false,
      interstitialMinGapMinutes: Number.isFinite(rawGap) && rawGap > 0 ? rawGap : 10,
    });
  })
);

// LocationIQ tile access key (see .env.example for where to get one). Public, no auth required --
// same reasoning as /ads: every client, signed-in or guest, needs this to render a map at all.
// The key itself is not a secret in the way a server-side credential is -- LocationIQ tile
// requests go directly from the client to their servers, so the key is visible in that traffic
// either way; storing it as a backend env var here is for operational convenience (rotate it in
// one place, no frontend rebuild needed), not to hide it from the client.
router.get(
  "/map-tiles",
  asyncHandler(async (_req, res) => {
    res.json({ locationIqKey: process.env.LOCATIONIQ_API_KEY || null });
  })
);

export default router;
