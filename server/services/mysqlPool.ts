import mysql from "mysql2/promise";

// Connection pool to the Hostinger-hosted MySQL database backing destinations/destination_content/
// destination_images (see server/services/destinationsService.ts). Created lazily so a missing
// config doesn't crash the whole server at startup -- only requests that actually touch this
// data fail, same philosophy as the Gemini client in routes/gemini.ts.
let pool: mysql.Pool | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured on the server.`);
  }
  return value;
}

export function getMysqlPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: getRequiredEnv("MYSQL_HOST"),
      port: process.env.MYSQL_PORT ? Number(process.env.MYSQL_PORT) : 3306,
      user: getRequiredEnv("MYSQL_USER"),
      password: getRequiredEnv("MYSQL_PASSWORD"),
      database: getRequiredEnv("MYSQL_DATABASE"),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      // Hostinger's shared MySQL sometimes sits behind a idle-connection timeout shorter than the
      // pool's default keep-alive; enabling this lets mysql2 recover a dropped connection instead
      // of surfacing a confusing "Connection lost" error on the next query.
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });
  }
  return pool;
}
