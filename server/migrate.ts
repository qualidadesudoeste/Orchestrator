import "dotenv/config";
import path from "node:path";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL é obrigatória para aplicar migrations.");
  }
  const pool = mysql.createPool({
    uri: databaseUrl,
    connectionLimit: 2,
  });
  try {
    const database = drizzle(pool);
    const migrationsFolder =
      process.env.MIGRATIONS_FOLDER ??
      path.resolve(process.cwd(), "drizzle");
    await migrate(database, { migrationsFolder });
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      event: "migrations_complete",
    }));
  } finally {
    await pool.end();
  }
}

runMigrations().catch(error => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "error",
    event: "migrations_failed",
    message: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
});
