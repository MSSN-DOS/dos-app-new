import { z } from "zod";

// Levels are a flat list (currently 100–600 per DESIGN.md §3). Value is just a positive
// integer — the range is real Board data entered through the UI, not a hard schema rule.
export const levelCreateSchema = z.object({
  value: z.coerce.number().int().min(1).max(9999),
});

export const levelUpdateSchema = levelCreateSchema;

export type LevelCreateInput = z.infer<typeof levelCreateSchema>;

// Faculties are free-form names (150 chars in the DB schema).
export const facultyCreateSchema = z.object({
  name: z.string().trim().min(1).max(150),
});

export const facultyUpdateSchema = facultyCreateSchema;

export type FacultyCreateInput = z.infer<typeof facultyCreateSchema>;

// Departments belong to exactly one Faculty and must declare at least one active Level.
// levelIds maps to the department_levels many-to-many; the API set-replaces it on save.
export const departmentCreateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  facultyId: z.coerce.number().int().min(1),
  levelIds: z.array(z.coerce.number().int().min(1)).min(1),
});

export const departmentUpdateSchema = departmentCreateSchema;

export type DepartmentCreateInput = z.infer<typeof departmentCreateSchema>;

// Courses carry a scope_type that mirrors the DB CHECK constraint (courses_scope_check):
// department scope needs exactly a departmentId, faculty scope exactly a facultyId,
// general/interfaculty neither. Interfaculty additionally requires the course_faculties
// picker with at least two faculties (per .agents/design/screens-admin.md).
const nullableInt = z.union([z.coerce.number().int().min(1), z.null()]);

export const courseCreateSchema = z
  .object({
    code: z.string().trim().min(1).max(20),
    title: z.string().trim().min(1).max(200),
    levelId: z.coerce.number().int().min(1),
    semester: z.enum(["harmattan", "rain"]),
    scopeType: z.enum(["department", "faculty", "general", "interfaculty"]),
    departmentId: nullableInt.optional(),
    facultyId: nullableInt.optional(),
    facultyIds: z.array(z.coerce.number().int().min(1)).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.scopeType === "department" && !data.departmentId) {
      ctx.addIssue({
        code: "custom",
        path: ["departmentId"],
        message: "Department is required for department-scoped courses",
      });
    }
    if (data.scopeType === "department" && data.facultyId) {
      ctx.addIssue({
        code: "custom",
        path: ["scopeType"],
        message: "Department-scoped courses cannot also belong to a faculty",
      });
    }
    if (data.scopeType === "faculty" && !data.facultyId) {
      ctx.addIssue({
        code: "custom",
        path: ["facultyId"],
        message: "Faculty is required for faculty-scoped courses",
      });
    }
    if (data.scopeType === "faculty" && data.departmentId) {
      ctx.addIssue({
        code: "custom",
        path: ["scopeType"],
        message: "Faculty-scoped courses cannot also belong to a department",
      });
    }
    if (
      (data.scopeType === "general" || data.scopeType === "interfaculty") &&
      (data.departmentId || data.facultyId)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["scopeType"],
        message: "General and interfaculty courses cannot belong to a department or faculty",
      });
    }
    if (data.scopeType === "interfaculty" && (!data.facultyIds || data.facultyIds.length < 2)) {
      ctx.addIssue({
        code: "custom",
        path: ["facultyIds"],
        message: "Select at least two faculties for interfaculty courses",
      });
    }
  });

export const courseUpdateSchema = courseCreateSchema;

export type CourseCreateInput = z.infer<typeof courseCreateSchema>;
