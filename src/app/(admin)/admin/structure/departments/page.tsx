"use client";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DepartmentRow {
  id: number;
  name: string;
  facultyId: number;
  levelIds: number[];
}

interface FacultyRow {
  id: number;
  name: string;
}

interface LevelRow {
  id: number;
  value: number;
}

interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const PAGE_SIZE = 10;

type FormMode = { kind: "add" } | { kind: "edit"; department: DepartmentRow };

export default function DepartmentsPage() {
  const queryClient = useQueryClient();
  const [facultyFilter, setFacultyFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["admin", "structure", "departments", { page, facultyFilter }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (facultyFilter !== "all") params.set("facultyId", facultyFilter);
      return apiFetch<{ data: DepartmentRow[]; meta: PageMeta }>(
        `/admin/structure/departments?${params}`,
      );
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
  const [formName, setFormName] = useState("");
  const [formFacultyId, setFormFacultyId] = useState("");
  const [formLevelIds, setFormLevelIds] = useState<number[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<DepartmentRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (input: {
      id?: number;
      name: string;
      facultyId: number;
      levelIds: number[];
    }) => {
      const body = JSON.stringify({
        name: input.name,
        facultyId: input.facultyId,
        levelIds: input.levelIds,
      });
      if (input.id === undefined) {
        return apiFetch<DepartmentRow>("/admin/structure/departments", {
          method: "POST",
          body,
        });
      }
      return apiFetch<DepartmentRow>(`/admin/structure/departments/${input.id}`, {
        method: "PATCH",
        body,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "structure", "departments"] });
      setFormOpen(false);
      toast.success(formMode.kind === "add" ? "Department created" : "Department updated");
    },
    onError: (err: unknown) => {
      const message =
        err instanceof ApiError ? err.message : "Could not save the department. Try again.";
      setFormError(message);
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) =>
      apiFetch<void>(`/admin/structure/departments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "structure", "departments"] });
      setDeleteTarget(null);
      toast.success("Department deleted");
    },
    onError: (err: unknown) => {
      // Keep the dialog open and show why the delete was blocked.
      const message =
        err instanceof ApiError ? err.message : "Could not delete the department. Try again.";
      setActionError(message);
      toast.error(message);
    },
  });

  const faculties = facultiesQuery.data ?? [];
  const levels = levelsQuery.data ?? [];

  const filtered =
    facultyFilter === "all"
      ? query.data?.data
      : query.data?.data.filter((d) => d.facultyId === Number(facultyFilter));

  const facultyName = (id: number) => faculties.find((f) => f.id === id)?.name;

  const levelsLabel = (row: DepartmentRow) =>
    row.levelIds
      .map((id) => levels.find((l) => l.id === id)?.value)
      .filter((v): v is number => v !== undefined)
      .sort((a, b) => a - b)
      .join(", ");

  const toggleLevel = (id: number, checked: boolean) => {
    setFormLevelIds((prev) =>
      checked ? [...prev, id] : prev.filter((existing) => existing !== id),
    );
  };

  const openAdd = () => {
    setFormMode({ kind: "add" });
    setFormName("");
    setFormFacultyId("");
    setFormLevelIds([]);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (department: DepartmentRow) => {
    setFormMode({ kind: "edit", department });
    setFormName(department.name);
    setFormFacultyId(String(department.facultyId));
    setFormLevelIds(department.levelIds);
    setFormError(null);
    setFormOpen(true);
  };

  const submitForm = () => {
    setFormError(null);
    saveMutation.mutate({
      name: formName,
      facultyId: Number(formFacultyId),
      levelIds: formLevelIds,
      ...(formMode.kind === "edit" ? { id: formMode.department.id } : {}),
    });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setActionError(null);
    deleteMutation.mutate(deleteTarget.id);
  };

  const formReady = Boolean(formName.trim() && formFacultyId && formLevelIds.length > 0);

  return (
    <div>
      <AdminPageHeader
        kicker="Structure"
        title="Departments"
        description="Each department belongs to one faculty and spans one or more levels."
        actions={
          <Button onClick={openAdd} className="min-h-11 shrink-0 rounded-xl">
            Add department
          </Button>
        }
      />

      <div className="mt-4">
        <Label htmlFor="faculty-filter" className="sr-only">Filter by faculty</Label>
        <Select
          value={facultyFilter}
          onValueChange={(value) => {
            setFacultyFilter(value);
            setPage(1);
          }}
        >
          <SelectTrigger id="faculty-filter" className="w-full sm:w-64">
            <SelectValue placeholder="Filter by faculty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All faculties</SelectItem>
            {faculties.map((f) => (
              <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4">
        {query.isPending || facultiesQuery.isPending || levelsQuery.isPending ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading departments">
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
              {facultyFilter === "all"
                ? query.data.data.length === 0
                  ? "No departments yet — add your first one."
                  : undefined
                : "No departments in this faculty."}
            </p>
            {facultyFilter !== "all" && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setFacultyFilter("all");
                  setPage(1);
                }}
              >
                Show all faculties
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table aria-label="Departments">
              <TableHeader>
                <TableRow>
                  <TableHead>Department</TableHead>
                  <TableHead>Faculty</TableHead>
                  <TableHead>Levels</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((department) => (
                  <TableRow key={department.id}>
                    <TableCell className="text-base font-medium">{department.name}</TableCell>
                    <TableCell>{facultyName(department.facultyId)}</TableCell>
                    <TableCell>{levelsLabel(department) || "—"}</TableCell>
                    <TableCell className="text-right">
                      <span className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-11"
                          onClick={() => openEdit(department)}
                        >
                          <Pencil aria-hidden="true" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-11 text-destructive hover:text-destructive"
                          onClick={() => {
                            setActionError(null);
                            setDeleteTarget(department);
                          }}
                        >
                          <Trash2 aria-hidden="true" />
                          Delete
                        </Button>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {query.data && query.data.meta.totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-between gap-4" aria-label="Departments pagination">
          <Button
            variant="outline"
            className="min-h-11"
            disabled={query.data.meta.page <= 1 || query.isFetching}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <p className="text-sm text-muted-foreground">
            Page {query.data.meta.page} of {query.data.meta.totalPages}
          </p>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={query.data.meta.page >= query.data.meta.totalPages || query.isFetching}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </nav>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {formMode.kind === "add"
                ? "Add department"
                : `Edit ${formMode.department.name}`}
            </DialogTitle>
            <DialogDescription>
              Pick a faculty and at least one active level.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="department-name">Department name</Label>
              <Input
                id="department-name"
                type="text"
                maxLength={150}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="department-faculty">Faculty</Label>
              <Select value={formFacultyId} onValueChange={setFormFacultyId}>
                <SelectTrigger id="department-faculty" className="w-full">
                  <SelectValue placeholder="Select a faculty" />
                </SelectTrigger>
                <SelectContent>
                  {faculties.map((f) => (
                    <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Active levels</legend>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {levels.map((level) => (
                  <Label
                    key={level.id}
                    htmlFor={`level-${level.id}`}
                    className="flex min-h-11 items-center gap-2 rounded-md border px-3 text-base font-normal"
                  >
                    <Checkbox
                      id={`level-${level.id}`}
                      checked={formLevelIds.includes(level.id)}
                      onCheckedChange={(checked) => toggleLevel(level.id, checked === true)}
                    />
                    {level.value}
                  </Label>
                ))}
              </div>
            </fieldset>
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
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Its level links are removed too. Deletion is blocked if any
              course or student still belongs to this department.
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
