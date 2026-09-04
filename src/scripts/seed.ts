import fs from "node:fs";
import process from "node:process";

import { getDb } from "../lib/db";
import { roles, users } from "../lib/db/schema";
import { eq } from "drizzle-orm";

import { hashPassword } from "../lib/auth/password";

const ROLE_NAMES = ["admin", "teacher", "student", "aspirant"] as const;

async function main(): Promise<void> {
  // Load env (mirrors drizzle.config.ts) so DATABASE_URL resolves for the client.
  if (fs.existsSync(".env.local")) process.loadEnvFile?.(".env.local");
  if (fs.existsSync(".env")) process.loadEnvFile?.(".env");

  const db = getDb();

  // 1. Four roles (idempotent).
  await db
    .insert(roles)
    .values(ROLE_NAMES.map((name) => ({ name })))
    .onConflictDoNothing();

  console.log("Ensured roles: admin, teacher, student, aspirant");

  // 2. Bootstrap Admin from env.
  const identifier = process.env.BOOTSTRAP_ADMIN_IDENTIFIER;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!identifier || !password) {
    throw new Error(
      "BOOTSTRAP_ADMIN_IDENTIFIER and BOOTSTRAP_ADMIN_PASSWORD must be set in .env.local to seed the admin.",
    );
  }

  const [adminRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.name, "admin"))
    .limit(1);

  if (!adminRole) {
    throw new Error("admin role missing after insert — seed aborted.");
  }

  const passwordHash = await hashPassword(password);
  const fullName = process.env.BOOTSTRAP_ADMIN_FULL_NAME ?? "Bootstrap Administrator";

  await db
    .insert(users)
    .values({
      roleId: adminRole.id,
      fullName,
      identifier,
      identifierType: "staff_id",
      passwordHash,
    })
    .onConflictDoNothing();

  console.log(`Ensured bootstrap admin (identifier="${identifier}", role=admin)`);
  console.log("Seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("Seed failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
