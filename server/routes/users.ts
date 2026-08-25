import { Router } from "express";
import { adminAuth, adminDb } from "../firebaseAdmin";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

const RESTRICTED_FIELDS = ["subscription_tier", "sub_start_date", "sub_end_date", "adTier", "userTier", "uid", "createdAt"];

function stripRestrictedFields(body: Record<string, any>) {
  const clean = { ...body };
  for (const field of RESTRICTED_FIELDS) delete clean[field];
  return clean;
}

// Full profile for the caller themselves; a public-safe subset (name/email/userCode) for anyone else
// (used e.g. to show a trip's owner display name — never exposes subscription/tier data cross-account).
router.get(
  "/:uid",
  requireAuth,
  asyncHandler(async (req, res) => {
    const snap = await adminDb.collection("users").doc(req.params.uid).get();
    if (!snap.exists) return res.status(404).json({ error: "User not found." });
    const data = snap.data()!;
    if (req.params.uid === req.uid) {
      return res.json(data);
    }
    res.json({ uid: data.uid, name: data.name, email: data.email, userCode: data.userCode });
  })
);

router.put(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const ref = adminDb.collection("users").doc(req.uid!);
    const existing = await ref.get();
    const payload = {
      ...stripRestrictedFields(req.body || {}),
      uid: req.uid,
      createdAt: existing.exists ? existing.data()!.createdAt : new Date().toISOString(),
      ...(existing.exists
        ? {
            subscription_tier: existing.data()!.subscription_tier,
            sub_start_date: existing.data()!.sub_start_date,
            sub_end_date: existing.data()!.sub_end_date,
            adTier: existing.data()!.adTier,
            userTier: existing.data()!.userTier,
          }
        : {}),
    };
    await ref.set(payload, { merge: true });
    const updated = await ref.get();
    res.json(updated.data());
  })
);

router.get(
  "/lookup/by-email",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.userEmail) return res.json(null);
    const snap = await adminDb.collection("users").where("email", "==", req.userEmail).limit(1).get();
    if (snap.empty) return res.json(null);
    res.json(snap.docs[0].data());
  })
);

router.get(
  "/lookup/by-code/:userCode",
  requireAuth,
  asyncHandler(async (req, res) => {
    const snap = await adminDb.collection("users").where("userCode", "==", req.params.userCode).limit(1).get();
    if (snap.empty) return res.json(null);
    res.json(snap.docs[0].data());
  })
);

// Allocates the next sequential app user code (e.g. UA000001) from the series_code counter.
router.post(
  "/next-code",
  requireAuth,
  asyncHandler(async (req, res) => {
    const counterRef = adminDb.collection("series_code").doc("current");
    try {
      const assignedCode = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(counterRef);
        let seriesCode = "A";
        let seriesNum = 1;
        if (snap.exists) {
          const data = snap.data()!;
          if (data.SERIES_CODE) seriesCode = String(data.SERIES_CODE).toUpperCase().trim();
          if (typeof data.SERIES_NUMBER === "number" && data.SERIES_NUMBER >= 1) {
            seriesNum = Math.floor(data.SERIES_NUMBER);
          }
        }
        const formattedNum = String(seriesNum).padStart(6, "0");
        const assigned = `U${seriesCode}${formattedNum}`;

        let nextSeriesCode = seriesCode;
        let nextSeriesNum = seriesNum + 1;
        if (seriesNum >= 999999) {
          const chars = seriesCode.split("");
          let i = chars.length - 1;
          let carried = false;
          while (i >= 0) {
            if (chars[i] === "Z") {
              chars[i] = "A";
              i--;
            } else {
              chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
              carried = true;
              break;
            }
          }
          nextSeriesCode = carried ? chars.join("") : "A" + chars.join("");
          nextSeriesNum = 1;
        }

        tx.set(counterRef, { SERIES_CODE: nextSeriesCode, SERIES_NUMBER: nextSeriesNum, updatedAt: new Date().toISOString() }, { merge: true });
        return assigned;
      });
      res.json({ userCode: assignedCode });
    } catch (err: any) {
      console.warn("next-code transaction failed, using fallback:", err?.message);
      const randomDigits = Math.floor(100000 + Math.random() * 900000);
      res.json({ userCode: `UA${randomDigits}` });
    }
  })
);

