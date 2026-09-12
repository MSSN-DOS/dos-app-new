import { NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";

import { errorResponse } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { roles, users } from "@/lib/db/schema";
import {
  departments,
  faculties,
  levels,
} from "@/lib/db/schema/academic";
import {
  aspirantProfiles,
  studentProfiles,
} from "@/lib/db/schema/profiles";
import {
  bestScores,
  cgpaRecords,
  postUtmeScores,
} from "@/lib/db/schema/performance";
import { getActiveSemester } from "@/lib/semester";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    const db = getDb();

    const [userRow] = await db
      .select({
        fullName: users.fullName,
        identifier: users.identifier,
        roleName: roles.name,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.id, auth.userId))
      .limit(1);

    if (!userRow) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Account not found" } },
        { status: 404 }
      );
    }

    const activeSemester = await getActiveSemester(db);

    let profile: unknown = null;

    if (userRow.roleName === "student") {
      const [profileRow] = await db
        .select({
          departmentName: departments.name,
          facultyName: faculties.name,
          levelValue: levels.value,
        })
        .from(studentProfiles)
        .innerJoin(
          departments,
          eq(studentProfiles.departmentId, departments.id)
        )
        .innerJoin(faculties, eq(departments.facultyId, faculties.id))
        .innerJoin(levels, eq(studentProfiles.levelId, levels.id))
        .where(eq(studentProfiles.userId, auth.userId))
        .limit(1);

      const [cgpaRow] = await db
        .select({
          weekStart: cgpaRecords.weekStart,
          cgpaValue: cgpaRecords.cgpaValue,
        })
        .from(cgpaRecords)
        .where(eq(cgpaRecords.userId, auth.userId))
        .orderBy(desc(cgpaRecords.weekStart))
        .limit(1);

      const takenRows = await db
        .select({ quizId: bestScores.quizId })
        .from(bestScores)
        .where(eq(bestScores.userId, auth.userId))
        .orderBy(asc(bestScores.quizId));

      const rawCgpa = cgpaRow ? Number(cgpaRow.cgpaValue) : null;
      const cgpa = rawCgpa !== null && rawCgpa > 5 ? Math.min(5, rawCgpa / 20) : rawCgpa;
      profile = {
        faculty: profileRow?.facultyName ?? null,
        department: profileRow?.departmentName ?? null,
        level: profileRow?.levelValue ?? null,
        cgpa: cgpa !== null ? Math.round(cgpa * 100) / 100 : null,
        cgpaWeekStart: cgpaRow?.weekStart ?? null,
        quizzesTaken: takenRows.length,
      };
    } else if (userRow.roleName === "aspirant") {
      const [profileRow] = await db
        .select({ departmentName: departments.name })
        .from(aspirantProfiles)
        .innerJoin(
          departments,
          eq(aspirantProfiles.aspirationDepartmentId, departments.id)
        )
        .where(eq(aspirantProfiles.userId, auth.userId))
        .limit(1);

      const [postUtmeRow] = await db
        .select({
          weekStart: postUtmeScores.weekStart,
          rawScore: postUtmeScores.rawScore,
          convertedScore50: postUtmeScores.convertedScore50,
        })
        .from(postUtmeScores)
        .where(eq(postUtmeScores.userId, auth.userId))
        .orderBy(desc(postUtmeScores.weekStart))
        .limit(1);

      const takenRows = await db
        .select({ quizId: bestScores.quizId })
        .from(bestScores)
        .where(eq(bestScores.userId, auth.userId))
        .orderBy(asc(bestScores.quizId));

      profile = {
        aspirationDepartment: profileRow?.departmentName ?? null,
        postUtmeRaw: postUtmeRow ? Number(postUtmeRow.rawScore) : null,
        postUtmeConverted: postUtmeRow
          ? Number(postUtmeRow.convertedScore50)
          : null,
        postUtmeWeekStart: postUtmeRow?.weekStart ?? null,
        quizzesTaken: takenRows.length,
      };
    }

    return NextResponse.json({
      data: {
        id: auth.userId,
        fullName: userRow.fullName,
        identifier: userRow.identifier,
        role: userRow.roleName,
        activeSemester,
        profile,
      },
    });
  } catch (error) {
    console.error(error);
    return errorResponse(error);
  }
}
