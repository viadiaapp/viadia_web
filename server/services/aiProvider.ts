import { GoogleGenAI, Type } from "@google/genai";

export interface GeneratedDestinationContent {
  localizedName: string;
  shortDescription: string;
  description: string;
  bestTimeToVisit: string;
  recommendedDays: string;
  highlights: string[];
  travelTips: string[];
  localFood: string[];
  thingsToKnow: string[];
}

export interface ResolvedCountry {
  isoCode: string;
  countryName: string;
}

type ProviderName = "gemini" | "deepseek";

function getPrimaryProvider(): ProviderName {
  const v = (process.env.AI_PROVIDER_PRIMARY || "gemini").toLowerCase();
  return v === "deepseek" ? "deepseek" : "gemini";
}

function getFallbackProvider(): ProviderName {
  const v = (process.env.AI_PROVIDER_FALLBACK || "deepseek").toLowerCase();
  return v === "gemini" ? "gemini" : "deepseek";
}

// --- Gemini ---------------------------------------------------------------

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
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

// Same model-fallback list and transient-error retry approach as routes/gemini.ts, kept identical
// so behavior is consistent regardless of which endpoint is calling Gemini.
const GEMINI_CANDIDATE_MODELS = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.1-pro-preview"];

async function callGeminiJson(prompt: string, systemInstruction: string, responseSchema: any): Promise<any> {
  const ai = getGeminiClient();
  let lastError: any = null;
  for (let i = 0; i < GEMINI_CANDIDATE_MODELS.length; i++) {
    const model = GEMINI_CANDIDATE_MODELS[i];
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { systemInstruction, responseMimeType: "application/json", responseSchema },
      });
      if (response && response.text) {
        return JSON.parse(response.text.trim());
      }
    } catch (err: any) {
      lastError = err;
      const errMsg = err?.message || String(err);
      const isTransient = errMsg.includes("503") || errMsg.includes("UNAVAILABLE") || errMsg.includes("high demand") || errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED");
      console.warn(`[Gemini Model ${model}] destination-content attempt failed (${errMsg}).`);
      if (isTransient && i < GEMINI_CANDIDATE_MODELS.length - 1) {
        const delay = Math.min(300 * Math.pow(1.5, i), 1000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError || new Error("All Gemini model candidates failed for destination content.");
}

// --- DeepSeek --------------------------------------------------------------

async function callDeepSeekJson(prompt: string, systemInstruction: string): Promise<any> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured on the server.");
  }
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DeepSeek API error ${res.status}: ${text}`);
  }
  const data: any = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("DeepSeek returned no content.");
  }
  return JSON.parse(content);
}

// --- Provider-agnostic entry points ----------------------------------------

async function runWithFallback<T>(
  geminiCall: () => Promise<T>,
  deepseekCall: () => Promise<T>
): Promise<T> {
  const providers: { name: ProviderName; call: () => Promise<T> }[] = [
    { name: "gemini", call: geminiCall },
    { name: "deepseek", call: deepseekCall },
  ];
  const primary = getPrimaryProvider();
  const fallback = getFallbackProvider();
  const ordered = [
    providers.find((p) => p.name === primary)!,
    providers.find((p) => p.name === fallback && p.name !== primary),
  ].filter(Boolean) as { name: ProviderName; call: () => Promise<T> }[];

  let lastError: any = null;
  for (const provider of ordered) {
    try {
      return await provider.call();
    } catch (err: any) {
      lastError = err;
      console.warn(`[AI provider: ${provider.name}] failed, ${provider === ordered[ordered.length - 1] ? "no more fallbacks" : "trying fallback"}: ${err?.message || err}`);
    }
  }
  throw lastError || new Error("All configured AI providers failed.");
}

const DESTINATION_CONTENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    localizedName: { type: Type.STRING, description: "The place's name, in its local language/script if different from the given name; otherwise the same name." },
    shortDescription: { type: Type.STRING, description: "One or two sentence teaser, under 200 characters." },
    description: { type: Type.STRING, description: "Three to five paragraph overview of the place, its character, and why to visit." },
    bestTimeToVisit: { type: Type.STRING, description: "Best months/season to visit and why, one to two sentences." },
    recommendedDays: { type: Type.STRING, description: "Suggested number of days to spend, e.g. '2-3 days'." },
    highlights: { type: Type.ARRAY, items: { type: Type.STRING }, description: "4-8 notable landmarks or things to do." },
    travelTips: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3-6 practical visitor tips." },
    localFood: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3-6 notable local dishes or food experiences." },
    thingsToKnow: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3-6 practical facts (currency, language, etiquette, safety)." },
  },
  required: ["localizedName", "shortDescription", "description", "bestTimeToVisit", "recommendedDays", "highlights", "travelTips", "localFood", "thingsToKnow"],
};

const DESTINATION_CONTENT_SYSTEM_INSTRUCTION =
  "You are a knowledgeable, accurate travel guide writer. Return factual, specific, well-organized content about the requested place. Do not invent facts you're unsure of -- keep descriptions general in that case rather than fabricating specifics.";

export async function generateDestinationContent(placeName: string, countryName: string): Promise<GeneratedDestinationContent> {
  const prompt = `Write travel guide content about "${placeName}" in ${countryName}.`;
  const raw = await runWithFallback(
    () => callGeminiJson(prompt, DESTINATION_CONTENT_SYSTEM_INSTRUCTION, DESTINATION_CONTENT_SCHEMA),
    () => callDeepSeekJson(prompt, DESTINATION_CONTENT_SYSTEM_INSTRUCTION + " Respond as a JSON object with these exact keys: localizedName, shortDescription, description, bestTimeToVisit, recommendedDays, highlights (array), travelTips (array), localFood (array), thingsToKnow (array).")
  );
  return raw as GeneratedDestinationContent;
}

const COUNTRY_RESOLUTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    found: { type: Type.BOOLEAN, description: "True if this is a real, identifiable place." },
    isoCode: { type: Type.STRING, description: "ISO 3166-1 alpha-2 country code (e.g. 'IN', 'FR'), uppercase." },
    countryName: { type: Type.STRING, description: "The country's common English name." },
  },
  required: ["found"],
};

const COUNTRY_RESOLUTION_SYSTEM_INSTRUCTION =
  "You identify which country a named place (city, town, region, or landmark) is located in. If the name is ambiguous or not a real place, set found to false.";

// Resolves which country a free-typed place name actually belongs to, so it can be checked
// against the country the frontend expected (the trip/list context the user was browsing in).
export async function resolveCountryForPlaceName(placeName: string): Promise<ResolvedCountry | null> {
  const prompt = `What country is "${placeName}" located in?`;
  const raw = await runWithFallback(
    () => callGeminiJson(prompt, COUNTRY_RESOLUTION_SYSTEM_INSTRUCTION, COUNTRY_RESOLUTION_SCHEMA),
    () => callDeepSeekJson(prompt, COUNTRY_RESOLUTION_SYSTEM_INSTRUCTION + " Respond as a JSON object with keys: found (boolean), isoCode (string), countryName (string).")
  );
  if (!raw || raw.found !== true || !raw.isoCode) return null;
  return { isoCode: String(raw.isoCode).toUpperCase(), countryName: String(raw.countryName || "") };
}
