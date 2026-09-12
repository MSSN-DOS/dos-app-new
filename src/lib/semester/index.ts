import { asc } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { semesterSettings } from "@/lib/db/schema/semester";
import {
  resolveSemesterForDate,
  type SemesterName,
} from "./calendar";

// Single active-semester resolver (DESIGN.md §8). Every query scoped "to the
// active semester" must call this — never re-derive it inline from new Date().
export async function getActiveSemester(db: Db): Promise<SemesterName> {
  const rows = await db
    .select({ mode: semesterSettings.mode, manualOverride: semesterSettings.manualOverride })
    .from(semesterSettings)
    .orderBy(asc(semesterSettings.id))
    .limit(1);

  const settings = rows[0];
  if (settings?.mode === "manual" && settings.manualOverride) {
    return settings.manualOverride;
  }
  return resolveSemesterForDate(new Date());
}