router.post(
  "/reactivate",
  requireAuth,
  asyncHandler(async (req, res) => {
    const email = req.userEmail;
    const currentUid = req.uid!;
    let deletedSnap = email ? await adminDb.collection("deleted_users").where("email", "==", email).limit(1).get() : null;
    let deletedDoc: any = deletedSnap && !deletedSnap.empty ? deletedSnap.docs[0] : null;
    if (!deletedDoc) {
      const byUid = await adminDb.collection("deleted_users").doc(currentUid).get();
      if (byUid.exists) deletedDoc = byUid;
    }
    if (!deletedDoc) return res.json(null);

    const deletedUser = deletedDoc.data()!;
    const isAdFree = deletedUser.adTier !== undefined ? deletedUser.adTier : deletedUser.userTier === "lifetime";
    const tierName = deletedUser.userTier || (isAdFree ? "lifetime" : "free");

    const reactivated = {
      uid: currentUid,
      email: deletedUser.email || email || null,
      name: deletedUser.name || "Traveler",
      userCode: deletedUser.userCode || null,
      adTier: isAdFree,
      userTier: tierName,
      subscription_tier: deletedUser.subscription_tier,
      sub_start_date: deletedUser.sub_start_date,
      sub_end_date: deletedUser.sub_end_date,
      createdAt: deletedUser.createdAt || new Date().toISOString(),
    };

    await adminDb.collection("users").doc(currentUid).set(reactivated, { merge: true });
    await deletedDoc.ref.delete();
    if (deletedUser.uid && deletedUser.uid !== deletedDoc.id) {
      await adminDb.collection("deleted_users").doc(deletedUser.uid).delete().catch(() => {});
    }

    res.json(reactivated);
  })
);

router.delete(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const uid = req.uid!;
    const userRef = adminDb.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const uDetails = userSnap.exists ? userSnap.data()! : null;
    const codeToDelete: string | null = uDetails?.userCode || null;

    if (uDetails) {
      await adminDb
        .collection("deleted_users")
        .doc(uid)
        .set(
          {
            uid,
            email: uDetails.email || req.userEmail || null,
            name: uDetails.name || "Traveler",
            userCode: codeToDelete,
            adTier: uDetails.adTier ?? false,
            userTier: uDetails.userTier || "free",
            subscription_tier: uDetails.subscription_tier,
            sub_start_date: uDetails.sub_start_date,
            sub_end_date: uDetails.sub_end_date,
            createdAt: uDetails.createdAt || new Date().toISOString(),
            deletedAt: new Date().toISOString(),
          },
          { merge: true }
        );
    }

    const ownedTripCodes = new Set<string>();
    const ownedTrips = await adminDb.collection("trips").where("ownerUid", "==", uid).get();
    ownedTrips.forEach((d) => {
      const code = (d.data().code || d.id || "").toString().toUpperCase().trim();
      if (code) ownedTripCodes.add(code);
    });
    const ownedMasters = await adminDb.collection("trip_master").where("ownerUid", "==", uid).get();
    ownedMasters.forEach((d) => ownedTripCodes.add(d.id));
    if (codeToDelete) {
      const tcm = await adminDb.collection("user_tripcode_master").doc(codeToDelete).get();
      if (tcm.exists) {
        (tcm.data()!.tripCodes || []).forEach((c: string) => {
          if (c) ownedTripCodes.add(c.toUpperCase().trim());
        });
      }
    }

    for (const code of ownedTripCodes) {
      await adminDb.collection("trips").doc(code).delete().catch(() => {});
      await adminDb.collection("trip_master").doc(code).delete().catch(() => {});
      await adminDb.collection("trip_gclist_styling").doc(code).delete().catch(() => {});
    }

    if (codeToDelete) {
      await adminDb.collection("user_tripcode_master").doc(codeToDelete).delete().catch(() => {});
      await adminDb.collection("user_configs").doc(codeToDelete).delete().catch(() => {});
    }

    await userRef.delete().catch(() => {});
    await adminAuth.deleteUser(uid).catch((err) => console.warn("Admin deleteUser failed:", err?.message || err));

    res.json({ success: true });
  })
);

router.get(
  "/config/:userCode",
  requireAuth,
  asyncHandler(async (req, res) => {
    const snap = await adminDb.collection("user_configs").doc(req.params.userCode).get();
    if (!snap.exists) return res.status(404).json({ error: "Not found." });
    res.json(snap.data());
  })
);

router.put(
  "/config/:userCode",
  requireAuth,
  asyncHandler(async (req, res) => {
    await adminDb
      .collection("user_configs")
      .doc(req.params.userCode)
      .set({ ...(req.body || {}), userCode: req.params.userCode, updatedAt: new Date().toISOString() }, { merge: true });
    res.json({ success: true });
  })
);

router.get(
  "/tripcodes/:userCode",
  requireAuth,
  asyncHandler(async (req, res) => {
    const snap = await adminDb.collection("user_tripcode_master").doc(req.params.userCode).get();
    if (!snap.exists) return res.json({ userCode: req.params.userCode, tripCodes: [] });
    res.json(snap.data());
  })
);

router.put(
  "/tripcodes/:userCode",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { tripCodes } = req.body || {};
    await adminDb
      .collection("user_tripcode_master")
      .doc(req.params.userCode)
      .set({ userCode: req.params.userCode, tripCodes: tripCodes || [] }, { merge: true });
    res.json({ success: true });
  })
);

export default router;
