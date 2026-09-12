"use client";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { apiFetch, ApiError } from "@/lib/auth/client-fetch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Semester = "harmattan" | "rain";
type ScopeType = "department" | "faculty" | "general" | "interfaculty";

interface CourseRow {
  id: number;
  code: string;
  title: string;
  levelId: number;
  semester: Semester;
  scopeType: ScopeType;
  departmentId: number | null;
  facultyId: number | null;
  facultyIds: number[];
}

interface DepartmentRow {
  id: number;
  name: string;
  facultyId: number;
}

interface FacultyRow {
  id: number;
  name: string;
}

interface LevelRow {
  id: number;
  value: number;
}

type PageMeta = { page: number; pageSize: number; total: number; totalPages: number };
type PaginatedCourses = { data: CourseRow[]; meta: PageMeta };
const PAGE_SIZE = 10;

const SEMESTER_LABEL: Record<Semester, string> = {
  harmattan: "Harmattan",
  rain: "Rain",
};

const SCOPE_LABEL: Record<ScopeType, string> = {
  department: "Department scope",
  faculty: "Faculty scope",
  general: "General scope",
  interfaculty: "Interfaculty scope",
};

const SCOPES: ScopeType[] = ["department", "faculty", "general", "interfaculty"];

type FormMode = { kind: "add" } | { kind: "edit"; course: CourseRow };

