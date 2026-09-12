import { defineConfig } from "drizzle-kit";
import { loadEnvFile } from "node:process";

try {
  loadEnvFile(".env.local");
} catch {
  try {
    loadEnvFile(".env");
  } catch {}
}

const directUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!directUrl) {
  throw new Error(
    "DIRECT_URL (or DATABASE_URL) is required for drizzle-kit. Set it in .env.local — see README.md.",
  );
}

export default defineConfig({
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: directUrl,
  },
});
