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
    // Pins every pooled connection's MySQL *session* to UTC (not just the client-side date
    // parsing) -- without this, a query like `WHERE created_at >= UTC_DATE()` compares an
    // explicitly-UTC function result against a TIMESTAMP column displayed in whatever the
    // server's default session time zone happens to be, which is silently wrong if that isn't
    // UTC. Runs once per new physical connection the pool opens, not per query.
    //
    // IMPORTANT: the pool's raw 'connection' event hands back a callback-style connection object
    // -- NOT the promise-wrapped kind mysql2/promise otherwise gives you everywhere else. Calling
    // .query(sql).catch(...) on it throws synchronously ("not a promise") inside this handler,
    // which was silently hanging every subsequent query on that connection indefinitely (empirically
    // reproduced and confirmed against a real MariaDB instance -- this was a real, production
    // 504-causing bug, not theoretical). Must use the callback signature instead.
    pool.on("connection", (connection) => {
      // See the comment above: types claim promise-based, runtime is callback-style for this
      // specific event -- confirmed empirically, not a real type-safety concern.
      (connection as any).query("SET time_zone = '+00:00'", (err: any) => {
        if (err) {
          console.error("Failed to set MySQL session time zone to UTC:", err?.message || err);
        }
      });
    });
  }
  return pool;
}
