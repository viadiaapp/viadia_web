import { getMysqlPool } from "./mysqlPool";
import { generateDestinationContent, resolveCountryForPlaceName } from "./aiProvider";
import { searchUnsplashPhoto } from "./unsplashService";

export interface DestinationRow {
  destination_id: string;
  country_code: string;
  name: string;
  slug: string;
  rank: number | null;
  latitude: number | null;
  longitude: number | null;
  destination_type: string | null;
  state_name: string | null;
  region_name: string | null;
  timezone: string | null;
  currency_code: string | null;
  is_active: boolean;
  source: "curated" | "user_submitted";
}

export interface DestinationContentRow {
  destination_id: string;
  language_code: string;
  localized_name: string | null;
  short_description: string | null;
  description: string | null;
  best_time_to_visit: string | null;
  recommended_days: string | null;
  highlights: string[] | null;
  travel_tips: string[] | null;
  local_food: string[] | null;
  things_to_know: string[] | null;
  extra_data: any | null;
}

export interface DestinationImageRow {
  destination_id: string;
  image_type: string;
  is_active: boolean;
  unsplash_photo_id: string;
  image_url: string;
  image_url_small: string | null;
  photographer_name: string | null;
  photographer_username: string | null;
  photographer_profile_url: string | null;
  unsplash_photo_url: string | null;
  download_location: string | null;
  width: number | null;
  height: number | null;
  alt_description: string | null;
  blur_hash: string | null;
}

