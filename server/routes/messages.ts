import { Router } from "express";
import { adminDb } from "../firebaseAdmin";
import { optionalAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Same counter-based generation scheme as the client's generateNextTicketId() in src/lib/db.ts
// (ticket_code/CURRENT counter, TKT{series}{6digits} format).
async function generateNextTicketId(): Promise<string> {
  const counterRef = adminDb.collection("ticket_code").doc("CURRENT");
  try {
    return await adminDb.runTransaction(async (tx) => {
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
      const assigned = `TKT${seriesCode}${formattedNum}`;

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
  } catch (err: any) {
    console.warn("generateNextTicketId transaction failed, using fallback:", err?.message);
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    return `TKTA${randomDigits}`;
  }
}

// Contact-us messages are allowed from guests too (WebLanding.tsx), so this stays optionalAuth.
// Fields match src/types.ts's InboundMessage exactly: topic (not subject), isResolved (not
// IsResolved), response (not Response), no uid field, keyed by ticketId (not a free-form id).
router.post(
  "/",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const ticketId = body.ticketId || (await generateNextTicketId());
    const record = {
      ticketId,
      name: body.name || "",
      email: body.email || "",
      topic: body.topic || "Contact Us Inquiry",
      message: body.message || "",
      userCode: body.userCode || "",
      createdAt: body.createdAt || new Date().toISOString(),
      isResolved: false,
      response: "",
    };
    await adminDb.collection("inbound_messages").doc(ticketId).set(record, { merge: true });
    res.json({ success: true, ticketId });
  })
);

export default router;
