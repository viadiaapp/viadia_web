import { Router } from "express";
import { GoogleGenAI, Type } from "@google/genai";

const router = Router();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY is missing");
}

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });
  }
  return geminiClient;
}

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

  const activeCities = cities && cities.length > 0 ? cities : getCuratedDestinations(countries).slice(0, 3).map((d) => d.city);
  const stopsPerDay = pace === "relaxed" ? 2 : pace === "packed" ? 4 : 3;
  const items: Array<{ date: string; time: string; title: string; description: string; address: string; lat: number; lng: number; city: string; category: string }> = [];

  const activityTemplates = [
    { time: "09:30", category: "Sightseeing", getTitle: (c: string) => `${c} Historic Old Town & Landmark Walk`, getDesc: (c: string) => `Stroll through the scenic historic district of ${c}. Explore iconic architectural monuments, photogenic squares, and historic alleyways.` },
    { time: "12:30", category: "Food & Dining", getTitle: (c: string) => `Artisan Market & Local Cuisine Experience in ${c}`, getDesc: (c: string) => `Immerse in the local culinary scene. Sample fresh regional specialties, visit traditional food stalls, and relax at a charming outdoor cafe.` },
    { time: "15:00", category: "Culture", getTitle: (c: string) => `${c} Premier Art & Heritage Museum`, getDesc: (c: string) => `Discover renowned exhibitions, master artworks, and rich local historical collections with panoramic views from the courtyard.` },
    { time: "18:30", category: "Scenic View", getTitle: (c: string) => `Sunset Viewpoint & Promenade Walk in ${c}`, getDesc: (c: string) => `Catch golden hour views over ${c}. Follow the scenic waterfront or hilltop viewpoint as the city lights begin to illuminate the skyline.` },
  ];

  days.forEach((dateStr, dIdx) => {
    const city = activeCities[dIdx % activeCities.length] || countries[0] || "Destination";
    const country = countries[0] || "";
    const baseLat = 40.0 + ((dIdx * 0.1) % 5);
    const baseLng = 10.0 + ((dIdx * 0.1) % 5);

    for (let s = 0; s < stopsPerDay; s++) {
      const tmpl = activityTemplates[s % activityTemplates.length];
      items.push({
        date: dateStr,
        time: tmpl.time,
        title: tmpl.getTitle(city),
        description: tmpl.getDesc(city),
        address: `Central District, ${city}, ${country}`,
        lat: Number((baseLat + s * 0.015).toFixed(6)),
        lng: Number((baseLng + s * 0.015).toFixed(6)),
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

async function generateGeminiWithFallback(prompt: string, config: any) {
  const ai = getGeminiClient();
  const candidateModels = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.1-pro-preview"];

  let lastError: any = null;
  for (let i = 0; i < candidateModels.length; i++) {
    const model = candidateModels[i];
    try {
      const response = await ai.models.generateContent({ model, contents: prompt, config });
      if (response && response.text) {
        return JSON.parse(response.text.trim());
      }
    } catch (err: any) {
      lastError = err;
      const errMsg = err?.message || String(err);
      const isTransient = errMsg.includes("503") || errMsg.includes("UNAVAILABLE") || errMsg.includes("high demand") || errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED");
      console.warn(`[Gemini Model ${model}] attempt failed (${errMsg}). Trying next fallback model if available...`);
      if (isTransient && i < candidateModels.length - 1) {
        const delay = Math.min(300 * Math.pow(1.5, i), 1000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError || new Error("All Gemini model candidates encountered temporary high demand.");
}

router.post("/suggest-destinations", async (req, res) => {
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
                popularSpots: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Notable landmarks." },
              },
              required: ["city", "country", "tagline"],
            },
          },
        },
        required: ["destinations"],
      },
    });

    if (parsed && Array.isArray(parsed.destinations) && parsed.destinations.length > 0) {
      return res.json(parsed);
    }
    throw new Error("Invalid output from Gemini destination suggestion.");
  } catch (err: any) {
    console.warn("Serving curated destination suggestions due to Gemini 503 / temporary load:", err?.message);
    res.json({ destinations: getCuratedDestinations(countries), fallback: true });
  }
});

router.post("/generate-itinerary", async (req, res) => {
  const { tripTitle, countries, startDate, endDate, cities, pace = "moderate", interests = [], customNotes = "" } = req.body;

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
    const interestContext = interests && interests.length > 0 ? `User interests and focus areas: ${interests.join(", ")}.` : "";
    const notesContext = customNotes && customNotes.trim().length > 0 ? `Specific user requests/preferences: "${customNotes.trim()}".` : "";
    const paceGuidance =
      pace === "relaxed"
        ? "Provide a relaxed schedule with 1 to 2 well-paced, scenic stops per day with plenty of leisure time."
        : pace === "packed"
          ? "Provide an action-packed schedule with 3 to 4 exciting, well-sequenced stops per day covering morning, afternoon, and evening."
          : "Provide a balanced moderate schedule with 2 to 3 well-sequenced stops per day (e.g. morning, afternoon, and optional evening/dinner highlight).";

    const prompt = `You are generating a daily travel itinerary for a trip titled "${tripTitle || "Vacation"}".
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
          tripSummary: { type: Type.STRING, description: "Brief 2-3 sentence overview of the trip experience." },
          itinerary: {
            type: Type.ARRAY,
            description: "Array of scheduled activity items.",
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING, description: "YYYY-MM-DD" },
                time: { type: Type.STRING, description: "HH:MM in 24h format" },
                title: { type: Type.STRING, description: "Activity name" },
                description: { type: Type.STRING, description: "Brief details and tips" },
                address: { type: Type.STRING, description: "Physical location address" },
                lat: { type: Type.NUMBER, description: "Latitude coordinate" },
                lng: { type: Type.NUMBER, description: "Longitude coordinate" },
                city: { type: Type.STRING, description: "City or district name" },
                category: { type: Type.STRING, description: "Activity category" },
              },
              required: ["date", "time", "title", "description", "address", "lat", "lng", "city", "category"],
            },
          },
        },
        required: ["tripSummary", "itinerary"],
      },
    });

    if (parsed && Array.isArray(parsed.itinerary) && parsed.itinerary.length > 0) {
      return res.json(parsed);
    }
    throw new Error("Invalid output from Gemini itinerary generator.");
  } catch (err: any) {
    console.warn("Serving curated fallback itinerary due to Gemini error:", err?.message);
    res.json(generateCuratedFallbackItinerary({ tripTitle, countries, startDate, endDate, cities, pace, interests }));
  }
});

export default router;
