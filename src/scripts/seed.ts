import fs from "node:fs";
import process from "node:process";

import { getDb } from "../lib/db";
import { roles, users } from "../lib/db/schema";
import { eq } from "drizzle-orm";

import { hashPassword } from "../lib/auth/password";
import { staffIdSchema } from "../lib/validation/identifiers";

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

  // This is the only identifier write path with no schema behind it: every student and aspirant
  // identifier goes through matricNumberSchema / jambRegNumberSchema, and Teacher identifiers
  // are generated, but the admin's came straight from an env var. Validate a NEW admin
  // identifier against the locked staff format.
  //
  // Deliberately skipped when the row already exists with this exact identifier. Deployments
  // seeded before the format was locked have a legacy admin identifier that does not match
  // STF-###; hard-failing there would make `db:seed` permanently unrunnable for them and strand
  // the one account that can fix anything. The format is enforced going forward, not retrofitted.
  const [existingAdmin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.identifier, identifier))
    .limit(1);

  if (!existingAdmin) {
    const parsed = staffIdSchema.safeParse(identifier);
    if (!parsed.success) {
      throw new Error(
        `BOOTSTRAP_ADMIN_IDENTIFIER must be a staff ID of the form STF-001 (got "${identifier}"). ` +
          "Staff IDs are generated in that shape for every Teacher; set the bootstrap admin to " +
          "match, or leave the account out of the seed entirely.",
      );
    }
  }

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
