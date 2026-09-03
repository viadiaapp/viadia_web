import { Router } from "express";
import { adminDb } from "../firebaseAdmin";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Path: app_config/ads -- { bannerAdsEnabled: boolean, interstitialAdsEnabled: boolean }.
// Public, no auth required -- every client (signed-in or guest) needs this to decide whether to
// show ads at all, read once per app session. Missing doc, or a missing/non-false field, defaults
// to enabled (ads are the default state; someone has to deliberately flip this off in Firestore,
// not deliberately turn it on).
router.get(
  "/ads",
  asyncHandler(async (_req, res) => {
    const snap = await adminDb.collection("app_config").doc("ads").get();
    const data = snap.exists ? snap.data() || {} : {};
    res.json({
      bannerAdsEnabled: data.bannerAdsEnabled !== false,
      interstitialAdsEnabled: data.interstitialAdsEnabled !== false,
    });
  })
);

export default router;
