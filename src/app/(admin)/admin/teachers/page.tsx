"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { apiFetch, ApiError } from "@/lib/auth/client-fetch";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface TeacherRow {
  id: number;
  fullName: string;
  identifier: string;
  isActive: boolean;
  publishedQuizzes: number;
}

type PageMeta = { page: number; pageSize: number; total: number; totalPages: number };
type TeachersResponse = { data: TeacherRow[]; meta: PageMeta };
const PAGE_SIZE = 10;

export default function TeachersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["admin", "teachers", page],
    queryFn: async () => {
      const res = await apiFetch<TeachersResponse>(`/admin/teachers?page=${page}&pageSize=${PAGE_SIZE}`);
      return { ...res, data: [...res.data].sort((a, b) => a.fullName.localeCompare(b.fullName)) };
    },
  });

  const [formOpen, setFormOpen] = useState(false);
  const [formFullName, setFormFullName] = useState("");
  const [formStaffId, setFormStaffId] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async (body: { fullName: string; staffId: string; password: string }) =>
      apiFetch<TeacherRow>("/admin/teachers", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "teachers"] });
      setFormOpen(false);
      toast.success("Teacher account created");
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Could not create the account. Try again.";
      setFormError(message);
      toast.error(message);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiFetch<TeacherRow>(`/admin/teachers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: (_teacher, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "teachers"] });
      toast.success(variables.isActive ? "Teacher reactivated" : "Teacher deactivated");
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Could not update the account. Try again.";
      setActionError(message);
      toast.error(message);
    },
  });

  const openAdd = () => {
    setFormFullName("");
    setFormStaffId("");
    setFormPassword("");
    setFormError(null);
    setFormOpen(true);
  };

  const submitForm = () => {
    setFormError(null);
    createMutation.mutate({
      fullName: formFullName,
      staffId: formStaffId,
      password: formPassword,
    });
  };

  const formReady =
    formFullName.trim().length > 0 &&
    formStaffId.trim().length > 0 &&
    formPassword.length >= 8;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Teachers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Teachers don&rsquo;t self-register — you create their accounts here.
          </p>
        </div>
        <Button onClick={openAdd} className="shrink-0">
          Add teacher
        </Button>
      </div>

      {actionError && (
        <p role="alert" className="mt-4 text-sm text-destructive">{actionError}</p>
      )}

      <div className="mt-6">
        {query.isPending ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading teachers">
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
            <p className="text-sm text-muted-foreground">No teachers yet.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={openAdd}>
              Add teacher
            </Button>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table aria-label="Teachers"><TableHeader><TableRow><TableHead>Teacher</TableHead><TableHead>Staff ID</TableHead><TableHead>Published quizzes</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>
            {query.data.data.map((teacher) => (
              <TableRow key={teacher.id}>
                <TableCell><p className={`text-base font-medium ${teacher.isActive ? "" : "line-through text-muted-foreground"}`}>
                    {teacher.fullName}
                  </p></TableCell><TableCell>{teacher.identifier}</TableCell><TableCell>{teacher.publishedQuizzes}</TableCell><TableCell>{teacher.isActive ? "Active" : "Inactive"}</TableCell><TableCell className="text-right">
                {teacher.isActive ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11 text-destructive hover:text-destructive"
                    disabled={toggleMutation.isPending}
                    onClick={() => {
                      setActionError(null);
                      toggleMutation.mutate({ id: teacher.id, isActive: false });
                    }}
                  >
                    <ShieldOff aria-hidden="true" />Deactivate
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    disabled={toggleMutation.isPending}
                    onClick={() => {
                      setActionError(null);
                      toggleMutation.mutate({ id: teacher.id, isActive: true });
                    }}
                  >
                    <ShieldCheck aria-hidden="true" />Reactivate
                  </Button>
                )}</TableCell>
              </TableRow>
            ))}
            </TableBody></Table>
            {query.data.meta.totalPages > 1 && <nav className="flex items-center justify-between gap-3 border-t p-3" aria-label="Teachers pagination"><Button variant="outline" className="min-h-11" disabled={page <= 1 || query.isFetching} onClick={() => setPage((value) => value - 1)}>Previous</Button><span className="text-sm text-muted-foreground">Page {query.data.meta.page} of {query.data.meta.totalPages}</span><Button variant="outline" className="min-h-11" disabled={page >= query.data.meta.totalPages || query.isFetching} onClick={() => setPage((value) => value + 1)}>Next</Button></nav>}
          </div>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add teacher</DialogTitle>
            <DialogDescription>
              You set the initial password. The teacher signs in with their staff ID.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="teacher-full-name">Full name</Label>
            <Input
              id="teacher-full-name"
              type="text"
              maxLength={150}
              value={formFullName}
              onChange={(e) => setFormFullName(e.target.value)}
              autoFocus
            />
            <Label htmlFor="teacher-staff-id" className="mt-2">Staff ID</Label>
            <Input
              id="teacher-staff-id"
              type="text"
              maxLength={50}
              placeholder="e.g. STF-014"
              value={formStaffId}
              onChange={(e) => setFormStaffId(e.target.value)}
            />
            <Label htmlFor="teacher-password" className="mt-2">Initial password</Label>
            <Input
              id="teacher-password"
              type="password"
              maxLength={72}
              value={formPassword}
              onChange={(e) => setFormPassword(e.target.value)}
            />
            {formError && (
              <p role="alert" className="text-sm text-destructive">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={submitForm} disabled={createMutation.isPending || !formReady}>
              {createMutation.isPending ? "Creating…" : "Create account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
