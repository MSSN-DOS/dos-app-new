import { NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { ZodError } from "zod";

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
import { addIdentifierSchema } from "@/lib/validation/auth";
import { identifierTypeFor } from "@/lib/validation/identifiers";

// Same envelope the auth routes use, so the "Login details" form can map field messages without
// a second error-parsing convention.
function validationError(err: ZodError): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: err.issues.map((i) => ({
          field: i.path.join(".") || "body",
          code: i.code,
          message: i.message,
        })),
      },
    },
    { status: 422 },
  );
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "23505"
  );
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    const db = getDb();

    const [userRow] = await db
      .select({
        fullName: users.fullName,
        identifier: users.identifier,
        matricNumber: users.matricNumber,
        jambRegNumber: users.jambRegNumber,
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
        matricNumber: userRow.matricNumber,
        jambRegNumber: userRow.jambRegNumber,
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

// Attaching the second sign-in identifier to a Student account (Board decision 2026-11-10).
// Deliberately one-way: a value already set is never overwritten or cleared here, because a login
// credential the student can silently swap is a security decision the Board hasn't made. Asking
// to add one that's already present is a 409, not an update.
export async function PATCH(request: Request) {
  try {
    const auth = await requireAuth(request, ["student"]);
    const json = await request.json();
    const data = addIdentifierSchema.parse(json);

    const identifierType = identifierTypeFor(data.identifier);
    if (!identifierType) {
      // Unreachable: addIdentifierSchema already rejected anything matching neither format.
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid identifier" } },
        { status: 422 },
      );
    }

    const db = getDb();
    const [userRow] = await db
      .select({
        identifier: users.identifier,
        matricNumber: users.matricNumber,
        jambRegNumber: users.jambRegNumber,
      })
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);

    if (!userRow) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Account not found" } },
        { status: 404 }
      );
    }

    const isMatric = identifierType === "matric_number";
    const typeLabel = isMatric ? "Matric Number" : "JAMB Registration Number";

    // Already on this account in any of its three columns — the alias columns mirror the original
    // sign-in value at registration, so this also catches re-submitting the value they signed up
    // with. Compared case-insensitively so a differently-cased duplicate can't slip past.
    const alreadyOnAccount = [userRow.identifier, userRow.matricNumber, userRow.jambRegNumber]
      .filter((value): value is string => typeof value === "string")
      .some((value) => value.toUpperCase() === data.identifier.toUpperCase());

    if (alreadyOnAccount) {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "That identifier is already on your account" } },
        { status: 409 },
      );
    }

    // One identifier of each type at most: the other type must be the one being added.
    if ((isMatric ? userRow.matricNumber : userRow.jambRegNumber) !== null) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: `You have already added a ${typeLabel}. Login details can't be changed once set.`,
          },
        },
        { status: 409 },
      );
    }

    try {
      await db
        .update(users)
        .set(isMatric ? { matricNumber: data.identifier } : { jambRegNumber: data.identifier })
        .where(eq(users.id, auth.userId));
    } catch (e) {
      if (isUniqueViolation(e)) {
        return NextResponse.json(
          {
            error: {
              code: "CONFLICT",
              message: `Another account already uses that ${typeLabel}`,
            },
          },
          { status: 409 },
        );
      }
      throw e;
    }

    return NextResponse.json({
      data: {
        identifier: userRow.identifier,
        matricNumber: isMatric ? data.identifier : userRow.matricNumber,
        jambRegNumber: isMatric ? userRow.jambRegNumber : data.identifier,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) return validationError(error);
    return errorResponse(error);
  }
}
