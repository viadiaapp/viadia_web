import { getMysqlPool } from "./mysqlPool";
import {
  slugify,
  findDestinationByCountryAndName,
  insertNewDestination,
  backfillContentIfMissing,
  backfillImageIfMissing,
  DestinationRow,
} from "./destinationsService";
import { resolveCountryForPlaceName } from "./aiProvider";

export type UserDestinationStatus = "pending" | "approved" | "rejected";

export interface UserDestinationRow {
  id: number;
  submitted_name: string;
  submitted_slug: string;
  country_code: string;
  resolved_country_name: string | null;
  submitted_by_user_code: string;
  submitted_from_trip_code: string | null;
  status: UserDestinationStatus;
  destination_id: string | null;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

function getSubmissionsPerDayLimit(): number | null {
  const raw = process.env.USER_DESTINATION_SUBMISSIONS_PER_DAY;
  if (!raw || !raw.trim()) return null; // unset = unlimited
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function countSubmissionsToday(userCode: string): Promise<number> {
  const pool = getMysqlPool();
  const [rows]: any = await pool.query(
    `SELECT COUNT(*) AS cnt FROM user_destinations
     WHERE submitted_by_user_code = ? AND created_at >= UTC_DATE()`,
    [userCode]
  );
  return rows[0]?.cnt ?? 0;
}

export type SubmitUserDestinationResult =
  | { outcome: "rate_limited" }
  | { outcome: "invalid_place"; message: string }
  | { outcome: "country_mismatch"; resolvedCountryName: string | null }
  | { outcome: "already_exists"; destination: DestinationRow }
  | { outcome: "already_queued"; entry: UserDestinationRow }
  | { outcome: "queued"; entry: UserDestinationRow };

interface SubmitUserDestinationParams {
  name: string;
  expectedCountryCode: string;
  userCode: string;
  tripCode?: string | null;
}

// Records a user's free-typed "place not in the list" as a pending moderation entry. Never
// inserts into the main `destinations` table and never triggers content/image generation --
// that only happens once an admin explicitly approves (see approveUserDestination below).
export async function submitUserDestination(params: SubmitUserDestinationParams): Promise<SubmitUserDestinationResult> {
  const limit = getSubmissionsPerDayLimit();
  if (limit !== null) {
    const countToday = await countSubmissionsToday(params.userCode);
    if (countToday >= limit) {
      return { outcome: "rate_limited" };
    }
  }

  const placeName = params.name.trim();
  const isoCode = params.expectedCountryCode.trim().toUpperCase();

  // Cheap verification only -- catches typos/gibberish and wrong-country submissions before
  // they ever reach the review queue or the submitter's own trip.
  const resolved = await resolveCountryForPlaceName(placeName);
  if (!resolved) {
    return { outcome: "invalid_place", message: `Could not identify "${placeName}" as a real place.` };
  }
  if (resolved.isoCode !== isoCode) {
    return { outcome: "country_mismatch", resolvedCountryName: resolved.countryName };
  }

  // Already a real, known destination (curated or a previously-approved user submission) --
  // no need to queue anything, just point the caller at what already exists.
  const existing = await findDestinationByCountryAndName(isoCode, placeName);
  if (existing) {
    return { outcome: "already_exists", destination: existing };
  }

  const slug = slugify(placeName);
  const pool = getMysqlPool();

  // Dedupe: a second submission of the same (country, place) reuses the existing queue entry
  // rather than creating a duplicate row for an admin to review twice.
  const [existingRows]: any = await pool.query(
    "SELECT * FROM user_destinations WHERE country_code = ? AND submitted_slug = ? LIMIT 1",
    [isoCode, slug]
  );
  if (existingRows.length > 0) {
    return { outcome: "already_queued", entry: existingRows[0] as UserDestinationRow };
  }

  await pool.query(
    `INSERT INTO user_destinations
      (submitted_name, submitted_slug, country_code, resolved_country_name, submitted_by_user_code, submitted_from_trip_code, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [placeName, slug, isoCode, resolved.countryName, params.userCode, params.tripCode ?? null]
  );

  const [rows]: any = await pool.query(
    "SELECT * FROM user_destinations WHERE country_code = ? AND submitted_slug = ? LIMIT 1",
    [isoCode, slug]
  );
  return { outcome: "queued", entry: rows[0] as UserDestinationRow };
}

export async function listPendingUserDestinations(): Promise<UserDestinationRow[]> {
  const pool = getMysqlPool();
  const [rows]: any = await pool.query(
    "SELECT * FROM user_destinations WHERE status = 'pending' ORDER BY created_at ASC"
  );
  return rows as UserDestinationRow[];
}

async function getUserDestinationById(id: number): Promise<UserDestinationRow | null> {
  const pool = getMysqlPool();
  const [rows]: any = await pool.query("SELECT * FROM user_destinations WHERE id = ? LIMIT 1", [id]);
  return rows.length > 0 ? (rows[0] as UserDestinationRow) : null;
}

// For a destination Gemini suggests during itinerary generation (see routes/gemini.ts). Not a
// human free-typed submission, so it doesn't go through the pending-review queue -- but it does
// still get dedup-checked against existing destinations first (same function /resolve's trusted
// path uses), so Gemini re-suggesting an already-known place (curated or previously approved)
// never creates a duplicate row.
export async function resolveAiGeneratedDestination(
  name: string,
  countryCode: string
): Promise<DestinationRow> {
  const existing = await findDestinationByCountryAndName(countryCode, name);
  if (existing) {
    void backfillContentIfMissing(existing.destination_id, name, countryCode);
    void backfillImageIfMissing(existing.destination_id, name, countryCode);
    return existing;
  }

  const created = await insertNewDestination({
    isoCode: countryCode,
    name,
    source: "user_submitted",
  });

  // Auto-approved rather than queued as 'pending' -- this is our own system generating the
  // suggestion, not open human input, so it skips the moderation gate entirely. Still recorded
  // in user_destinations (status already 'approved') so it surfaces under "Destinations visited
  // by other travellers" for future users, and so the audit trail distinguishes this from a
  // human-reviewed approval.
  const pool = getMysqlPool();
  await pool.query(
    `INSERT INTO user_destinations
      (submitted_name, submitted_slug, country_code, resolved_country_name, submitted_by_user_code, status, destination_id, admin_notes, reviewed_at)
     VALUES (?, ?, ?, ?, 'system', 'approved', ?, 'Auto-approved via AI itinerary generation', UTC_TIMESTAMP())`,
    [name, slugify(name), countryCode.toUpperCase(), countryCode.toUpperCase(), created.destination_id]
  );

  void backfillContentIfMissing(created.destination_id, name, countryCode);
  void backfillImageIfMissing(created.destination_id, name, countryCode);

  return created;
}

export async function approveUserDestination(
  id: number,
  reviewedBy: string,
  adminNotes?: string
): Promise<{ ok: true; destination: DestinationRow } | { ok: false; error: string }> {
  const entry = await getUserDestinationById(id);
  if (!entry) return { ok: false, error: "Submission not found." };
  if (entry.status !== "pending") return { ok: false, error: `Submission is already ${entry.status}.` };

  const created = await insertNewDestination({
    isoCode: entry.country_code,
    name: entry.submitted_name,
    source: "user_submitted",
  });

  const pool = getMysqlPool();
  await pool.query(
    `UPDATE user_destinations
     SET status = 'approved', destination_id = ?, reviewed_by = ?, admin_notes = ?, reviewed_at = UTC_TIMESTAMP()
     WHERE id = ?`,
    [created.destination_id, reviewedBy, adminNotes ?? null, id]
  );

  // Same fire-and-forget generation used for every other new destination -- approval is what
  // unlocks the expensive Gemini/Unsplash calls that were withheld at submission time.
  void backfillContentIfMissing(created.destination_id, entry.submitted_name, entry.resolved_country_name || entry.country_code);
  void backfillImageIfMissing(created.destination_id, entry.submitted_name, entry.resolved_country_name || entry.country_code);

  return { ok: true, destination: created };
}

export async function rejectUserDestination(
  id: number,
  reviewedBy: string,
  adminNotes?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const entry = await getUserDestinationById(id);
  if (!entry) return { ok: false, error: "Submission not found." };
  if (entry.status !== "pending") return { ok: false, error: `Submission is already ${entry.status}.` };

  const pool = getMysqlPool();
  await pool.query(
    `UPDATE user_destinations
     SET status = 'rejected', reviewed_by = ?, admin_notes = ?, reviewed_at = UTC_TIMESTAMP()
     WHERE id = ?`,
    [reviewedBy, adminNotes ?? null, id]
  );
  return { ok: true };
}

export interface ApprovedUserDestinationSummary {
  destination_id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
}

// The "User Traveled Destinations" list for a country -- only ever approved entries, joined
// against destinations/destination_images for display data.
export async function getApprovedUserDestinationsForCountry(countryCode: string): Promise<ApprovedUserDestinationSummary[]> {
  const pool = getMysqlPool();
  const [rows]: any = await pool.query(
    `SELECT d.destination_id, d.name, d.latitude, d.longitude, i.image_url
     FROM user_destinations ud
     JOIN destinations d ON d.destination_id = ud.destination_id
     LEFT JOIN destination_images i
       ON i.destination_id = d.destination_id AND i.image_type = 'cover' AND i.is_active = 1
     WHERE ud.status = 'approved' AND ud.country_code = ?
     ORDER BY d.name ASC`,
    [countryCode.toUpperCase()]
  );
  return rows as ApprovedUserDestinationSummary[];
}
