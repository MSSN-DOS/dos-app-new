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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface FacultyRow {
  id: number;
  name: string;
}

interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const PAGE_SIZE = 10;

type FormMode = { kind: "add" } | { kind: "edit"; faculty: FacultyRow };

export default function FacultiesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["admin", "structure", "faculties", { page }],
    queryFn: async () => {
      return apiFetch<{ data: FacultyRow[]; meta: PageMeta }>(
        `/admin/structure/faculties?page=${page}&pageSize=${PAGE_SIZE}`,
      );
    },
  });

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>({ kind: "add" });
  const [formName, setFormName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<FacultyRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async ({ id, name }: { id?: number; name: string }) => {
      const body = JSON.stringify({ name });
      if (id === undefined) {
        return apiFetch<FacultyRow>("/admin/structure/faculties", { method: "POST", body });
      }
      return apiFetch<FacultyRow>(`/admin/structure/faculties/${id}`, { method: "PATCH", body });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "structure", "faculties"] });
      setFormOpen(false);
      toast.success(formMode.kind === "add" ? "Faculty created" : "Faculty updated");
    },
    onError: (err: unknown) => {
      const message =
        err instanceof ApiError ? err.message : "Could not save the faculty. Try again.";
      setFormError(message);
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) =>
      apiFetch<void>(`/admin/structure/faculties/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "structure", "faculties"] });
      setDeleteTarget(null);
      toast.success("Faculty deleted");
    },
    onError: (err: unknown) => {
      // Keep the dialog open and show why the delete was blocked (e.g. faculty in use).
      const message =
        err instanceof ApiError ? err.message : "Could not delete the faculty. Try again.";
      setActionError(message);
      toast.error(message);
    },
  });

  const openAdd = () => {
    setFormMode({ kind: "add" });
    setFormName("");
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (faculty: FacultyRow) => {
    setFormMode({ kind: "edit", faculty });
    setFormName(faculty.name);
    setFormError(null);
    setFormOpen(true);
  };

  const submitForm = () => {
    setFormError(null);
    saveMutation.mutate({
      name: formName,
      ...(formMode.kind === "edit" ? { id: formMode.faculty.id } : {}),
    });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setActionError(null);
    deleteMutation.mutate(deleteTarget.id);
  };

  return (
    <div>
      <AdminPageHeader
        kicker="Structure"
        title="Faculties"
        description="Faculties group departments; courses can also be scoped to a faculty."
        actions={
          <Button onClick={openAdd} className="min-h-11 shrink-0 rounded-xl">
            Add faculty
          </Button>
        }
      />

      <div className="mt-6">
        {query.isPending ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading faculties">
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
        ) : query.data.data.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No faculties yet — add your first one.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={openAdd}>
              Add faculty
            </Button>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table aria-label="Faculties">
              <TableHeader>
                <TableRow>
                  <TableHead>Faculty</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.data.map((faculty) => (
                  <TableRow key={faculty.id}>
                    <TableCell className="text-base font-medium">{faculty.name}</TableCell>
                    <TableCell className="text-right">
                      <span className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-11"
                          onClick={() => openEdit(faculty)}
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
                            setDeleteTarget(faculty);
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
        <nav className="mt-4 flex items-center justify-between gap-4" aria-label="Faculties pagination">
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
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {formMode.kind === "add"
                ? "Add faculty"
                : `Edit ${formMode.faculty.name}`}
            </DialogTitle>
            <DialogDescription>
              Faculty names must be unique — e.g. “Engineering”.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="faculty-name">Faculty name</Label>
            <Input
              id="faculty-name"
              type="text"
              maxLength={150}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              autoFocus
            />
            {formError && (
              <p role="alert" className="text-sm text-destructive">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saveMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={submitForm} disabled={saveMutation.isPending || !formName.trim()}>
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
              This cannot be undone. Deletion is blocked if any department or course still
              belongs to this faculty.
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
