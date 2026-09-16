import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { verifySsvCallback } from "../services/admobSsvService";
import { grantRewardCredit } from "../services/aiGenerationLogService";

const router = Router();

router.get(
  "/ssv-callback",
  asyncHandler(async (req, res) => {
    // Raw query string exactly as received -- req.query is a parsed object and re-serializing it
    // could reorder or re-encode params, which would break signature verification even for a
    // genuine callback (Google's docs are explicit that the content must not be modified in any
    // way). req.url is "/api/ads/ssv-callback?..." -- take everything after the "?".
    const queryStart = req.url.indexOf("?");
    const rawQueryString = queryStart === -1 ? "" : req.url.substring(queryStart + 1);

    const result = await verifySsvCallback(rawQueryString).catch((err) => {
      console.error("SSV verification threw:", err?.message || err);
      return { verified: false as const };
    });

    if (!result.verified) {
      console.warn("Rejected an unverified/invalid SSV callback.");
      // Still 200 -- an actual malformed/spoofed request isn't something Google should retry,
      // and returning non-200 here would trigger Google's retry behavior (up to 5 attempts) for
      // something retrying won't fix.
      return res.status(200).send("ignored");
    }

    // custom_data carries the userCode -- set by the client when requesting the rewarded ad (see
    // lib/ads.ts's prepareRewardedAd), echoed back here once AdMob confirms the watch.
    const userCode = result.customData;
    if (!userCode) {
      console.warn("Verified SSV callback had no custom_data (userCode) to credit.");
      return res.status(200).send("ok");
    }

    await grantRewardCredit(userCode);
    res.status(200).send("ok");
  })
);

export default router;
