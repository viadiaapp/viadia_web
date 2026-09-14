import { getMysqlPool } from "./mysqlPool";

export interface AirportRow {
  airport_id: number;
  iata_code: string | null;
  icao_code: string | null;
  name: string;
  municipality: string | null;
  country_code: string;
  latitude: number;
  longitude: number;
  airport_type: "medium_airport" | "small_airport";
}

export interface AirportSearchResult {
  iata_code: string | null;
  name: string;
  municipality: string | null;
  country_code: string;
}

// Exact lookup by IATA code -- the fallback path when the frontend's bundled large-airports JSON
// doesn't have the code the user searched for.
export async function findAirportByIataCode(iataCode: string): Promise<AirportRow | null> {
  const pool = getMysqlPool();
  const [rows]: any = await pool.query(
    `SELECT airport_id, iata_code, icao_code, name, municipality, country_code, latitude, longitude, airport_type
     FROM airports
     WHERE iata_code = ?
     LIMIT 1`,
    [iataCode.toUpperCase()]
  );
  return rows.length > 0 ? (rows[0] as AirportRow) : null;
}

// Prefix-based autocomplete across IATA code, airport name, and municipality. All three use
// a trailing-wildcard LIKE ("term%"), which can still use the idx_airports_iata and
// idx_airports_municipality indexes (a leading wildcard like "%term%" could not).
export async function searchAirports(term: string, limit = 20): Promise<AirportSearchResult[]> {
  const pool = getMysqlPool();
  const trimmed = term.trim();
  if (!trimmed) return [];
  const prefix = `${trimmed}%`;
  const [rows]: any = await pool.query(
    `SELECT iata_code, name, municipality, country_code
     FROM airports
     WHERE iata_code LIKE ?
        OR name LIKE ?
        OR municipality LIKE ?
     LIMIT ?`,
    [prefix, prefix, prefix, limit]
  );
  return rows as AirportSearchResult[];
}
