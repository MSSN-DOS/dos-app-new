"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ApiError, apiFetch } from "@/lib/auth/client-fetch";
import { type SessionDates } from "@/lib/semester/calendar";
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

/** Shared by the manager, the settings page and the courses page. See the note on its queryFn. */
export const SESSIONS_QUERY_KEY = ["admin", "sessions"] as const;

const SESSION_FIELDS = [
  { key: "harmattanStart", label: "Harmattan starts" },
  { key: "harmattanEnd", label: "Harmattan ends" },
  { key: "rainStart", label: "Rain starts" },
  { key: "rainEnd", label: "Rain ends" },
] as const;

type SessionField = (typeof SESSION_FIELDS)[number]["key"];
type FormState = Record<SessionField, string> & { label: string };

const EMPTY_FORM: FormState = {
  label: "",
  harmattanStart: "",
  harmattanEnd: "",
  rainStart: "",
  rainEnd: "",
};

type FormMode = { kind: "add" } | { kind: "edit"; session: SessionDates };

/** `YYYY-MM-DD` → something a Nigerian Admin can read at a glance. */
function formatDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * Academic session manager — the calendar that decides which half of the portal a student can
 * see. Deliberately folded into the Semester Settings page rather than given its own nav item:
 * the session calendar and the override are the same decision, and an Admin who has to know
 * that "sessions" and "semester" are related to find the override will get it wrong.
 *
 * Exported as a component so the settings page owns the layout; this file owns the CRUD.
 */
