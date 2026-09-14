import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { findAirportByIataCode, searchAirports } from "../services/airportsService";

const router = Router();

// Declared before /:iataCode -- otherwise Express would match a request for /search against the
// dynamic route first and treat "search" itself as an IATA code.
router.get(
  "/search",
  asyncHandler(async (req, res) => {
    const q = req.query.q;
    if (!q || typeof q !== "string" || !q.trim()) {
      return res.status(400).json({ error: "q query parameter is required." });
    }
    const results = await searchAirports(q, 20);
    res.json({ results });
  })
);

router.get(
  "/:iataCode",
  asyncHandler(async (req, res) => {
    const iataCode = String(req.params.iataCode);
    if (iataCode.length !== 3) {
      return res.status(400).json({ error: "IATA code must be 3 characters." });
    }
    const airport = await findAirportByIataCode(iataCode);
    if (!airport) {
      return res.status(404).json({ error: "Airport not found." });
    }
    res.json(airport);
  })
);

export default router;
