import "dotenv/config";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { users } from "../drizzle/schema";
import { bootstrapInitialAdmin } from "./bootstrapAdminService";

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL é obrigatória para criar o administrador.");
  }

  const pool = mysql.createPool({
    uri: databaseUrl,
    connectionLimit: 2,
  });

  try {
    const database = drizzle(pool);
    const repository = {
      async hasUsers() {
        const existing = await database
          .select({ id: users.id })
          .from(users)
          .limit(1);
        return existing.length > 0;
      },
      async createAdmin(data: {
        username: string;
        passwordHash: string;
        name: string;
        email?: string;
      }) {
        await database.insert(users).values({
          username: data.username,
          passwordHash: data.passwordHash,
          name: data.name,
          email: data.email ?? null,
          loginMethod: "local",
          role: "admin",
          lastSignedIn: new Date(),
        });
      },
    };

    const result = await bootstrapInitialAdmin(
      {
        username: process.env.ADMIN_USERNAME ?? "",
        password: process.env.ADMIN_PASSWORD ?? "",
        name: process.env.ADMIN_NAME ?? "",
        email: process.env.ADMIN_EMAIL,
      },
      repository,
      password => bcrypt.hash(password, 12),
    );

    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "info",
        event: result.created
          ? "initial_admin_created"
          : "initial_admin_skipped",
        reason: result.reason ?? null,
      }),
    );
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      event: "initial_admin_failed",
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
