import defaultBanner from '../assets/images/default_banner.webp';
import { staticCurrenciesSeed } from '../data/staticCurrencies';

// Vite eager glob to auto-import all images in src/assets/images/
const bannerModules = import.meta.glob<{ default: string }>(
  '../assets/images/*.{webp,jpg,jpeg,png,avif,svg}',
  { eager: true }
);

/**
 * Normalizes a country name or filename to a clean lowercase slug.
 * e.g. "United States" -> "united_states"
 * e.g. "Côte d'Ivoire" -> "cote_d_ivoire"
 */
export function normalizeCountrySlug(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9]+/g, '_')     // Replace non-alphanumeric chars with _
    .replace(/^_+|_+$/g, '');        // Trim leading/trailing underscores
}

/**
 * Resolves a 2-character lowercase ISO country code from either a country name or an ISO code string.
 * e.g. "India" -> "in", "IN" -> "in", "United States" -> "us", "France" -> "fr"
 */
export function getCountryIsoCode(input: string): string | null {
  if (!input || !input.trim()) return null;
  const cleanInput = input.trim();

  // If input is already a 2-letter ISO code (e.g. "IN", "US", "FR")
  if (cleanInput.length === 2 && /^[a-zA-Z]{2}$/.test(cleanInput)) {
    return cleanInput.toLowerCase();
  }

  // Exact lookup by country name or ISO code in staticCurrenciesSeed
  const lower = cleanInput.toLowerCase();
  const match = staticCurrenciesSeed.find(
    c => c.countryName.toLowerCase() === lower ||
         c.isoCode.toLowerCase() === lower ||
         c.id.toLowerCase() === lower
  );

  if (match) {
    return match.isoCode.toLowerCase();
  }

  // Partial/contains match fallback
  const partialMatch = staticCurrenciesSeed.find(
    c => c.countryName.toLowerCase().includes(lower) || lower.includes(c.countryName.toLowerCase())
  );

  if (partialMatch) {
    return partialMatch.isoCode.toLowerCase();
  }

  return null;
}

/**
 * Resolves the banner image URL for a given country or country list using 2-char ISO codes.
 * - If multiple countries are selected, uses the FIRST country in the list.
 * - Looks for local asset files first, then default fallback.
 */
export function getCountryBannerUrl(
  countries?: string[] | string | null,
  tripTitle?: string
): string {
  let primaryCountry = '';

  if (Array.isArray(countries)) {
    if (countries.length > 0 && countries[0]) {
      primaryCountry = countries[0];
    }
  } else if (typeof countries === 'string' && countries.trim()) {
    primaryCountry = countries.trim();
  }

  if (!primaryCountry || !primaryCountry.trim()) {
    return getFallbackBannerUrl();
  }

  // Resolve 2-character ISO code
  const isoCode = getCountryIsoCode(primaryCountry);
  const countrySlug = normalizeCountrySlug(primaryCountry);

  // 1. Search imported local banner modules
  for (const path in bannerModules) {
    const filename = path.split('/').pop()?.toLowerCase() || '';
    const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
    const fileSlug = normalizeCountrySlug(nameWithoutExt);

    if (isoCode) {
      if (
        fileSlug === `${isoCode}_banner` ||
        fileSlug === isoCode ||
        fileSlug.startsWith(`${isoCode}_banner`) ||
        fileSlug.startsWith(`${isoCode}-banner`) ||
        fileSlug.startsWith(`${isoCode}_`)
      ) {
        const module = bannerModules[path];
        if (module && module.default) {
          return module.default;
        }
      }
    }

    if (countrySlug) {
      if (
        fileSlug === countrySlug ||
        fileSlug.startsWith(`${countrySlug}_`) ||
        fileSlug.startsWith(`${countrySlug}-`)
      ) {
        const module = bannerModules[path];
        if (module && module.default) {
          return module.default;
        }
      }
    }
  }

  // 2. Fallback if no country-specific banner was found
  return getFallbackBannerUrl();
}

/**
 * Retrieves the fallback banner image from src/assets/images/
 * Looks for default_banner, fallback_banner, fallback, or default image, otherwise returns defaultBanner.
 */
export function getFallbackBannerUrl(): string {
  for (const path in bannerModules) {
    const filename = path.split('/').pop()?.toLowerCase() || '';
    if (
      filename.includes('default_banner') ||
      filename.includes('fallback') ||
      filename.includes('default')
    ) {
      const module = bannerModules[path];
      if (module && module.default) {
        return module.default;
      }
    }
  }
  return defaultBanner;
}
