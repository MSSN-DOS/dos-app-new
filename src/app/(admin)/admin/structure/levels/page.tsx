"use client";

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

interface LevelRow {
  id: number;
  value: number;
}

interface LevelsResponse {
  data: LevelRow[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// Standard academic levels offered by the platform.
const LEVEL_OPTIONS = [100, 200, 300, 400, 500, 600].map(String);

type FormMode = { kind: "add" } | { kind: "edit"; level: LevelRow };

export default function LevelsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["admin", "structure", "levels", page],
    queryFn: async () => {
      const res = await apiFetch<LevelsResponse>(
        `/admin/structure/levels?page=${page}&pageSize=10`,
      );
      return { ...res, data: [...res.data].sort((a, b) => a.value - b.value) };
    },
  });

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>({ kind: "add" });
  const [formValue, setFormValue] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<LevelRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async ({ id, value }: { id?: number; value: string }) => {
      const body = JSON.stringify({ value });
      if (id === undefined) {
        return apiFetch<LevelRow>("/admin/structure/levels", { method: "POST", body });
      }
      return apiFetch<LevelRow>(`/admin/structure/levels/${id}`, { method: "PATCH", body });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "structure", "levels"] });
      setFormOpen(false);
      toast.success(formMode.kind === "add" ? "Level created" : "Level updated");
    },
    onError: (err: unknown) => {
      const message =
        err instanceof ApiError
          ? err.message
          : "Could not save the level. Check the value and try again.";
      setFormError(message);
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) =>
      apiFetch<void>(`/admin/structure/levels/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "structure", "levels"] });
      setDeleteTarget(null);
      toast.success("Level deleted");
    },
    onError: (err: unknown) => {
      // Keep the dialog open and show why the delete was blocked (e.g. level in use).
      const message =
        err instanceof ApiError ? err.message : "Could not delete the level. Try again.";
      setActionError(message);
      toast.error(message);
    },
  });

  const openAdd = () => {
    setFormMode({ kind: "add" });
    setFormValue("");
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (level: LevelRow) => {
    setFormMode({ kind: "edit", level });
    setFormValue(String(level.value));
    setFormError(null);
    setFormOpen(true);
  };

  const submitForm = () => {
    setFormError(null);
    saveMutation.mutate({
      value: formValue,
      ...(formMode.kind === "edit" ? { id: formMode.level.id } : {}),
    });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setActionError(null);
    deleteMutation.mutate(deleteTarget.id);
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Levels</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Academic levels (e.g. 100–600) available for departments and students.
          </p>
        </div>
        <Button onClick={openAdd} className="shrink-0">Add level</Button>
      </div>

      <div className="mt-6">
        {query.isPending ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading levels">
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
              No levels yet — add your first one.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={openAdd}>
              Add level
            </Button>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table aria-label="Levels">
              <TableHeader>
                <TableRow>
                  <TableHead>Level</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.data.map((level) => (
                  <TableRow key={level.id}>
                    <TableCell className="text-base font-medium">{level.value}</TableCell>
                    <TableCell className="text-right">
                      <span className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-11"
                          onClick={() => openEdit(level)}
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
                            setDeleteTarget(level);
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
            {query.data.meta.totalPages > 1 && (
              <div className="flex flex-col gap-3 border-t p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  Page {query.data.meta.page} of {query.data.meta.totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="min-h-11"
                    disabled={page === 1 || query.isFetching}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11"
                    disabled={page >= query.data.meta.totalPages || query.isFetching}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {formMode.kind === "add" ? "Add level" : `Edit level ${formMode.level.value}`}
            </DialogTitle>
            <DialogDescription>
              Level values are numbers like 100, 200 … 600.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="level-value">Level value</Label>
            <Select value={formValue} onValueChange={setFormValue}>
              <SelectTrigger id="level-value" autoFocus>
                <SelectValue placeholder="Select a level" />
              </SelectTrigger>
              <SelectContent>
                {(formMode.kind === "edit" && !LEVEL_OPTIONS.includes(formValue)
                  ? [formValue, ...LEVEL_OPTIONS]
                  : LEVEL_OPTIONS
                ).map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {formError && (
              <p role="alert" className="text-sm text-destructive">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saveMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={submitForm} disabled={saveMutation.isPending || !formValue.trim()}>
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
            <AlertDialogTitle>Delete level {deleteTarget?.value}?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Deletion is blocked if any department or student still
              uses this level.
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
