import { Router } from "express";
import { adminDb } from "../firebaseAdmin";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Subscription state no longer lives on the user profile at all (see user_subscriptions/{userCode}),
// so there's nothing subscription-related left to strip/protect here. isActive is the one
// system-managed field a client must never set directly (only /me DELETE and /reactivate touch it).
const RESTRICTED_FIELDS = ["uid", "createdAt", "isActive"];

function stripRestrictedFields(body: Record<string, any>) {
  const clean = { ...body };
  for (const field of RESTRICTED_FIELDS) delete clean[field];
  return clean;
}

// Full profile for the caller themselves; a public-safe subset (name/email/userCode) for anyone else
// (used e.g. to show a trip's owner display name).
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
      isActive: existing.exists ? existing.data()!.isActive !== false : true,
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

// Soft-delete reactivation: flips isActive back to true on the existing users/{uid} (or by-email)
// doc. There is no separate deleted_users archive anymore -- the record was never actually removed.
router.post(
  "/reactivate",
  requireAuth,
  asyncHandler(async (req, res) => {
    const uid = req.uid!;
    const email = req.userEmail;

    let ref = adminDb.collection("users").doc(uid);
    let snap = await ref.get();
    if (!snap.exists && email) {
      const byEmail = await adminDb.collection("users").where("email", "==", email).limit(1).get();
      if (!byEmail.empty) {
        ref = byEmail.docs[0].ref;
        snap = byEmail.docs[0];
      }
    }

    if (!snap.exists || snap.data()!.isActive !== false) {
      return res.json(null); // nothing to reactivate
    }

    const reactivated = { ...snap.data()!, uid, isActive: true };
    await ref.set(reactivated, { merge: true });
    res.json(reactivated);
  })
);

// Deletes owned trips (and their ownership/per-user data), then soft-deletes the account itself
// by flipping isActive to false -- mirrors the client's deleteUserAccountData() exactly.
router.delete(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const uid = req.uid!;
    const userRef = adminDb.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const uDetails = userSnap.exists ? userSnap.data()! : null;
    const userCode: string | null = uDetails?.userCode || null;

    const ownedTripCodes = new Set<string>();
    if (userCode) {
      const ownedMasters = await adminDb.collection("trip_owner_user_master").where("owner", "==", userCode).get();
      ownedMasters.forEach((d) => ownedTripCodes.add(d.id));
    }

    for (const code of ownedTripCodes) {
      await adminDb.collection("trips").doc(code).delete().catch(() => {});
      await adminDb.collection("trip_owner_user_master").doc(code).delete().catch(() => {});
    }

    if (userCode) {
      // Clean up every user_specific_trip_list entry this user has (owned or joined), not just
      // the trips they owned -- matches the client cleaning up joined-trip data too.
      const listSnap = await adminDb.collection("user_specific_trip_list").where("userCode", "==", userCode).get();
      const batch = adminDb.batch();
      listSnap.forEach((d) => batch.delete(d.ref));
      await batch.commit().catch(() => {});

      await adminDb.collection("user_configs").doc(userCode).delete().catch(() => {});
      await adminDb.collection("user_trip_association_master").doc(userCode).delete().catch(() => {});
    }

    // Soft-delete: flip isActive to false, keep the users/{uid} doc (and userCode) intact.
    await userRef.set({ ...(uDetails || { uid, name: "Traveler" }), uid, isActive: false }, { merge: true }).catch(() => {});

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

// Replaces the old user_tripcode_master/{userCode} -> {tripCodes: []} lookup. The client now gets
// this by querying user_specific_trip_list where userCode == X, so this just proxies that query
// (kept for any older client still calling it, but new code should call the client's
// getUserTripCodes()-equivalent directly instead).
router.get(
  "/tripcodes/:userCode",
  requireAuth,
  asyncHandler(async (req, res) => {
    const snap = await adminDb.collection("user_specific_trip_list").where("userCode", "==", req.params.userCode).get();
    const tripCodes = snap.docs.map((d) => (d.data().tripCode as string)).filter(Boolean);
    res.json({ userCode: req.params.userCode, tripCodes });
  })
);

// Returns this user's role on every trip they're associated with (owned or joined).
router.get(
  "/associations/:userCode",
  requireAuth,
  asyncHandler(async (req, res) => {
    const snap = await adminDb.collection("user_trip_association_master").doc(req.params.userCode).get();
    res.json(snap.exists ? snap.data() : {});
  })
);

export default router;
