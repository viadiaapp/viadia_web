import { DEFAULT_USD_RATES } from '../data/staticCurrencies';
import { Capacitor } from '@capacitor/core';

export interface LocationSearchResult {
  place_id?: number | string;
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
  type?: string;
}

/**
 * Resolves the API base URL:
 * - If running natively inside an Android / iOS Capacitor APK or custom webview,
 *   points to the live cloud backend.
 * - If running in a web browser, uses relative root paths ('') to proxy via Vite/Express.
 */
export const REMOTE_BACKEND_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_BACKEND_API_URL) ||
  'https://ais-dev-gc4q66q5xjca34g3x5iler-34061687996.asia-southeast1.run.app';

export function getApiBaseUrl(): string {
  try {
    if (Capacitor.isNativePlatform()) {
      return REMOTE_BACKEND_URL;
    }
    if (typeof window !== 'undefined') {
      const isCapacitorProtocol = window.location.protocol === 'capacitor:' || window.location.protocol === 'ionic:';
      const isLocalhostApp = window.location.hostname === 'localhost' && (!window.location.port || window.location.port === '80');
      if (isCapacitorProtocol || isLocalhostApp) {
        return REMOTE_BACKEND_URL;
      }
    }
  } catch {
    // Ignore and fallback
  }
  return '';
}

/**
 * Searches locations using public APIs with robust fallbacks:
 * 1. Nominatim OpenStreetMap Search (direct)
 * 2. Komoot Photon API (free OpenStreetMap geocoder)
 * 3. /api/nominatim/search (proxy if running on web/server)
 */
export async function searchLocationsOnline(
  query: string,
  limit = 6
): Promise<LocationSearchResult[]> {
  const clean = query.trim();
  if (!clean) return [];

  const headers = {
    'Accept': 'application/json',
    'Accept-Language': 'en',
  };

  // 1. Try Direct Nominatim OpenStreetMap (Works in Browser & Android WebViews)
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(clean)}&limit=${limit}`;
    const res = await fetch(url, { headers });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map((d: any) => ({
          place_id: d.place_id,
          display_name: d.display_name,
          name: d.name || d.display_name?.split(',')[0] || clean,
          lat: String(d.lat),
          lon: String(d.lon),
          type: d.type || 'place',
        }));
      }
    }
  } catch (e) {
    // Network or CORS error on primary Nominatim
  }

  // 2. Try Komoot Photon Geocoding API (Fast, Free, CORS-friendly, Global OSM data)
  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(clean)}&limit=${limit}&lang=en`;
    const res = await fetch(photonUrl);
    if (res.ok) {
      const photonData = await res.json();
      if (photonData?.features && Array.isArray(photonData.features) && photonData.features.length > 0) {
        return photonData.features.map((f: any) => {
          const props = f.properties || {};
          const coords = f.geometry?.coordinates || [0, 0];
          const name = props.name || props.street || props.city || clean;
          const parts = [props.name, props.street, props.city || props.town || props.village, props.state, props.country].filter(Boolean);
          const displayName = Array.from(new Set(parts)).join(', ') || name;
          return {
            place_id: props.osm_id || Math.floor(Math.random() * 1000000),
            display_name: displayName,
            name: name,
            lat: String(coords[1] ?? 0),
            lon: String(coords[0] ?? 0),
            type: props.osm_value || 'place',
          };
        });
      }
    }
  } catch (e) {
    // Photon geocoder failed
  }

  // 3. Fallback to Local Backend Proxy (if running with server.ts)
  try {
    const proxyRes = await fetch(`/api/nominatim/search?q=${encodeURIComponent(clean)}&limit=${limit}`);
    if (proxyRes.ok) {
      const proxyData = await proxyRes.json();
      if (Array.isArray(proxyData)) {
        return proxyData.map((d: any) => ({
          place_id: d.place_id,
          display_name: d.display_name,
          name: d.name || d.display_name?.split(',')[0] || clean,
          lat: String(d.lat),
          lon: String(d.lon),
          type: d.type || 'place',
        }));
      }
    }
  } catch (e) {
    // Proxy not reachable
  }

  return [];
}

/**
 * Reverse geocodes coordinates to a human-readable address:
 * 1. Direct Nominatim OpenStreetMap Reverse
 * 2. Komoot Photon Reverse
 * 3. /api/nominatim/reverse (proxy)
 */