export default function CoursesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [semesterFilter, setSemesterFilter] = useState<string>("all");

  const query = useQuery({
    queryKey: ["admin", "structure", "courses", { page, departmentFilter, levelFilter, semesterFilter }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (departmentFilter !== "all") params.set("departmentId", departmentFilter);
      if (levelFilter !== "all") params.set("levelId", levelFilter);
      if (semesterFilter !== "all") params.set("semester", semesterFilter);
      const res = await apiFetch<PaginatedCourses>(`/admin/structure/courses?${params}`);
      return { ...res, data: [...res.data].sort((a, b) =>
        a.code === b.code ? a.title.localeCompare(b.title) : a.code.localeCompare(b.code),
      ) };
    },
  });
  const departmentsQuery = useQuery({
    queryKey: ["structure", "departments"],
    queryFn: async () => {
      const res = await apiFetch<{ data: DepartmentRow[] }>("/admin/structure/departments");
      return [...res.data].sort((a, b) => a.name.localeCompare(b.name));
    },
  });
  const facultiesQuery = useQuery({
    queryKey: ["structure", "faculties"],
    queryFn: async () => {
      const res = await apiFetch<{ data: FacultyRow[] }>("/admin/structure/faculties");
      return [...res.data].sort((a, b) => a.name.localeCompare(b.name));
    },
  });
  const levelsQuery = useQuery({
    queryKey: ["structure", "levels"],
    queryFn: async () => {
      const res = await apiFetch<{ data: LevelRow[] }>("/admin/structure/levels");
      return [...res.data].sort((a, b) => a.value - b.value);
    },
  });

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>({ kind: "add" });
  const [formCode, setFormCode] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formLevelId, setFormLevelId] = useState("");
  const [formSemester, setFormSemester] = useState<Semester>("harmattan");
  const [formScopeType, setFormScopeType] = useState<ScopeType>("department");
  const [formDepartmentId, setFormDepartmentId] = useState("");
  const [formFacultyId, setFormFacultyId] = useState("");
  const [formFacultyIds, setFormFacultyIds] = useState<number[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<CourseRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (input: {
      id?: number;
      body: Record<string, unknown>;
    }) => {
      if (input.id === undefined) {
        return apiFetch<CourseRow>("/admin/structure/courses", {
          method: "POST",
          body: JSON.stringify(input.body),
        });
      }
      return apiFetch<CourseRow>(`/admin/structure/courses/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify(input.body),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "structure", "courses"] });
      setFormOpen(false);
      toast.success(formMode.kind === "add" ? "Course created" : "Course updated");
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Could not save the course. Try again.";
      setFormError(message);
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) =>
      apiFetch<void>(`/admin/structure/courses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "structure", "courses"] });
      setDeleteTarget(null);
      toast.success("Course deleted");
    },
    onError: (err: unknown) => {
      // Keep the dialog open and show why the delete was blocked.
      const message = err instanceof ApiError ? err.message : "Could not delete the course. Try again.";
      setActionError(message);
      toast.error(message);
    },
  });

  const departments = departmentsQuery.data ?? [];
  const faculties = facultiesQuery.data ?? [];
  const levels = levelsQuery.data ?? [];

  const filtered = query.data?.data;

  const filtersActive =
    departmentFilter !== "all" || levelFilter !== "all" || semesterFilter !== "all";

  const clearFilters = () => {
    setDepartmentFilter("all");
    setLevelFilter("all");
    setSemesterFilter("all");
    setPage(1);
  };

  const toggleFaculty = (id: number, checked: boolean) => {
    setFormFacultyIds((prev) =>
      checked ? [...prev, id] : prev.filter((existing) => existing !== id),
    );
  };

  const openAdd = () => {
    setFormMode({ kind: "add" });
    setFormCode("");
    setFormTitle("");
    setFormLevelId("");
    setFormSemester("harmattan");
    setFormScopeType("department");
    setFormDepartmentId("");
    setFormFacultyId("");
    setFormFacultyIds([]);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (course: CourseRow) => {
    setFormMode({ kind: "edit", course });
    setFormCode(course.code);
    setFormTitle(course.title);
    setFormLevelId(String(course.levelId));
    setFormSemester(course.semester);
    setFormScopeType(course.scopeType);
    setFormDepartmentId(course.departmentId === null ? "" : String(course.departmentId));
    setFormFacultyId(course.facultyId === null ? "" : String(course.facultyId));
    setFormFacultyIds(course.facultyIds);
    setFormError(null);
    setFormOpen(true);
  };

  const submitForm = () => {
    setFormError(null);
    saveMutation.mutate({
      ...(formMode.kind === "edit" ? { id: formMode.course.id } : {}),
      body: {
        code: formCode.trim(),
        title: formTitle.trim(),
        levelId: Number(formLevelId),
        semester: formSemester,
        scopeType: formScopeType,
        departmentId: formScopeType === "department" ? Number(formDepartmentId) : null,
        facultyId: formScopeType === "faculty" ? Number(formFacultyId) : null,
        ...(formScopeType === "interfaculty" ? { facultyIds: formFacultyIds } : {}),
      },
    });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setActionError(null);
    deleteMutation.mutate(deleteTarget.id);
  };

  const formReady = Boolean(
    formCode.trim() &&
      formTitle.trim() &&
      formLevelId &&
      (formScopeType === "general" ||
        (formScopeType === "department" && formDepartmentId) ||
        (formScopeType === "faculty" && formFacultyId) ||
        (formScopeType === "interfaculty" && formFacultyIds.length >= 2)),
  );

  return (
    <div>
      <AdminPageHeader
        kicker="Structure"
        title="Courses"
        description="Courses belong to a level and semester, scoped by who can see them."
        actions={
          <Button onClick={openAdd} className="min-h-11 shrink-0 rounded-xl">
            Add course
          </Button>
        }
      />

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <Label htmlFor="department-filter" className="sr-only">Filter by department</Label>
          <Select value={departmentFilter} onValueChange={(value) => { setDepartmentFilter(value); setPage(1); }}>
            <SelectTrigger id="department-filter" className="w-full">
              <SelectValue placeholder="Filter by department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="level-filter" className="sr-only">Filter by level</Label>
          <Select value={levelFilter} onValueChange={(value) => { setLevelFilter(value); setPage(1); }}>
            <SelectTrigger id="level-filter" className="w-full">
              <SelectValue placeholder="Filter by level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              {levels.map((l) => (
                <SelectItem key={l.id} value={String(l.id)}>{`${l.value}L`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="semester-filter" className="sr-only">Filter by semester</Label>
          <Select value={semesterFilter} onValueChange={(value) => { setSemesterFilter(value); setPage(1); }}>
            <SelectTrigger id="semester-filter" className="w-full">
              <SelectValue placeholder="Filter by semester" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All semesters</SelectItem>
              <SelectItem value="harmattan">Harmattan</SelectItem>
              <SelectItem value="rain">Rain</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4">
        {query.isPending ||
        departmentsQuery.isPending ||
        facultiesQuery.isPending ||
        levelsQuery.isPending ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading courses">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="rounded-md border p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {query.error instanceof ApiError
                ? query.error.message
                : "Something went wrong"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void query.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : !filtered || filtered.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {filtersActive
                ? "No courses match these filters."
                 : query.data.data.length === 0
                  ? "No courses yet — add your first one."
                  : undefined}
            </p>
            {filtersActive && (
              <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table aria-label="Courses"><TableHeader><TableRow><TableHead>Course</TableHead><TableHead>Level</TableHead><TableHead>Scope</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>
            {filtered.map((course) => (
              <TableRow key={course.id}>
                <TableCell><span className="block text-base font-medium">{course.title}</span><span className="block text-sm text-muted-foreground">
                    {course.code} · {course.levelId && `${levels.find((l) => l.id === course.levelId)?.value ?? "?"}L`} ·{" "}
                    {SEMESTER_LABEL[course.semester]}
                  </span></TableCell><TableCell>{levels.find((l) => l.id === course.levelId)?.value ?? "?"}L</TableCell><TableCell>{SCOPE_LABEL[course.scopeType]}
                    {course.scopeType === "department" &&
                      ` · ${departments.find((d) => d.id === course.departmentId)?.name ?? "?"}`}
                    {course.scopeType === "faculty" &&
                      ` · ${faculties.find((f) => f.id === course.facultyId)?.name ?? "?"}`}
                    {course.scopeType === "interfaculty" &&
                      ` · ${course.facultyIds.length} faculties`}
                  </TableCell><TableCell className="text-right"><span className="flex justify-end gap-1"><Button variant="ghost" size="sm" className="min-h-11" onClick={() => openEdit(course)}><Pencil aria-hidden="true" />Edit</Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11 text-destructive hover:text-destructive"
                    onClick={() => {
                      setActionError(null);
                      setDeleteTarget(course);
                    }}
                  ><Trash2 aria-hidden="true" />Delete</Button></span></TableCell>
              </TableRow>
            ))}
            </TableBody></Table>
            {query.data.meta.totalPages > 1 && <div className="flex items-center justify-between gap-3 border-t p-3"><Button variant="outline" className="min-h-11" disabled={page <= 1 || query.isFetching} onClick={() => setPage((value) => value - 1)}><ChevronLeft aria-hidden="true" />Previous</Button><span className="text-sm text-muted-foreground">Page {query.data.meta.page} of {query.data.meta.totalPages}</span><Button variant="outline" className="min-h-11" disabled={page >= query.data.meta.totalPages || query.isFetching} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight aria-hidden="true" /></Button></div>}
          </div>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {formMode.kind === "add" ? "Add course" : `Edit ${formMode.course.code}`}
            </DialogTitle>
            <DialogDescription>
              The scope controls which students can see this course.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="course-code">Code</Label>
              <Input
                id="course-code"
                type="text"
                maxLength={20}
                placeholder="e.g. MAT 101"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="course-title">Title</Label>
              <Input
                id="course-title"
                type="text"
                maxLength={200}
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="course-level">Level</Label>
              <Select value={formLevelId} onValueChange={setFormLevelId}>
                <SelectTrigger id="course-level" className="w-full">
                  <SelectValue placeholder="Select a level" />
                </SelectTrigger>
                <SelectContent>
                  {levels.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>{`${l.value}L`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Semester</legend>
              <div className="grid grid-cols-2 gap-2">
                {(["harmattan", "rain"] as Semester[]).map((semester) => (
                  <Button
                    key={semester}
                    type="button"
                    variant={formSemester === semester ? "default" : "outline"}
                    aria-pressed={formSemester === semester}
                    onClick={() => setFormSemester(semester)}
                    className="min-h-11"
                  >
                    {SEMESTER_LABEL[semester]}
                  </Button>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-2">
              <Label htmlFor="course-scope-type">Scope type</Label>
              <Select
                value={formScopeType}
                onValueChange={(value) => setFormScopeType(value as ScopeType)}
              >
                <SelectTrigger id="course-scope-type" className="w-full">
                  <SelectValue placeholder="Select a scope type" />
                </SelectTrigger>
                <SelectContent>
                  {SCOPES.map((scope) => (
                    <SelectItem key={scope} value={scope}>{SCOPE_LABEL[scope]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {formScopeType === "department" && (
              <div className="grid gap-2">
                <Label htmlFor="course-department">Department</Label>
                <Select value={formDepartmentId} onValueChange={setFormDepartmentId}>
                  <SelectTrigger id="course-department" className="w-full">
                    <SelectValue placeholder="Select a department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {formScopeType === "faculty" && (
              <div className="grid gap-2">
                <Label htmlFor="course-faculty">Faculty</Label>
                <Select value={formFacultyId} onValueChange={setFormFacultyId}>
                  <SelectTrigger id="course-faculty" className="w-full">
                    <SelectValue placeholder="Select a faculty" />
                  </SelectTrigger>
                  <SelectContent>
                    {faculties.map((f) => (
                      <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {formScopeType === "interfaculty" && (
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">Faculties (pick at least two)</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {faculties.map((faculty) => (
                    <Label
                      key={faculty.id}
                      htmlFor={`faculty-${faculty.id}`}
                      className="flex min-h-11 items-center gap-2 rounded-md border px-3 text-base font-normal"
                    >
                      <Checkbox
                        id={`faculty-${faculty.id}`}
                        checked={formFacultyIds.includes(faculty.id)}
                        onCheckedChange={(checked) =>
                          toggleFaculty(faculty.id, checked === true)
                        }
                      />
                      <span className="truncate">{faculty.name}</span>
                    </Label>
                  ))}
                </div>
              </fieldset>
            )}
            {formError && (
              <p role="alert" className="text-sm text-destructive">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saveMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={submitForm} disabled={saveMutation.isPending || !formReady}>
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.code}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Its interfaculty faculty links are removed too. Deletion is
              blocked if any quiz, question or content item still belongs to this course.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionError && (
            <p role="alert" className="text-sm text-destructive">{actionError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
