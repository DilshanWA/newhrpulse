import "dotenv/config";
import { getMigrations } from "better-auth/db/migration";
import { auth } from "./auth.js";
import { migrate, pool } from "./db.js";

try {
  await migrate();
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
  console.log("Database migrated.");
} finally {
  await pool.end();
}