export interface DestinationFull {
  destination: DestinationRow;
  content: DestinationContentRow | null;
  image: DestinationImageRow | null;
}

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Builds a unique destination_id of the form {iso_lowercase}_{slug}, appending _2, _3, etc. when
// the same country already has a *different* place at that slug -- per the request, this can
// happen since destination_id itself has no uniqueness constraint beyond being the primary key,
// separate from the (country_code, slug) unique key on the base slug.
async function generateUniqueDestinationId(isoCode: string, baseSlug: string): Promise<{ id: string; slug: string }> {
  const pool = getMysqlPool();
  const iso = isoCode.toLowerCase();
  let slug = baseSlug;
  let suffix = 1;
  while (true) {
    const id = `${iso}_${slug}`;
    const [rows]: any = await pool.query("SELECT destination_id FROM destinations WHERE destination_id = ? LIMIT 1", [id]);
    if (rows.length === 0) {
      return { id, slug };
    }
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
}

export async function findDestinationByCountryAndName(countryCode: string, name: string): Promise<DestinationRow | null> {
  const pool = getMysqlPool();
  const slug = slugify(name);
  const [rows]: any = await pool.query(
    "SELECT * FROM destinations WHERE country_code = ? AND slug = ? LIMIT 1",
    [countryCode.toUpperCase(), slug]
  );
  return rows.length > 0 ? (rows[0] as DestinationRow) : null;
}

export interface CuratedDestinationSummary {
  destination_id: string;
  country_code: string;
  name: string;
  rank: number | null;
  latitude: number | null;
  longitude: number | null;
}

// Replaces the static per-country JSON files -- one query covers every requested country at
// once. Only curated destinations (the migrated JSON data); user-submitted approved entries
// have their own separate "visited by other travellers" list/endpoint. Ordered by rank with
// nulls sorted last (MySQL has no native NULLS LAST -- `(rank IS NULL) ASC` sorts non-null ranks
// before null ones, matching Postgres's NULLS LAST behavior).
export async function getCuratedDestinationsForCountries(countryCodes: string[]): Promise<Map<string, CuratedDestinationSummary[]>> {
  const cleaned = Array.from(new Set(countryCodes.map((c) => c.trim().toUpperCase()).filter(Boolean)));
  const result = new Map<string, CuratedDestinationSummary[]>();
  if (cleaned.length === 0) return result;

  const pool = getMysqlPool();
  const placeholders = cleaned.map(() => "?").join(", ");
  const [rows]: any = await pool.query(
    `SELECT destination_id, country_code, name, rank, latitude, longitude
     FROM destinations
     WHERE country_code IN (${placeholders}) AND source = 'curated' AND is_active = 1
     ORDER BY country_code ASC, (rank IS NULL) ASC, rank ASC, name ASC`,
    cleaned
  );

  for (const code of cleaned) result.set(code, []);
  for (const row of rows as CuratedDestinationSummary[]) {
    result.get(row.country_code)?.push(row);
  }
  return result;
}

export async function getDestinationById(destinationId: string): Promise<DestinationRow | null> {
  const pool = getMysqlPool();
  const [rows]: any = await pool.query("SELECT * FROM destinations WHERE destination_id = ? LIMIT 1", [destinationId]);
  return rows.length > 0 ? (rows[0] as DestinationRow) : null;
}

function parseJsonColumn(value: any): any {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value; // mysql2 already parses JSON columns into objects in most configurations
}

export async function getDestinationContent(destinationId: string, languageCode = "en"): Promise<DestinationContentRow | null> {
  const pool = getMysqlPool();
  const [rows]: any = await pool.query(
    "SELECT * FROM destination_content WHERE destination_id = ? AND language_code = ? LIMIT 1",
    [destinationId, languageCode]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    ...row,
    highlights: parseJsonColumn(row.highlights),
    travel_tips: parseJsonColumn(row.travel_tips),
    local_food: parseJsonColumn(row.local_food),
    things_to_know: parseJsonColumn(row.things_to_know),
    extra_data: parseJsonColumn(row.extra_data),
  };
}

export async function getDestinationImage(destinationId: string): Promise<DestinationImageRow | null> {
  const pool = getMysqlPool();
  const [rows]: any = await pool.query(
    "SELECT * FROM destination_images WHERE destination_id = ? AND image_type = 'cover' AND is_active = 1 LIMIT 1",
    [destinationId]
  );
  return rows.length > 0 ? (rows[0] as DestinationImageRow) : null;
}

export async function getDestinationFull(destinationId: string, languageCode = "en"): Promise<DestinationFull | null> {
  const destination = await getDestinationById(destinationId);
  if (!destination) return null;
  const [content, image] = await Promise.all([
    getDestinationContent(destinationId, languageCode),
    getDestinationImage(destinationId),
  ]);
  return { destination, content, image };
}

export interface BatchImageLookupItem {
  name: string;
  countryCode: string;
}

export interface BatchImageLookupResult {
  name: string;
  countryCode: string;
  imageUrl: string | null;
  imageUrlSmall: string | null;
}

// Strictly read-only: looks up whichever of the given (name, countryCode) pairs already have a
// destination row AND a cached cover image, in a single query. Never inserts a destination and
// never triggers content/image generation -- unlike resolveDestination()/the /resolve endpoint,
// this is safe to call for a whole list of destinations at once without risking N simultaneous
// Gemini/Unsplash calls for the ones that aren't cached yet. Anything not found (or found but
// without an image yet) is simply omitted from the result rather than being generated on the fly.
export async function batchGetCachedImages(items: BatchImageLookupItem[]): Promise<BatchImageLookupResult[]> {
  const cleaned = items
    .map((item) => ({ name: item.name.trim(), countryCode: item.countryCode.trim().toUpperCase(), slug: slugify(item.name) }))
    .filter((item) => item.name && item.countryCode && item.slug);
  if (cleaned.length === 0) return [];

  const pool = getMysqlPool();
  // (country_code, slug) IN ((?, ?), (?, ?), ...) -- one round trip for the whole list, rather
  // than one query per destination.
  const tuplePlaceholders = cleaned.map(() => "(?, ?)").join(", ");
  const params = cleaned.flatMap((item) => [item.countryCode, item.slug]);

  const [rows]: any = await pool.query(
    `SELECT d.country_code, d.slug, d.name AS db_name, i.image_url, i.image_url_small
     FROM destinations d
     JOIN destination_images i
       ON i.destination_id = d.destination_id
      AND i.image_type = 'cover'
      AND i.is_active = 1
     WHERE (d.country_code, d.slug) IN (${tuplePlaceholders})`,
    params
  );

  // Match rows back to the caller's original (name, countryCode) pairs via the same slug the
  // query matched on, so the response uses the name the caller passed in rather than requiring
  // them to also know each destination's stored db name.
  const bySlugAndCountry = new Map<string, any>(
    rows.map((r: any) => [`${r.country_code}_${r.slug}`, r])
  );

  const results: BatchImageLookupResult[] = [];
  for (const item of cleaned) {
    const row = bySlugAndCountry.get(`${item.countryCode}_${item.slug}`);
    if (row) {
      results.push({
        name: item.name,
        countryCode: item.countryCode,
        imageUrl: row.image_url,
        imageUrlSmall: row.image_url_small,
      });
    }
  }
  return results;
}

interface InsertDestinationParams {
  isoCode: string;
  name: string;
  rank?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  destinationType?: string | null;
  stateName?: string | null;
  regionName?: string | null;
  timezone?: string | null;
  currencyCode?: string | null;
  source?: "curated" | "user_submitted";
}

export async function insertNewDestination(params: InsertDestinationParams): Promise<DestinationRow> {
  const pool = getMysqlPool();
  const baseSlug = slugify(params.name);
  const { id, slug } = await generateUniqueDestinationId(params.isoCode, baseSlug);
  await pool.query(
    `INSERT INTO destinations
      (destination_id, country_code, name, slug, rank, latitude, longitude, destination_type, state_name, region_name, timezone, currency_code, is_active, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)`,
    [
      id,
      params.isoCode.toUpperCase(),
      params.name,
      slug,
      params.rank ?? null,
      params.latitude ?? null,
      params.longitude ?? null,
      params.destinationType ?? null,
      params.stateName ?? null,
      params.regionName ?? null,
      params.timezone ?? null,
      params.currencyCode ?? null,
      params.source ?? "curated",
    ]
  );
  const created = await getDestinationById(id);
  if (!created) throw new Error("Failed to read back newly inserted destination.");
  return created;
}

async function upsertDestinationContent(destinationId: string, content: Awaited<ReturnType<typeof generateDestinationContent>>, languageCode = "en"): Promise<void> {
  const pool = getMysqlPool();
  await pool.query(
    `INSERT INTO destination_content
      (destination_id, language_code, localized_name, short_description, description, best_time_to_visit, recommended_days, highlights, travel_tips, local_food, things_to_know)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       localized_name = VALUES(localized_name),
       short_description = VALUES(short_description),
       description = VALUES(description),
       best_time_to_visit = VALUES(best_time_to_visit),
       recommended_days = VALUES(recommended_days),
       highlights = VALUES(highlights),
       travel_tips = VALUES(travel_tips),
       local_food = VALUES(local_food),
       things_to_know = VALUES(things_to_know)`,
    [
      destinationId,
      languageCode,
      content.localizedName,
      content.shortDescription,
      content.description,
      content.bestTimeToVisit,
      content.recommendedDays,
      JSON.stringify(content.highlights || []),
      JSON.stringify(content.travelTips || []),
      JSON.stringify(content.localFood || []),
      JSON.stringify(content.thingsToKnow || []),
    ]
  );
}

async function upsertDestinationImage(destinationId: string, photo: NonNullable<Awaited<ReturnType<typeof searchUnsplashPhoto>>>): Promise<void> {
  const pool = getMysqlPool();
  await pool.query(
    `INSERT INTO destination_images
      (destination_id, image_type, is_active, unsplash_photo_id, image_url, image_url_small, photographer_name, photographer_username, photographer_profile_url, unsplash_photo_url, download_location, width, height, alt_description, blur_hash)
     VALUES (?, 'cover', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       is_active = 1,
       unsplash_photo_id = VALUES(unsplash_photo_id),
       image_url = VALUES(image_url),
       image_url_small = VALUES(image_url_small),
       photographer_name = VALUES(photographer_name),
       photographer_username = VALUES(photographer_username),
       photographer_profile_url = VALUES(photographer_profile_url),
       unsplash_photo_url = VALUES(unsplash_photo_url),
       download_location = VALUES(download_location),
       width = VALUES(width),
       height = VALUES(height),
       alt_description = VALUES(alt_description),
       blur_hash = VALUES(blur_hash)`,
    [
      destinationId,
      photo.unsplashPhotoId,
      photo.imageUrl,
      photo.imageUrlSmall,
      photo.photographerName,
      photo.photographerUsername,
      photo.photographerProfileUrl,
      photo.unsplashPhotoUrl,
      photo.downloadLocation,
      photo.width,
      photo.height,
      photo.altDescription,
      photo.blurHash,
    ]
  );
}

// Fire-and-forget: generates and stores the "about" content for a destination if it's missing.
// Never throws to the caller -- errors are logged, since this always runs detached from the HTTP
// response per the request (frontend just re-fetches later; a failed generation simply leaves the
// content empty for that later fetch to retry, rather than crashing anything).
export async function backfillContentIfMissing(destinationId: string, placeName: string, countryName: string): Promise<void> {
  try {
    const existing = await getDestinationContent(destinationId);
    if (existing) return;
    const generated = await generateDestinationContent(placeName, countryName);
    await upsertDestinationContent(destinationId, generated);
  } catch (err: any) {
    console.error(`Destination content generation failed for ${destinationId}:`, err?.message || err);
  }
}

export async function backfillImageIfMissing(destinationId: string, placeName: string, countryName: string): Promise<void> {
  try {
    const existing = await getDestinationImage(destinationId);
    if (existing) return;
    const photo = await searchUnsplashPhoto(placeName, countryName);
    if (!photo) return;
    await upsertDestinationImage(destinationId, photo);
  } catch (err: any) {
    console.error(`Destination image fetch failed for ${destinationId}:`, err?.message || err);
  }
}

export { resolveCountryForPlaceName };
