import type { StructureKind } from "@/lib/validation/structure-workspace";
export type Selection = { kind: StructureKind; id: number };
export interface WorkspaceRoot {
  faculties: { id: number; name: string }[];
  departments: { id: number; name: string; facultyId: number }[];
  levels: { id: number; value: number }[];
  departmentLevels: { departmentId: number; levelId: number }[];
  sessions: { id: number; label: string }[];
}
export const kindLabels: Record<StructureKind, string> = {
  faculty: "Faculty",
  department: "Department",
  level: "Level",
  course: "Course",
  topic: "Topic",
};
export const endpoints: Record<StructureKind, string> = {
  faculty: "/admin/structure/faculties",
  department: "/admin/structure/departments",
  level: "/admin/structure/levels",
  course: "/admin/structure/courses",
  topic: "/teacher/topics",
};
