import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { DEFAULT_APP_DATA } from "./src/data/seedData";
import { DEFAULT_USD_RATES } from "./src/data/staticCurrencies";
import { Trip } from "./src/types";
import dotenv from "dotenv"

let geminiClient: GoogleGenAI | null = null;
dotenv.config()
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log(apiKey)
  if (!apiKey) {
    throw new Error(
      "Gemini API key is not configured. Please ensure GEMINI_API_KEY is configured in Settings > Secrets."
    );
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return geminiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to parse JSON bodies
  app.use(express.json({ limit: "10mb" }));

  // CORS middleware for Web and Native Mobile/Capacitor clients
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-user-id");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // In-memory store for shared trips, pre-populated with seed trips
  const sharedTrips = new Map<string, Trip>();

  if (DEFAULT_APP_DATA.trips) {
    const tripsList = Object.values(DEFAULT_APP_DATA.trips);
    if (tripsList[0]) {
      sharedTrips.set("EUROPE", tripsList[0]);
    }
    if (tripsList[1]) {
      sharedTrips.set("TOKYO8", tripsList[1]);
    }
  }

  // API Routes
  // 1. Get a trip by code
  app.get("/api/trips/:code", (req, res) => {
    const code = req.params.code.toUpperCase().trim();
    const trip = sharedTrips.get(code);
    if (!trip) {
      return res.status(404).json({ error: "Trip not found. Please verify the 6-character alphanumeric code." });
    }
    res.json(trip);
  });

  // 2. Share/register a trip with a code
  app.post("/api/trips", (req, res) => {
    const { trip, code: requestedCode } = req.body;
    if (!trip) {
      return res.status(400).json({ error: "Missing trip data." });
    }

    let code = requestedCode?.toUpperCase().trim();
    
    // Host-side permission check:
    if (code && sharedTrips.has(code)) {
      const existingTrip = sharedTrips.get(code);
      if (existingTrip && existingTrip.ownerUid) {
        const userId = req.headers["x-user-id"] || req.body.userId;
        const isOwner = userId && userId === existingTrip.ownerUid;
        const isAllowed = existingTrip.allowOthersToModify === true;
        if (!isOwner && !isAllowed) {
          return res.status(403).json({ 
            error: "Action is unauthorized. Please seek permission from the trip owner to allow modification of this trip." 
          });
        }
      }
    }

    if (!code || code.length !== 6 || !/^[A-Z0-9]{6}$/.test(code)) {
      // Generate a random 6-character alphanumeric code
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      do {
        code = "";
        for (let i = 0; i < 6; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
      } while (sharedTrips.has(code));
    }

    trip.code = code;
    sharedTrips.set(code, trip);
    res.json({ code, trip });
  });

  // Nominatim Cache setup
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
      importance: 0.5
    };
  }

  // 3. Nominatim Search Proxy (with Komoot Photon fallback and rate-limit handling)
  app.get("/api/nominatim/search", async (req, res) => {
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

    // Try Nominatim primary
    try {
      const targetUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryStr)}&limit=${limit}`;
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "AIStudioTripPlanner/1.0 (contact: ajitkompalli@gmail.com)",
          "Accept-Language": "en"
        }
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

    // Fallback 1: Return stale cache if available
    if (cached) {
      console.warn("Serving stale cached search results");
      return res.json(cached.data);
    }

    // Fallback 2: Try Komoot Photon API (free OpenStreetMap geocoder)
    try {
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(queryStr)}&limit=${limit}&lang=en`;
      const photonRes = await fetch(photonUrl, {
        headers: { "User-Agent": "AIStudioTripPlanner/1.0" }
      });
      if (photonRes.ok) {
        const photonData = await photonRes.json();
        if (photonData?.features && Array.isArray(photonData.features)) {
          const converted = photonData.features.map(photonToNominatim);
          searchCache.set(cacheKey, { data: converted, expiry: Date.now() + CACHE_TTL });
          return res.json(converted);
        }
      }
    } catch (photonErr: any) {
      console.warn("Photon fallback search failed:", photonErr.message);
    }

    // Fallback 3: Return empty array smoothly instead of 500 error
    res.json([]);
  });

  // 4. Nominatim Reverse Proxy (with Komoot Photon fallback)
  app.get("/api/nominatim/reverse", async (req, res) => {
    const { lat, lon } = req.query;
    if (!lat || !lon) {
      return res.status(400).json({ error: "Missing lat or lon query parameters." });
    }
    // Round to 5 decimal places (~1.1 meters) to improve cache hit rate
    const latFixed = Number(lat).toFixed(5);
    const lonFixed = Number(lon).toFixed(5);
    const cacheKey = `${latFixed}_${lonFixed}`;

    const cached = reverseCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return res.json(cached.data);
    }

    // Try Nominatim primary
    try {
      const targetUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "AIStudioTripPlanner/1.0 (contact: ajitkompalli@gmail.com)",
          "Accept-Language": "en"
        }
      });
      if (response.ok) {
        const data = await response.json();
        reverseCache.set(cacheKey, { data, expiry: Date.now() + CACHE_TTL });
        return res.json(data);
      } else {
        console.warn(`Nominatim reverse returned status ${response.status}`);
      }
    } catch (err: any) {
      console.warn("Nominatim reverse request failed:", err.message);
    }

    // Fallback 1: Return stale cache
    if (cached) {
      console.warn("Serving stale cached reverse results");
      return res.json(cached.data);
    }

    // Fallback 2: Try Komoot Photon Reverse
    try {
      const photonUrl = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`;
      const photonRes = await fetch(photonUrl, {
        headers: { "User-Agent": "AIStudioTripPlanner/1.0" }
      });
      if (photonRes.ok) {
        const photonData = await photonRes.json();
        if (photonData?.features?.[0]) {
          const converted = photonToNominatim(photonData.features[0]);
          reverseCache.set(cacheKey, { data: converted, expiry: Date.now() + CACHE_TTL });
          return res.json(converted);
        }
      }
    } catch (photonErr: any) {
      console.warn("Photon reverse fallback failed:", photonErr.message);
    }

    // Fallback 3: Return coordinate string smoothly
    res.json({ display_name: `${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}` });
  });

  // 5. Open-Meteo Weather Proxy
  const weatherCache = new Map<string, { data: any; expiry: number }>();
  app.get("/api/weather", async (req, res) => {
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
      const fallbackData = {
        current_weather: {
          temperature: 22.0,
          weathercode: 1,
          windspeed: 8.5,
          is_day: 1
        }
      };
      res.json(fallbackData);
    }
  });

  // 6. Forex Rates Proxy
  const forexCache = new Map<string, { data: any; expiry: number }>();
  app.get("/api/forex/:base", async (req, res) => {
    const base = (req.params.base || "USD").toUpperCase();
    const cacheKey = base;
    const cached = forexCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return res.json(cached.data);
    }

    try {
      const response = await fetch(`https://open.er-api.com/v6/latest/${base}`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.rates) {
          forexCache.set(cacheKey, { data, expiry: Date.now() + 3600 * 1000 });
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
      const fallbackData = {
        result: "success",
        base_code: base,
        rates: fallbackRates
      };
      res.json(fallbackData);
    }
  });

  // Curated database of top destinations for resilient fallback
  const CURATED_DESTINATIONS: Record<string, Array<{ city: string; country: string; tagline: string; popularSpots: string[] }>> = {
    japan: [
      { city: "Tokyo", country: "Japan", tagline: "Futuristic metropolis with serene historic shrines", popularSpots: ["Shibuya Crossing & Hachiko", "Senso-ji Temple Asakusa", "Shinjuku Gyoen National Garden", "Meiji Jingu Shrine"] },
      { city: "Kyoto", country: "Japan", tagline: "Cultural heartland of thousands of peaceful temples", popularSpots: ["Fushimi Inari Taisha", "Kinkaku-ji Golden Pavilion", "Arashiyama Bamboo Grove", "Kiyomizu-dera"] },
      { city: "Osaka", country: "Japan", tagline: "Energetic food capital with vibrant neon nightlife", popularSpots: ["Dotonbori Canal Walk", "Osaka Castle Park", "Kuromon Ichiba Market"] },
      { city: "Nara", country: "Japan", tagline: "Ancient imperial capital with friendly sacred deer", popularSpots: ["Todai-ji & Great Buddha", "Nara Deer Park", "Kasuga Taisha Shrine"] },
      { city: "Hakone", country: "Japan", tagline: "Scenic hot spring haven with views of Mount Fuji", popularSpots: ["Lake Ashi Cruise", "Hakone Ropeway & Owakudani", "Hakone Open-Air Museum"] },
      { city: "Hiroshima & Miyajima", country: "Japan", tagline: "Peace memorial and floating torii shrine", popularSpots: ["Peace Memorial Park", "Itsukushima Floating Torii Gate"] },
    ],
    italy: [
      { city: "Rome", country: "Italy", tagline: "Eternal city of ancient emperors and grand piazzas", popularSpots: ["Colosseum & Roman Forum", "Trevi Fountain", "Pantheon & Piazza Navona", "Vatican Museums"] },
      { city: "Florence", country: "Italy", tagline: "Cradle of the Renaissance with timeless Tuscan art", popularSpots: ["Duomo Santa Maria del Fiore", "Uffizi Gallery", "Ponte Vecchio", "Piazzale Michelangelo"] },
      { city: "Venice", country: "Italy", tagline: "Romantic labyrinth of canals, bridges and gondolas", popularSpots: ["St. Mark's Square & Basilica", "Doge's Palace", "Rialto Bridge", "Grand Canal"] },
      { city: "Milan", country: "Italy", tagline: "World fashion capital and Gothic architectural marvel", popularSpots: ["Duomo di Milano", "Galleria Vittorio Emanuele II", "Santa Maria delle Grazie"] },
      { city: "Amalfi Coast", country: "Italy", tagline: "Dramatic coastal cliffs and pastel hillside villages", popularSpots: ["Positano Beachfront", "Ravello Villa Rufolo", "Path of the Gods Hike"] },
    ],
    france: [
      { city: "Paris", country: "France", tagline: "City of Light, iconic arts and riverside charm", popularSpots: ["Eiffel Tower & Champ de Mars", "Louvre Museum", "Montmartre & Sacré-Cœur", "Seine River Walk"] },
      { city: "Nice & Côte d'Azur", country: "France", tagline: "Sun-drenched Mediterranean coastal paradise", popularSpots: ["Promenade des Anglais", "Old Town (Vieux Nice)", "Castle Hill Viewpoint"] },
      { city: "Lyon", country: "France", tagline: "Gastronomic capital with Renaissance passageways", popularSpots: ["Old Lyon (Vieux Lyon)", "Fourvière Basilica", "Presqu'île"] },
      { city: "Bordeaux", country: "France", tagline: "Wine capital of the world with elegant boulevards", popularSpots: ["Place de la Bourse", "La Cité du Vin", "Saint-André Cathedral"] },
    ],
    unitedstates: [
      { city: "New York City", country: "United States", tagline: "Electrifying cultural capital that never sleeps", popularSpots: ["Central Park", "Times Square", "Brooklyn Bridge", "Empire State Building"] },
      { city: "San Francisco", country: "United States", tagline: "Breathtaking bay vistas and historic cable cars", popularSpots: ["Golden Gate Bridge", "Fisherman's Wharf & Pier 39", "Alcatraz Island"] },
      { city: "Los Angeles", country: "United States", tagline: "Sunny coastal beaches and global entertainment hub", popularSpots: ["Hollywood Walk of Fame", "Santa Monica Pier", "Griffith Observatory"] },
      { city: "Las Vegas", country: "United States", tagline: "Desert resort oasis of dazzling entertainment", popularSpots: ["The Strip", "Bellagio Fountains", "Fremont Street"] },
    ],
    spain: [
      { city: "Barcelona", country: "Spain", tagline: "Gaudí's architectural wonderland by the Mediterranean", popularSpots: ["Sagrada Família", "Park Güell", "Gothic Quarter", "Casa Batlló"] },
      { city: "Madrid", country: "Spain", tagline: "Royal boulevards, art museums and lively tapas plazas", popularSpots: ["Prado Museum", "Royal Palace of Madrid", "Plaza Mayor", "Retiro Park"] },
      { city: "Seville", country: "Spain", tagline: "Soulful flamenco, historic palaces and sunny plazas", popularSpots: ["Royal Alcázar of Seville", "Seville Cathedral", "Plaza de España"] },
    ],
    unitedkingdom: [
      { city: "London", country: "United Kingdom", tagline: "Historic royal landmarks and global culture", popularSpots: ["Big Ben & Westminster", "British Museum", "Tower Bridge", "Hyde Park"] },
      { city: "Edinburgh", country: "United Kingdom", tagline: "Dramatic castle hills and cobblestone Royal Mile", popularSpots: ["Edinburgh Castle", "Royal Mile", "Arthur's Seat"] },
      { city: "Bath", country: "United Kingdom", tagline: "Ancient Roman baths and Georgian architecture", popularSpots: ["Roman Baths", "The Royal Crescent", "Bath Abbey"] },
    ],
    germany: [
      { city: "Berlin", country: "Germany", tagline: "Dynamic history, art culture and modern spirit", popularSpots: ["Brandenburg Gate", "Museum Island", "Berlin Wall Memorial", "Reichstag Building"] },
      { city: "Munich", country: "Germany", tagline: "Bavarian traditions, royal parks and historic beer halls", popularSpots: ["Marienplatz", "English Garden", "Nymphenburg Palace"] },
    ],
    switzerland: [
      { city: "Zurich", country: "Switzerland", tagline: "Scenic alpine lake and vibrant cultural streets", popularSpots: ["Old Town (Altstadt)", "Lake Zurich Promenade", "Bahnhofstrasse"] },
      { city: "Lucerne", country: "Switzerland", tagline: "Postcard wooden bridges under dramatic mountain peaks", popularSpots: ["Chapel Bridge", "Mount Pilatus", "Lion Monument"] },
      { city: "Interlaken", country: "Switzerland", tagline: "Alpine adventure wonderland between two lakes", popularSpots: ["Jungfraujoch Top of Europe", "Lauterbrunnen Valley", "Lake Brienz"] },
    ],
    singapore: [
      { city: "Singapore", country: "Singapore", tagline: "Futuristic garden city with world-class dining", popularSpots: ["Marina Bay Sands SkyPark", "Gardens by the Bay", "Chinatown & Hawker Centers", "Sentosa Island"] },
    ],
    thailand: [
      { city: "Bangkok", country: "Thailand", tagline: "Gilded temples, floating markets and street life", popularSpots: ["Grand Palace & Wat Phra Kaew", "Wat Arun", "Chatuchak Weekend Market"] },
      { city: "Chiang Mai", country: "Thailand", tagline: "Mountain sanctuary with ancient temples and night bazaars", popularSpots: ["Wat Phra That Doi Suthep", "Old City Temples", "Night Bazaar"] },
      { city: "Phuket", country: "Thailand", tagline: "Turquoise waters, limestone islands and beach life", popularSpots: ["Phang Nga Bay", "Old Phuket Town", "Big Buddha"] },
    ],
  };

  // Helper to get curated destination suggestions
  function getCuratedDestinations(countries: string[]) {
    const results: Array<{ city: string; country: string; tagline: string; popularSpots: string[] }> = [];
    
    for (const c of countries) {
      const normalized = c.toLowerCase().replace(/[^a-z]/g, "");
      let matched = false;
      for (const [key, dests] of Object.entries(CURATED_DESTINATIONS)) {
        if (normalized.includes(key) || key.includes(normalized)) {
          results.push(...dests);
          matched = true;
          break;
        }
      }
      if (!matched) {
        results.push(
          { city: `${c} Capital & Historic Center`, country: c, tagline: `Iconic central landmarks and cultural heritage of ${c}`, popularSpots: ["Historic Old Town", "National Museum", "Central Square"] },
          { city: `${c} Coastal / Scenic Region`, country: c, tagline: `Breathtaking scenic viewpoints and local nature in ${c}`, popularSpots: ["Scenic Promenade", "Local Market", "Panorama Viewpoint"] },
          { city: `${c} Cultural District`, country: c, tagline: `Vibrant dining, boutique shops and heritage walks in ${c}`, popularSpots: ["Cultural Quarter", "Artisan Alley", "Botanical Gardens"] }
        );
      }
    }
    return results.slice(0, 10);
  }

  // Fallback itinerary generator when AI model has temporary outage / 503 spike
  function generateCuratedFallbackItinerary(params: {
    tripTitle?: string;
    countries: string[];
    startDate: string;
    endDate: string;
    cities?: string[];
    pace?: string;
    interests?: string[];
  }) {
    const { countries, startDate, endDate, cities = [], pace = "moderate" } = params;
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    const days: string[] = [];
    
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      const cur = new Date(start);
      while (cur <= end && days.length < 30) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, "0");
        const d = String(cur.getDate()).padStart(2, "0");
        days.push(`${y}-${m}-${d}`);
        cur.setDate(cur.getDate() + 1);
      }
    }
    if (days.length === 0) days.push(startDate);

    const activeCities = (cities && cities.length > 0)
      ? cities
      : getCuratedDestinations(countries).slice(0, 3).map((d) => d.city);

    const stopsPerDay = pace === "relaxed" ? 2 : pace === "packed" ? 4 : 3;
    const items: Array<{
      date: string;
      time: string;
      title: string;
      description: string;
      address: string;
      lat: number;
      lng: number;
      city: string;
      category: string;
    }> = [];

    const activityTemplates = [
      { time: "09:30", category: "Sightseeing", getTitle: (c: string) => `${c} Historic Old Town & Landmark Walk`, getDesc: (c: string) => `Stroll through the scenic historic district of ${c}. Explore iconic architectural monuments, photogenic squares, and historic alleyways.` },
      { time: "12:30", category: "Food & Dining", getTitle: (c: string) => `Artisan Market & Local Cuisine Experience in ${c}`, getDesc: (c: string) => `Immerse in the local culinary scene. Sample fresh regional specialties, visit traditional food stalls, and relax at a charming outdoor cafe.` },
      { time: "15:00", category: "Culture", getTitle: (c: string) => `${c} Premier Art & Heritage Museum`, getDesc: (c: string) => `Discover renowned exhibitions, master artworks, and rich local historical collections with panoramic views from the courtyard.` },
      { time: "18:30", category: "Scenic View", getTitle: (c: string) => `Sunset Viewpoint & Promenade Walk in ${c}`, getDesc: (c: string) => `Catch golden hour views over ${c}. Follow the scenic waterfront or hilltop viewpoint as the city lights begin to illuminate the skyline.` },
    ];

    days.forEach((dateStr, dIdx) => {
      const city = activeCities[dIdx % activeCities.length] || countries[0] || "Destination";
      const country = countries[0] || "";
      const baseLat = 40.0 + (dIdx * 0.1) % 5;
      const baseLng = 10.0 + (dIdx * 0.1) % 5;

      for (let s = 0; s < stopsPerDay; s++) {
        const tmpl = activityTemplates[s % activityTemplates.length];
        items.push({
          date: dateStr,
          time: tmpl.time,
          title: tmpl.getTitle(city),
          description: tmpl.getDesc(city),
          address: `Central District, ${city}, ${country}`,
          lat: Number((baseLat + (s * 0.015)).toFixed(6)),
          lng: Number((baseLng + (s * 0.015)).toFixed(6)),
          city,
          category: tmpl.category,
        });
      }
    });

    return {
      tripSummary: `A curated ${days.length}-day travel journey through ${countries.join(", ")} highlighting ${activeCities.slice(0, 3).join(", ")} with balanced sightseeing, cultural immersion, and local dining.`,
      itinerary: items,
    };
  }

  // Resilient Gemini generateContent caller with model fallback chain and backoff
  async function generateGeminiWithFallback(prompt: string, config: any) {
    const ai = getGeminiClient();
    // Models to try in priority order: CHEAPEST FIRST (lowest cost to highest cost)
    const candidateModels = [
      "gemini-3.1-flash-lite", // Cheapest / ultra low cost tier
      "gemini-flash-latest",   // Standard Flash
      "gemini-3.6-flash",      // Flash 3.6
      "gemini-3.7-flash",      // Flash 3.7
      "gemini-3.1-pro-preview" // Pro tier (highest cost)
    ];

    let lastError: any = null;

    for (let i = 0; i < candidateModels.length; i++) {
      const model = candidateModels[i];
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config,
        });

        if (response && response.text) {
          const parsed = JSON.parse(response.text.trim());
          return parsed;
        }
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || String(err);
        const isTransient = errMsg.includes("503") || 
                            errMsg.includes("UNAVAILABLE") || 
                            errMsg.includes("high demand") || 
                            errMsg.includes("429") || 
                            errMsg.includes("RESOURCE_EXHAUSTED");
        
        console.warn(`[Gemini Model ${model}] attempt failed (${errMsg}). Trying next fallback model if available...`);
        
        if (isTransient && i < candidateModels.length - 1) {
          // Brief exponential backoff before trying next model
          const delay = Math.min(300 * Math.pow(1.5, i), 1000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error("All Gemini model candidates encountered temporary high demand.");
  }

  // 7. Gemini: Suggest popular destinations / cities for countries (with resilient fallback)
  app.post("/api/gemini/suggest-destinations", async (req, res) => {
    const { countries } = req.body;
    if (!countries || !Array.isArray(countries) || countries.length === 0) {
      return res.status(400).json({ error: "Missing or invalid 'countries' array." });
    }

    try {
      const prompt = `Suggest top 6 to 10 recommended travel destinations/cities/regions for a trip to: ${countries.join(", ")}. Provide their name, country, a short catchy 4-8 word highlight tagline, and 2-3 notable landmarks.`;

      const parsed = await generateGeminiWithFallback(prompt, {
        systemInstruction: "You are a world-class travel planner assistant. Return accurate, top-rated destinations for the given countries.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            destinations: {
              type: Type.ARRAY,
              description: "List of top destination cities or regions.",
              items: {
                type: Type.OBJECT,
                properties: {
                  city: { type: Type.STRING, description: "City or region name." },
                  country: { type: Type.STRING, description: "Country name." },
                  tagline: { type: Type.STRING, description: "Short highlight summary." },
                  popularSpots: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Notable landmarks."
                  }
                },
                required: ["city", "country", "tagline"]
              }
            }
          },
          required: ["destinations"]
        }
      });

      if (parsed && Array.isArray(parsed.destinations) && parsed.destinations.length > 0) {
        return res.json(parsed);
      }
      throw new Error("Invalid output from Gemini destination suggestion.");
    } catch (err: any) {
      console.warn("Serving curated destination suggestions due to Gemini 503 / temporary load:", err?.message);
      const curated = getCuratedDestinations(countries);
      res.json({
        destinations: curated,
        fallback: true
      });
    }
  });

  // 8. Gemini: Auto-generate full itinerary timeline (with resilient fallback)
  app.post("/api/gemini/generate-itinerary", async (req, res) => {
    const {
      tripTitle,
      countries,
      startDate,
      endDate,
      cities,
      pace = "moderate",
      interests = [],
      customNotes = ""
    } = req.body;

    if (!countries || !Array.isArray(countries) || countries.length === 0) {
      return res.status(400).json({ error: "Trip country list is required." });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Trip start date and end date are required." });
    }

    try {
      const cityContext = cities && cities.length > 0
        ? `Target cities / destinations requested by the user: ${Array.isArray(cities) ? cities.join(", ") : cities}.`
        : `Explore key highlights across the countries: ${countries.join(", ")}.`;

      const interestContext = interests && interests.length > 0
        ? `User interests and focus areas: ${interests.join(", ")}.`
        : "";

      const notesContext = customNotes && customNotes.trim().length > 0
        ? `Specific user requests/preferences: "${customNotes.trim()}".`
        : "";

      const paceGuidance =
        pace === "relaxed"
          ? "Provide a relaxed schedule with 1 to 2 well-paced, scenic stops per day with plenty of leisure time."
          : pace === "packed"
          ? "Provide an action-packed schedule with 3 to 4 exciting, well-sequenced stops per day covering morning, afternoon, and evening."
          : "Provide a balanced moderate schedule with 2 to 3 well-sequenced stops per day (e.g. morning, afternoon, and optional evening/dinner highlight).";

      const prompt = `You are generating a daily travel itinerary for a trip titled "${tripTitle || 'Vacation'}".
Trip Countries: ${countries.join(", ")}
Trip Duration: From ${startDate} to ${endDate}.
${cityContext}
${interestContext}
${notesContext}
Pace: ${paceGuidance}

CRITICAL RULES:
1. For every day between ${startDate} and ${endDate} inclusive, generate realistic itinerary activity stops.
2. DO NOT include airline flights, trains between countries/cities, or hotel check-in/check-out vouchers (the user manages flights and hotel bookings separately).
3. Focus purely on sightseeing attractions, historical landmarks, cultural activities, nature walks, scenic viewpoints, neighborhood walking tours, local markets, and renowned dining experiences.
4. For EACH stop, provide:
   - "date": the specific date in "YYYY-MM-DD" format (must be within ${startDate} and ${endDate}).
   - "time": the start time of the activity in 24-hour "HH:MM" format (e.g. "09:30", "14:00", "19:00").
   - "title": clear, evocative landmark or activity name (e.g. "Louvre Museum & Courtyard", "Fushimi Inari Shrine Hike", "Trastevere Evening Food Tour").
   - "description": 2 to 3 practical, engaging sentences describing what to do, highlights, and helpful visitor tips.
   - "address": a real, accurate physical address including city and country.
   - "lat": precise numeric latitude coordinate.
   - "lng": precise numeric longitude coordinate.
   - "city": city or district name.
   - "category": category type (e.g. "Sightseeing", "Culture", "Food & Dining", "Nature", "Shopping", "Scenic View").
5. Sequence activities logically within each day geographically to minimize unnecessary travel back and forth.`;

      const parsed = await generateGeminiWithFallback(prompt, {
        systemInstruction: "You are an expert global travel guide creating realistic, geographically coherent travel itineraries.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tripSummary: {
              type: Type.STRING,
              description: "A 1-2 sentence compelling summary of the curated itinerary."
            },
            itinerary: {
              type: Type.ARRAY,
              description: "Array of scheduled activity items across the entire trip date range.",
              items: {
                type: Type.OBJECT,
                properties: {
                  date: {
                    type: Type.STRING,
                    description: "Date in YYYY-MM-DD format."
                  },
                  time: {
                    type: Type.STRING,
                    description: "Time in HH:MM format."
                  },
                  title: {
                    type: Type.STRING,
                    description: "Name of the attraction or activity."
                  },
                  description: {
                    type: Type.STRING,
                    description: "Helpful description and visitor tips."
                  },
                  address: {
                    type: Type.STRING,
                    description: "Real physical address with city and country."
                  },
                  lat: {
                    type: Type.NUMBER,
                    description: "Accurate latitude."
                  },
                  lng: {
                    type: Type.NUMBER,
                    description: "Accurate longitude."
                  },
                  city: {
                    type: Type.STRING,
                    description: "City or region."
                  },
                  category: {
                    type: Type.STRING,
                    description: "Category of the stop."
                  }
                },
                required: ["date", "time", "title", "description", "address", "lat", "lng"]
              }
            }
          },
          required: ["itinerary"]
        }
      });

      if (parsed && Array.isArray(parsed.itinerary) && parsed.itinerary.length > 0) {
        return res.json(parsed);
      }
      throw new Error("Invalid itinerary structure from Gemini model.");
    } catch (err: any) {
      console.warn("Serving curated fallback itinerary due to Gemini 503 / temporary load:", err?.message);
      const fallbackItinerary = generateCuratedFallbackItinerary({
        tripTitle,
        countries,
        startDate,
        endDate,
        cities,
        pace,
        interests,
      });
      res.json({
        ...fallbackItinerary,
        fallback: true
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT,() => {
    console.log(`Server running on ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server", err);
});