export function SessionManager() {
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>({ kind: "add" });
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<SessionDates | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const sessionsQuery = useQuery({
    queryKey: SESSIONS_QUERY_KEY,
    // Unwrapped to a plain array. All three consumers of this key must return the SAME shape:
    // TanStack caches by key, not by queryFn, so a caller returning the raw `{ data }`
    // envelope while another returns the array would hand the second one `undefined` for
    // `.data` whenever the first one happened to populate the cache — a silent empty state,
    // not an error.
    queryFn: async () => (await apiFetch<{ data: SessionDates[] }>("/admin/sessions")).data,
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });

  const saveMutation = useMutation({
    mutationFn: async (body: FormState & { id?: number }) => {
      if (body.id === undefined) {
        return apiFetch<{ data: SessionDates }>("/admin/sessions", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      return apiFetch<{ data: SessionDates }>(`/admin/sessions/${body.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    onSuccess: (_result, variables) => {
      setFormOpen(false);
      setFormError(null);
      toast.success(
        variables.id === undefined ? "Session added" : "Session updated",
      );
      void invalidate();
    },
    onError: (err: unknown) => {
      const message = errorText(err, "Could not save the session. Try again.");
      setFormError(message);
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) =>
      apiFetch<void>(`/admin/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleteTarget(null);
      setDeleteError(null);
      toast.success("Session deleted");
      void invalidate();
    },
    onError: (err: unknown) => {
      // Keep the dialog open and show what is blocking the delete — a session that a course
      // still points at cannot be removed, and the Admin needs to see which course.
      const message = errorText(err, "Could not delete the session. Try again.");
      setDeleteError(message);
      toast.error(message);
    },
  });

  const sessions = sessionsQuery.data ?? [];
  // Which session is *actually* live, resolved server-side by `getActiveSemester()`. This used to
  // be `pickSessionForDate(sessions, new Date())` in the browser, which ignores the manual
  // override — so an Admin pinning last year's session saw this row still badged "Active now".
  const settingsQuery = useQuery({
    queryKey: ["admin", "semester-settings"],
    queryFn: () =>
      apiFetch<{ data: { active: { sessionId: number } | null } }>("/admin/settings/semester"),
  });
  const activeSessionId = settingsQuery.data?.data.active?.sessionId ?? null;

  const openAdd = () => {
    setFormMode({ kind: "add" });
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (session: SessionDates) => {
    setFormMode({ kind: "edit", session });
    setForm({
      label: session.label,
      harmattanStart: session.harmattanStart,
      harmattanEnd: session.harmattanEnd,
      rainStart: session.rainStart,
      rainEnd: session.rainEnd,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const submitForm = () => {
    setFormError(null);
    saveMutation.mutate({
      ...(formMode.kind === "edit" ? { id: formMode.session.id } : {}),
      label: form.label.trim(),
      harmattanStart: form.harmattanStart,
      harmattanEnd: form.harmattanEnd,
      rainStart: form.rainStart,
      rainEnd: form.rainEnd,
    });
  };

  const formReady = Boolean(
    form.label.trim() &&
      form.harmattanStart &&
      form.harmattanEnd &&
      form.rainStart &&
      form.rainEnd,
  );

  return (
    <section aria-labelledby="sessions-heading" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="sessions-heading" className="text-lg font-semibold">
            Academic sessions
          </h2>
          <p className="text-sm text-muted-foreground">
            Each session is one year holding a Harmattan and a Rain semester. Students only see
            courses, quizzes and resources belonging to the session that is active right now.
          </p>
        </div>
        <Button onClick={openAdd} className="min-h-11 shrink-0 rounded-xl">
          <Plus aria-hidden="true" />
          Add session
        </Button>
      </div>

      {sessionsQuery.isPending && (
        <div className="space-y-2" aria-busy="true" aria-label="Loading sessions">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {sessionsQuery.isError && (
        <div className="rounded-md border p-6 text-center" role="alert">
          <p className="text-sm text-muted-foreground">
            {errorText(sessionsQuery.error, "Something went wrong")}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 min-h-11"
            onClick={() => void sessionsQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {sessionsQuery.isSuccess && sessions.length === 0 && (
        <div className="rounded-md border border-dashed p-6 text-center">
          <CalendarDays
            aria-hidden="true"
            className="mx-auto mb-2 size-6 text-muted-foreground"
          />
          <p className="text-sm text-muted-foreground">
            No sessions yet. Until one exists, the app cannot resolve an active semester, so
            students see no courses, quizzes or resources at all. Add the current session first.
          </p>
          <Button onClick={openAdd} className="mt-3 min-h-11">
            <Plus aria-hidden="true" />
            Add the first session
          </Button>
        </div>
      )}

      {sessionsQuery.isSuccess && sessions.length > 0 && (
        <ul className="space-y-3">
          {sessions.map((session) => {
            const isResolved = activeSessionId === session.id;
            return (
              <li key={session.id}>
                <div
                  className={`rounded-lg border p-4 ${
                    isResolved ? "border-primary" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-base font-medium">
                        {session.label}
                        {isResolved && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            Active now
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Harmattan {formatDate(session.harmattanStart)} –{" "}
                        {formatDate(session.harmattanEnd)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Rain {formatDate(session.rainStart)} –{" "}
                        {formatDate(session.rainEnd)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-11"
                        onClick={() => openEdit(session)}
                      >
                        <Pencil aria-hidden="true" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-11 text-destructive hover:text-destructive"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteTarget(session);
                        }}
                      >
                        <Trash2 aria-hidden="true" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {sessions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Manual override needs a session to point at. Add one above first.
        </p>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {formMode.kind === "add" ? "Add session" : `Edit ${formMode.session.label}`}
            </DialogTitle>
            <DialogDescription>
              Dates are calendar dates in WAT. Harmattan must end before Rain starts.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="session-label">Session label</Label>
              <Input
                id="session-label"
                type="text"
                maxLength={7}
                placeholder="e.g. 2026/27"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                autoFocus
              />
            </div>
            {SESSION_FIELDS.map((field) => (
              <div key={field.key} className="grid gap-2">
                <Label htmlFor={`session-${field.key}`}>{field.label}</Label>
                <Input
                  id={`session-${field.key}`}
                  type="date"
                  value={form[field.key]}
                  onChange={(e) =>
                    setForm({ ...form, [field.key]: e.target.value })
                  }
                />
              </div>
            ))}
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFormOpen(false)}
              disabled={saveMutation.isPending}
              className="min-h-11"
            >
              Cancel
            </Button>
            <Button
              onClick={submitForm}
              disabled={saveMutation.isPending || !formReady}
              className="min-h-11"
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete session “{deleteTarget?.label}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Deletion is blocked while any course still belongs to this
              session, or while a manual override points at it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