export async function reverseGeocodeOnline(
  lat: number,
  lng: number
): Promise<string> {
  const latFixed = Number(lat).toFixed(6);
  const lngFixed = Number(lng).toFixed(6);

  // 1. Try Direct Nominatim Reverse
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latFixed}&lon=${lngFixed}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json', 'Accept-Language': 'en' } });
    if (res.ok) {
      const data = await res.json();
      if (data?.display_name) {
        return data.display_name;
      }
    }
  } catch (e) {
    // Direct Nominatim failed
  }

  // 2. Try Komoot Photon Reverse
  try {
    const photonUrl = `https://photon.komoot.io/reverse?lat=${latFixed}&lon=${lngFixed}`;
    const res = await fetch(photonUrl);
    if (res.ok) {
      const photonData = await res.json();
      if (photonData?.features?.[0]) {
        const props = photonData.features[0].properties || {};
        const name = props.name || props.street || props.city;
        const parts = [props.name, props.street, props.city || props.town, props.state, props.country].filter(Boolean);
        const displayName = Array.from(new Set(parts)).join(', ') || name;
        if (displayName) return displayName;
      }
    }
  } catch (e) {
    // Photon reverse failed
  }

  // 3. Fallback to Local Backend Proxy
  try {
    const proxyRes = await fetch(`/api/nominatim/reverse?lat=${latFixed}&lon=${lngFixed}`);
    if (proxyRes.ok) {
      const proxyData = await proxyRes.json();
      if (proxyData?.display_name) return proxyData.display_name;
    }
  } catch (e) {
    // Proxy failed
  }

  return `${latFixed}, ${lngFixed}`;
}

/**
 * Fetches real-time Forex exchange rates with multiple robust fallback endpoints:
 * 1. Open Exchange Rates API (https://open.er-api.com/v6/latest/{BASE})
 * 2. Frankfurter FX API (https://api.frankfurter.app/latest?from={BASE})
 * 3. /api/forex/{BASE} (Backend server proxy)
 * 4. Local static dataset calculation using DEFAULT_USD_RATES
 */
export async function fetchLiveForexRates(
  baseCurrency = 'USD'
): Promise<{ base: string; rates: { [currency: string]: number } }> {
  const base = (baseCurrency || 'USD').toUpperCase().trim();

  // Helper to construct rates from static dataset
  const buildOfflineRates = (): { base: string; rates: { [currency: string]: number } } => {
    const fallbackRates: { [c: string]: number } = {};
    const baseUSD = DEFAULT_USD_RATES[base] || 1.0;
    Object.entries(DEFAULT_USD_RATES).forEach(([code, usdRate]) => {
      fallbackRates[code] = Number((usdRate / baseUSD).toFixed(6));
    });
    fallbackRates[base] = 1.0;
    return { base, rates: fallbackRates };
  };

  // 1. Direct Open Exchange Rates API (CORS enabled, public, free, 160+ currencies)
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.rates && Object.keys(data.rates).length > 0) {
        return {
          base: data.base_code || base,
          rates: data.rates,
        };
      }
    }
  } catch (e) {
    // Direct open.er-api.com failed
  }

  // 2. Direct Frankfurter API (CORS enabled European Central Bank data)
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${base}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.rates) {
        return {
          base: data.base || base,
          rates: { ...data.rates, [base]: 1.0 },
        };
      }
    }
  } catch (e) {
    // Frankfurter failed
  }

  // 3. Fallback to Server Proxy
  try {
    const baseApi = getApiBaseUrl();
    const res = await fetch(`${baseApi}/api/forex/${encodeURIComponent(base)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.rates) {
        return {
          base: data.base_code || base,
          rates: data.rates,
        };
      }
    }
  } catch (e) {
    // Server proxy failed
  }

  // 4. Built-in Offline Fallback
  return buildOfflineRates();
}

export interface GeminiItineraryRequest {
  tripTitle?: string;
  countries: string[];
  startDate: string;
  endDate: string;
  cities?: string[];
  pace?: 'relaxed' | 'moderate' | 'packed';
  interests?: string[];
  customNotes?: string;
}

export interface GeneratedItineraryResponse {
  itinerary: Array<{
    date: string;
    time?: string;
    title: string;
    description: string;
    address: string;
    lat: number;
    lng: number;
    city?: string;
    category?: string;
  }>;
  tripSummary?: string;
  fallback?: boolean;
}

/**
 * Generates an AI-powered itinerary by calling the backend service (with remote fallback for Android APKs)
 */
export async function generateGeminiItineraryOnline(
  request: GeminiItineraryRequest
): Promise<GeneratedItineraryResponse> {
  const baseApi = getApiBaseUrl();
  const endpoint = `${baseApi}/api/gemini/generate-itinerary`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to generate itinerary. Please try again.');
  }

  return await res.json();
}

/**
 * Suggests popular destinations / cities for selected countries
 */
export async function suggestGeminiDestinationsOnline(
  countries: string[]
): Promise<{ destinations: Array<{ city: string; country: string; tagline: string; popularSpots?: string[] }> }> {
  const baseApi = getApiBaseUrl();
  const endpoint = `${baseApi}/api/gemini/suggest-destinations`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ countries }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to suggest destinations.');
  }

  return await res.json();
}

/**
 * Fetches real-time weather from Open-Meteo or backend proxy
 */
export async function fetchWeatherOnline(lat: number, lng: number): Promise<any> {
  // 1. Direct Open-Meteo API
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&daily=sunrise,sunset&timezone=auto`;
    const res = await fetch(url);
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Direct open-meteo failed
  }

  // 2. Backend Proxy
  try {
    const baseApi = getApiBaseUrl();
    const res = await fetch(`${baseApi}/api/weather?lat=${lat}&lng=${lng}`);
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Backend proxy failed
  }

  return {
    current_weather: {
      temperature: 22.0,
      weathercode: 1,
      windspeed: 8.5,
      is_day: 1,
    },
  };
}
