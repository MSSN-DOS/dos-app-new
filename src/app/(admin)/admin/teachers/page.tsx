"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Copy, PencilLine, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { apiFetch, ApiError } from "@/lib/auth/client-fetch";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface TeacherRow {
  id: number;
  fullName: string;
  identifier: string;
  isActive: boolean;
  publishedQuizzes: number;
  subjects: string[];
}

interface CatalogueCourse {
  id: number;
  code: string;
  title: string;
}

interface CatalogueSubject {
  id: number;
  name: string;
}

interface SubjectsResponse {
  data: {
    courses: CatalogueCourse[];
    jambSubjects: CatalogueSubject[];
  };
}

interface CreatedTeacher {
  teacher: { id: number; fullName: string; identifier: string; isActive: boolean };
  initialPassword: string;
  courses: CatalogueCourse[];
  jambSubjects: CatalogueSubject[];
}

type PageMeta = { page: number; pageSize: number; total: number; totalPages: number };
type TeachersResponse = { data: TeacherRow[]; meta: PageMeta };
const PAGE_SIZE = 10;

function MultiSelectField({
  id,
  label,
  placeholder,
  items,
  selected,
  onChange,
  loading,
  error,
}: {
  id: string;
  label: string;
  placeholder: string;
  items: { id: number; label: string }[];
  selected: number[];
  onChange: (ids: number[]) => void;
  loading: boolean;
  error?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (itemId: number) => {
    if (selected.includes(itemId)) onChange(selected.filter((x) => x !== itemId));
    else onChange([...selected, itemId]);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={loading}
            className={cn(
              "h-11 w-full min-w-0 justify-between rounded-xl bg-transparent px-3 py-2 text-sm font-normal",
              selected.length === 0 && "text-muted-foreground",
              error && "border-destructive",
            )}
          >
            <span className="truncate text-left">
              {loading
                ? "Loading…"
                : selected.length > 0
                  ? `${label} selected: ${selected.length}`
                  : placeholder}
            </span>
            <ChevronDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder={`Search ${label.toLowerCase()}…`} className="h-9" />
            <CommandList>
              <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                No results found.
              </CommandEmpty>
              <CommandGroup>
                {items.map((item) => {
                  const checked = selected.includes(item.id);
                  return (
                    <CommandItem
                      key={item.id}
                      value={`${item.label} ${item.id}`}
                      onSelect={() => toggle(item.id)}
                      className="min-h-[44px]"
                    >
                      <span className="truncate">{item.label}</span>
                      <Check
                        className={cn("ml-auto size-4 shrink-0", checked ? "opacity-100" : "opacity-0")}
                        aria-hidden="true"
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

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

  // The same catalogue the authoring pickers use — for an Admin /api/teacher/subjects returns
  // everything. Both the create and edit dialogs pre-select from it.
  const subjectsQuery = useQuery({
    queryKey: ["admin", "teacher-subjects"],
    queryFn: async () => {
      const res = await apiFetch<SubjectsResponse>("/teacher/subjects");
      return res.data;
    },
  });
  const courseOptions = (subjectsQuery.data?.courses ?? []).map((c) => ({
    id: c.id,
    label: c.code,
  }));
  const jambOptions = (subjectsQuery.data?.jambSubjects ?? []).map((s) => ({
    id: s.id,
    label: s.name,
  }));

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherRow | null>(null);
  const [formFullName, setFormFullName] = useState("");
  const [formCourseIds, setFormCourseIds] = useState<number[]>([]);
  const [formJambSubjectIds, setFormJambSubjectIds] = useState<number[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TeacherRow | null>(null);

  const [credentials, setCredentials] = useState<{
    name: string;
    identifier: string;
    initialPassword: string;
    subjects: string[];
  } | null>(null);

  const resetForm = () => {
    setFormFullName("");
    setFormCourseIds([]);
    setFormJambSubjectIds([]);
    setFormError(null);
  };

  const openAdd = () => {
    resetForm();
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (teacher: TeacherRow) => {
    resetForm();
    setFormFullName(teacher.fullName);
    // The list shows subject *labels*; map them back to catalogue ids so the pickers can
    // pre-check them. Anything that no longer exists in the catalogue simply isn't checked.
    setFormCourseIds(
      teacher.subjects
        .map((label) => subjectsQuery.data?.courses.find((c) => c.code === label)?.id)
        .filter((id): id is number => id !== undefined),
    );
    setFormJambSubjectIds(
      teacher.subjects
        .map((label) => subjectsQuery.data?.jambSubjects.find((s) => s.name === label)?.id)
        .filter((id): id is number => id !== undefined),
    );
    setEditing(teacher);
    setFormOpen(true);
  };

  const formHasSubject = formCourseIds.length + formJambSubjectIds.length > 0;
  const formReady = formFullName.trim().length > 0 && formHasSubject;

  const createMutation = useMutation({
    mutationFn: async (body: { fullName: string; courseIds: number[]; jambSubjectIds: number[] }) =>
      apiFetch<CreatedTeacher>("/admin/teachers", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "teachers"] });
      setFormOpen(false);
      setCredentials({
        name: created.teacher.fullName,
        identifier: created.teacher.identifier,
        initialPassword: created.initialPassword,
        subjects: [
          ...created.courses.map((c) => c.code),
          ...created.jambSubjects.map((s) => s.name),
        ],
      });
      toast.success("Teacher account created");
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Could not create the account. Try again.";
      setFormError(message);
      toast.error(message);
    },
  });

  const editMutation = useMutation({
    mutationFn: async (body: { fullName: string; courseIds: number[]; jambSubjectIds: number[] }) =>
      apiFetch<TeacherRow>(`/admin/teachers/${editing?.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "teachers"] });
      setFormOpen(false);
      toast.success("Teacher updated");
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Could not update the account. Try again.";
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

  const deleteMutation = useMutation({
    mutationFn: async (id: number) =>
      apiFetch<undefined>(`/admin/teachers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "teachers"] });
      setPendingDelete(null);
      toast.success("Teacher deleted");
    },
    onError: (err: unknown) => {
      const message =
        err instanceof ApiError
          ? err.message
          : "Could not delete the account. Try again.";
      setActionError(message);
      toast.error(message);
    },
  });

  const submitForm = () => {
    if (!formReady) return;
    setFormError(null);
    const body = { fullName: formFullName, courseIds: formCourseIds, jambSubjectIds: formJambSubjectIds };
    if (editing) editMutation.mutate(body);
    else createMutation.mutate(body);
  };

  const copyCredentials = async () => {
    if (!credentials) return;
    const text = credentialsMessage(credentials);
    await navigator.clipboard.writeText(text);
    toast.success("Credentials copied");
  };

  return (
    <div>
      <AdminPageHeader
        kicker="Users"
        title="Teachers"
        description="Teachers don't self-register — you create their accounts here. Staff IDs and initial passwords are generated for you."
        actions={
          <Button onClick={openAdd} className="min-h-11 shrink-0 rounded-xl">
            Add teacher
          </Button>
        }
      />

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
              {query.error instanceof ApiError ? query.error.message : "Something went wrong"}
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void query.refetch()}>
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
            <Table aria-label="Teachers">
              <TableHeader>
                <TableRow>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Subjects</TableHead>
                  <TableHead className="hidden sm:table-cell">Published quizzes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.data.map((teacher) => (
                  <TableRow key={teacher.id}>
                    <TableCell>
                      <p className={`text-base font-medium ${teacher.isActive ? "" : "line-through text-muted-foreground"}`}>
                        {teacher.fullName}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{teacher.identifier}</TableCell>
                    <TableCell>
                      {teacher.subjects.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <ul className="flex flex-wrap gap-1.5" aria-label="Subjects">
                          {teacher.subjects.map((label) => (
                            <li
                              key={label}
                              className="rounded-md bg-muted px-2 py-1 text-sm font-medium"
                            >
                              {label}
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{teacher.publishedQuizzes}</TableCell>
                    <TableCell>{teacher.isActive ? "Active" : "Inactive"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-11"
                          disabled={toggleMutation.isPending || editMutation.isPending}
                          onClick={() => openEdit(teacher)}
                        >
                          <PencilLine aria-hidden="true" />Edit
                        </Button>
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
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-11 text-destructive hover:text-destructive"
                          disabled={deleteMutation.isPending || actionError !== null}
                          onClick={() => {
                            setActionError(null);
                            setPendingDelete(teacher);
                          }}
                        >
                          <Trash2 aria-hidden="true" />Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {query.data.meta.totalPages > 1 && (
              <nav
                className="flex items-center justify-between gap-3 border-t p-3"
                aria-label="Teachers pagination"
              >
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={page <= 1 || query.isFetching}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {query.data.meta.page} of {query.data.meta.totalPages}
                </span>
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={page >= query.data.meta.totalPages || query.isFetching}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </Button>
              </nav>
            )}
          </div>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={(open) => !open && (editMutation.isPending || createMutation.isPending) === false && setFormOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit teacher" : "Add teacher"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update the name and/or the subjects this teacher can author for."
                : "The staff ID and initial password are generated automatically and shown once after creation."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Label htmlFor="teacher-full-name">Full name</Label>
            <Input
              id="teacher-full-name"
              type="text"
              maxLength={150}
              value={formFullName}
              onChange={(e) => setFormFullName(e.target.value)}
              autoFocus
            />
            <MultiSelectField
              id="teacher-courses"
              label="Courses"
              placeholder="Select courses…"
              items={courseOptions}
              selected={formCourseIds}
              onChange={setFormCourseIds}
              loading={subjectsQuery.isPending}
              error={!formHasSubject}
            />
            <MultiSelectField
              id="teacher-jamb-subjects"
              label="JAMB subjects"
              placeholder="Select JAMB subjects…"
              items={jambOptions}
              selected={formJambSubjectIds}
              onChange={setFormJambSubjectIds}
              loading={subjectsQuery.isPending}
            />
            {!formHasSubject && (
              <p role="alert" className="text-sm text-destructive">
                Assign at least one course or JAMB subject — a teacher with none cannot author anything.
              </p>
            )}
            {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFormOpen(false)}
              disabled={editMutation.isPending || createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={submitForm}
              disabled={
                editMutation.isPending ||
                createMutation.isPending ||
                !formReady ||
                !formHasSubject
              }
            >
              {editMutation.isPending || createMutation.isPending
                ? "Saving…"
                : editing
                  ? "Save changes"
                  : "Create account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={credentials !== null} onOpenChange={(open) => !open && setCredentials(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Teacher credentials</DialogTitle>
            <DialogDescription>
              {credentials?.name} can sign in now. These are shown <span className="font-semibold">only once</span> — copy the message and save it in a safe place now.
            </DialogDescription>
          </DialogHeader>
          {credentials && (
            <pre className="whitespace-pre-wrap rounded-md border bg-muted p-4 text-sm leading-relaxed">
              {credentialsMessage(credentials)}
            </pre>
          )}
          <DialogFooter className="sm:justify-between">
            <Button variant="outline" className="min-h-11" onClick={() => void copyCredentials()}>
              <Copy aria-hidden="true" />Copy
            </Button>
              <Button className="min-h-11" onClick={() => setCredentials(null)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) =>
          !open && !deleteMutation.isPending && setPendingDelete(null)
        }
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this teacher?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {pendingDelete?.fullName} ({pendingDelete?.identifier}) and
              their subject assignments, and they can no longer sign in or be recognised by the
              portal. Deletion is permanently blocked while they have authored quizzes, questions,
              topics or content items: delete that content first, or use Deactivate instead to
              keep the account intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-between">
            <AlertDialogCancel className="min-h-11" disabled={deleteMutation.isPending}>
              Keep account
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function credentialsMessage(credentials: {
  name: string;
  identifier: string;
  initialPassword: string;
  subjects: string[];
}): string {
  return `Congratulations on join dos-app, ${credentials.name} as a Teacher of ${credentials.subjects.join(", ")}.\n\nYour Login credentials are:\nUser ID: ${credentials.identifier}\nPassword: ${credentials.initialPassword}\n\n_Change your password after login In to your portal_`;
}