import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { logWarn } from "../_core/logger";

let database: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!database && process.env.DATABASE_URL) {
    try {
      database = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      logWarn("database_connect_failed", { error });
      database = null;
    }
  }
  return database;
}

export async function checkDatabaseHealth() {
  const startedAt = performance.now();
  const db = await getDb();
  if (!db)
    return { ok: false, latencyMs: null, reason: "database_not_configured" };
  try {
    await db.execute(sql`SELECT 1 FROM users LIMIT 1`);
    return {
      ok: true,
      latencyMs: Math.round((performance.now() - startedAt) * 10) / 10,
      reason: null,
    };
  } catch {
    return {
      ok: false,
      latencyMs: Math.round((performance.now() - startedAt) * 10) / 10,
      reason: "database_unavailable_or_not_migrated",
    };
  }
}
