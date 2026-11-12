import fs from "node:fs";
import process from "node:process";

import { inArray } from "drizzle-orm";

import { getDb } from "../lib/db";
import { departmentLevels, departments, faculties, levels } from "../lib/db/schema";

import { LEVEL_VALUES, UNILORIN_STRUCTURE } from "./data/unilorin-structure";

// One-off loader for the Board's academic structure (see ./data/unilorin-structure.ts).
//
// Idempotent on purpose: it only inserts rows that are missing by their natural key
// (faculty name, department name within a faculty, department+level pair). It never renames,
// re-parents, or deletes anything, so re-running it after an Admin has edited the structure is
// safe — their edits survive.
//
// Deliberately separate from `db:seed`: seed creates role + bootstrap-admin scaffolding and is
// run on every environment; this is real reference data loaded once per database.
async function main(): Promise<void> {
  // Load env (mirrors drizzle.config.ts) so DATABASE_URL resolves for the client.
  if (fs.existsSync(".env.local")) process.loadEnvFile?.(".env.local");
  if (fs.existsSync(".env")) process.loadEnvFile?.(".env");

  const db = getDb();

  // 1. Levels 100–600 (shared across the whole university).
  await db
    .insert(levels)
    .values(LEVEL_VALUES.map((value) => ({ value })))
    .onConflictDoNothing();

  const levelRows = await db
    .select({ id: levels.id, value: levels.value })
    .from(levels)
    .where(inArray(levels.value, [...LEVEL_VALUES]));
  const levelIdByValue = new Map(levelRows.map((row) => [row.value, row.id]));
  const levelIds = LEVEL_VALUES.map((value) => {
    const id = levelIdByValue.get(value);
    if (!id) throw new Error(`Level ${value} missing after insert — import aborted.`);
    return id;
  });

  // 2. Faculties (name is globally unique).
  await db
    .insert(faculties)
    .values(UNILORIN_STRUCTURE.map((faculty) => ({ name: faculty.name })))
    .onConflictDoNothing();

  const facultyRows = await db
    .select({ id: faculties.id, name: faculties.name })
    .from(faculties);
  const facultyIdByName = new Map(facultyRows.map((row) => [row.name, row.id]));

  const facultyIds: number[] = [];
  for (const faculty of UNILORIN_STRUCTURE) {
    const id = facultyIdByName.get(faculty.name);
    if (!id)
      throw new Error(`Faculty "${faculty.name}" missing after insert — import aborted.`);
    facultyIds.push(id);
  }

  // 3. Departments (unique per faculty — no global constraint exists, see the admin route).
  const existingDepartments = await db
    .select({
      id: departments.id,
      name: departments.name,
      facultyId: departments.facultyId,
    })
    .from(departments);
  const existingKeys = new Set(
    existingDepartments.map((row) => `${row.facultyId}::${row.name.toLowerCase()}`),
  );

  const newDepartments: { name: string; facultyId: number }[] = [];
  for (const faculty of UNILORIN_STRUCTURE) {
    const facultyId = facultyIdByName.get(faculty.name);
    if (!facultyId) continue; // already thrown above; keeps the type narrow
    for (const name of faculty.departments) {
      if (!existingKeys.has(`${facultyId}::${name.toLowerCase()}`)) {
        newDepartments.push({ name, facultyId });
        existingKeys.add(`${facultyId}::${name.toLowerCase()}`);
      }
    }
  }

  if (newDepartments.length > 0) {
    await db.insert(departments).values(newDepartments);
  }

  // 4. Link every imported department to 100–600 (superset until programme lengths are confirmed).
  const importedDepartments = await db
    .select({ id: departments.id })
    .from(departments)
    .where(inArray(departments.facultyId, facultyIds));

  const departmentLevelLinks = importedDepartments.flatMap((department) =>
    levelIds.map((levelId) => ({ departmentId: department.id, levelId })),
  );

  if (departmentLevelLinks.length > 0) {
    await db.insert(departmentLevels).values(departmentLevelLinks).onConflictDoNothing();
  }

  // 5. Verify the end state rather than trusting the inserts.
  const verifiedFaculties = await db
    .select({ id: faculties.id })
    .from(faculties)
    .where(inArray(faculties.id, facultyIds));
  const verifiedDepartments = await db
    .select({ id: departments.id })
    .from(departments)
    .where(inArray(departments.facultyId, facultyIds));

  const expectedDepartments = UNILORIN_STRUCTURE.reduce(
    (sum, f) => sum + f.departments.length,
    0,
  );

  console.log(`Levels: ${LEVEL_VALUES.join(", ")}`);
  console.log(
    `Faculties: ${verifiedFaculties.length}/${UNILORIN_STRUCTURE.length} present, ${newDepartments.length} new departments inserted`,
  );
  console.log(
    `Departments: ${verifiedDepartments.length}/${expectedDepartments} present across those faculties`,
  );
  console.log(`Department–level links ensured: ${departmentLevelLinks.length}`);

  if (verifiedFaculties.length !== UNILORIN_STRUCTURE.length) {
    throw new Error("Faculty count mismatch after import — check for a partial failure.");
  }
  if (verifiedDepartments.length < expectedDepartments) {
    throw new Error(
      "Department count is short after import — check for a partial failure.",
    );
  }

  console.log("Structure import complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("Structure import failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
