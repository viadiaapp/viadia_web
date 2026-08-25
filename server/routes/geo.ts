import { Router } from "express";
import { DEFAULT_USD_RATES } from "../data/currencyRates";

const router = Router();

const searchCache = new Map<string, { data: any; expiry: number }>();
const reverseCache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL = 3600 * 1000; // 1 hour

// Helper to convert Komoot Photon GeoJSON features to Nominatim format
function photonToNominatim(feature: any) {
  const props = feature.properties || {};
  const coords = feature.geometry?.coordinates || [0, 0];
  const name = props.name || props.street || props.city || props.country || "Location";
  const parts = [props.name, props.street, props.city || props.town || props.village, props.state, props.country].filter(Boolean);
  const displayName = Array.from(new Set(parts)).join(", ") || name;
  return {
    place_id: props.osm_id || Math.floor(Math.random() * 1000000),
    display_name: displayName,
    name: name,
    lat: String(coords[1] ?? 0),
    lon: String(coords[0] ?? 0),
    type: props.osm_value || "place",
    importance: 0.5,
  };
}

// Nominatim Search Proxy (with Komoot Photon fallback and rate-limit handling)
router.get("/nominatim/search", async (req, res) => {
  const { q, limit = "5" } = req.query;
  if (!q) {
    return res.status(400).json({ error: "Missing query parameter 'q'." });
  }
  const queryStr = (q as string).trim();
  const cacheKey = `${queryStr}_${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return res.json(cached.data);
  }

  try {
    const targetUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryStr)}&limit=${limit}`;
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "AIStudioTripPlanner/1.0 (contact: ajitkompalli@gmail.com)",
        "Accept-Language": "en",
      },
    });
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data)) {
        searchCache.set(cacheKey, { data, expiry: Date.now() + CACHE_TTL });
        return res.json(data);
      }
    } else {
      console.warn(`Nominatim search returned status ${response.status} for "${queryStr}"`);
    }
  } catch (err: any) {
    console.warn("Nominatim search request failed:", err.message);
  }

  if (cached) {
    console.warn("Serving stale cached search results");
    return res.json(cached.data);
  }

  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(queryStr)}&limit=${limit}&lang=en`;
    const photonRes = await fetch(photonUrl, { headers: { "User-Agent": "AIStudioTripPlanner/1.0" } });
    if (photonRes.ok) {
      const photonData = (await photonRes.json()) as any;
      if (photonData?.features && Array.isArray(photonData.features)) {
        const converted = photonData.features.map(photonToNominatim);
        searchCache.set(cacheKey, { data: converted, expiry: Date.now() + CACHE_TTL });
        return res.json(converted);
      }
    }
  } catch (photonErr: any) {
    console.warn("Photon fallback search failed:", photonErr.message);
  }

  res.json([]);
});

// Nominatim Reverse Proxy (with Komoot Photon fallback)
router.get("/nominatim/reverse", async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: "Missing lat or lon query parameters." });
  }
  const latFixed = Number(lat).toFixed(5);
  const lonFixed = Number(lon).toFixed(5);
  const cacheKey = `${latFixed}_${lonFixed}`;

  const cached = reverseCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return res.json(cached.data);
  }

  try {
    const targetUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "AIStudioTripPlanner/1.0 (contact: ajitkompalli@gmail.com)",
        "Accept-Language": "en",
      },
    });
    if (response.ok) {
      const data = (await response.json()) as any;
      reverseCache.set(cacheKey, { data, expiry: Date.now() + CACHE_TTL });
      return res.json(data);
    } else {
      console.warn(`Nominatim reverse returned status ${response.status}`);
    }
  } catch (err: any) {
    console.warn("Nominatim reverse request failed:", err.message);
  }

  if (cached) {
    console.warn("Serving stale cached reverse results");
    return res.json(cached.data);
  }

  try {
    const photonUrl = `https://photon.komoot.io/reverse?lat=${latFixed}&lon=${lonFixed}`;
    const photonRes = await fetch(photonUrl, { headers: { "User-Agent": "AIStudioTripPlanner/1.0" } });
    if (photonRes.ok) {
      const photonData = (await photonRes.json()) as any;
      if (photonData?.features?.[0]) {
        const converted = photonToNominatim(photonData.features[0]);
        reverseCache.set(cacheKey, { data: converted, expiry: Date.now() + CACHE_TTL });
        return res.json(converted);
      }
    }
  } catch (photonErr: any) {
    console.warn("Photon reverse fallback failed:", photonErr.message);
  }

  res.json({ display_name: `${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}` });
});

// Open-Meteo Weather Proxy
const weatherCache = new Map<string, { data: any; expiry: number }>();
router.get("/weather", async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ error: "Missing lat or lng query parameters." });
  }
  const cacheKey = `${Number(lat).toFixed(2)}_${Number(lng).toFixed(2)}`;
  const cached = weatherCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return res.json(cached.data);
  }

  try {
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&daily=sunrise,sunset&timezone=auto`;
    const response = await fetch(weatherUrl);
    if (!response.ok) {
      throw new Error(`Open-Meteo returned status ${response.status}`);
    }
    const data = await response.json();
    weatherCache.set(cacheKey, { data, expiry: Date.now() + 1800 * 1000 });
    res.json(data);
  } catch (err: any) {
    console.warn("Weather API proxy fallback used due to network issue:", err.message);
    res.json({
      current_weather: { temperature: 22.0, weathercode: 1, windspeed: 8.5, is_day: 1 },
    });
  }
});

// Forex Rates Proxy
const forexCache = new Map<string, { data: any; expiry: number }>();
router.get("/forex/:base", async (req, res) => {
  const base = (req.params.base || "USD").toUpperCase();
  const cached = forexCache.get(base);
  if (cached && cached.expiry > Date.now()) {
    return res.json(cached.data);
  }

  try {
    const response = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    if (response.ok) {
      const data = (await response.json()) as any;
      if (data && data.rates) {
        forexCache.set(base, { data, expiry: Date.now() + 3600 * 1000 });
        return res.json(data);
      }
    }
    throw new Error(`Open Exchange Rates returned status ${response.status}`);
  } catch (err: any) {
    console.warn(`Forex API proxy fallback for base ${base}:`, err.message);
    const fallbackRates: { [c: string]: number } = {};
    const baseUSD = DEFAULT_USD_RATES[base] || 1.0;
    Object.entries(DEFAULT_USD_RATES).forEach(([code, usdRate]) => {
      fallbackRates[code] = Number((usdRate / baseUSD).toFixed(6));
    });
    res.json({ result: "success", base_code: base, rates: fallbackRates });
  }
});

export default router;
