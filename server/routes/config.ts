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

export default router;
