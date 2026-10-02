"use client";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { SessionManager, SESSIONS_QUERY_KEY } from "@/components/admin/session-manager";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiFetch } from "@/lib/auth/client-fetch";
import { type SessionDates } from "@/lib/semester/calendar";

type ResolvedActive = {
  semester: "harmattan" | "rain";
  sessionId: number;
  sessionLabel: string;
  source: "auto" | "manual";
} | null;

type SemesterSettings = {
  mode: "auto" | "manual";
  manualOverride: "harmattan" | "rain" | null;
  manualOverrideSessionId: number | null;
  updatedAt: string | null;
  /** Server-resolved via `getActiveSemester()`; null when today falls outside every session. */
  active: ResolvedActive;
};

const SEMESTER_LABEL = {
  harmattan: "Harmattan (1st Semester)",
  rain: "Rain (2nd Semester)",
} as const;

/**
 * Auto mode's explainer. The resolution itself now arrives from the server (`data.active`),
 * computed by the same `getActiveSemester()` students hit, so what the Admin reads here is what
 * students actually get — not a second, drifting implementation of the calendar rules in the
 * browser. Only the shape of the sentence is local.
 */
function autoResolutionCopy(active: ResolvedActive, sessions: SessionDates[]): string {
  if (sessions.length === 0) {
    return "No sessions exist yet, so no active semester can be resolved — students currently see no courses, quizzes or resources.";
  }
  if (active === null) {
    const first = sessions[0];
    return `No session has started yet. The first one starts on ${first.harmattanStart}, so nothing is active until then.`;
  }
  return `Active semester derives from today's date against the session calendar — currently ${active.sessionLabel}. Between sessions, the most recently started session stays active at its final semester.`;
}

export default function SemesterSettingsPage() {
  const queryClient = useQueryClient();
  // Server values stay authoritative until the Admin touches a control; edits
  // are held separately so no effect-driven mirroring is needed.
  const [editedMode, setEditedMode] = useState<"auto" | "manual" | null>(null);
  const [editedOverride, setEditedOverride] = useState<string | null>(null);
  const [editedOverrideSession, setEditedOverrideSession] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["admin", "semester-settings"],
    queryFn: () => apiFetch<{ data: SemesterSettings }>("/admin/settings/semester"),
  });
  // The manager below owns the list; the override picker needs it too, and a second
  // useQuery with the same key dedupes into the one HTTP call. It must return the same
  // shape the manager's queryFn does — same key means one shared cache entry.
  const sessionsQuery = useQuery({
    queryKey: SESSIONS_QUERY_KEY,
    queryFn: async () => (await apiFetch<{ data: SessionDates[] }>("/admin/sessions")).data,
  });

  const sessions = sessionsQuery.data ?? [];

  const mode =
    editedMode ??
    (settingsQuery.data?.data.mode === "manual" ? "manual" : "auto");
  const override =
    editedOverride ?? settingsQuery.data?.data.manualOverride ?? "harmattan";
  // Default the picker to whatever the calendar resolves to, so switching to manual starts from
  // a real, existing session instead of a blank the Admin has to go and look up. The resolution
  // comes from the server — re-running `pickSessionForDate` here would duplicate the calendar
  // rules in the browser, which is the drift AGENTS.md §3 exists to prevent.
  const autoSessionId = settingsQuery.data?.data.active?.sessionId ?? null;
  const overrideSessionId =
    editedOverrideSession ??
    (settingsQuery.data?.data.manualOverrideSessionId === null ||
    settingsQuery.data?.data.manualOverrideSessionId === undefined
      ? String(autoSessionId ?? "")
      : String(settingsQuery.data.data.manualOverrideSessionId));

  const saveMutation = useMutation({
    mutationFn: (input: {
      mode: "auto" | "manual";
      manualOverride?: string;
      manualOverrideSessionId?: number;
    }) =>
      apiFetch<{ data: SemesterSettings }>("/admin/settings/semester", {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      setEditedMode(null);
      setEditedOverride(null);
      setEditedOverrideSession(null);
      void queryClient.invalidateQueries({
        queryKey: ["admin", "semester-settings"],
      });
    },
  });

  const handleSave = () => {
    // Manual mode without a session is rejected by the server with a 422; refuse it here too so
    // the Admin gets an explanation instead of a field error on a picker they already emptied.
    if (mode === "manual" && !overrideSessionId) return;
    saveMutation.mutate(
      mode === "manual"
        ? {
            mode,
            manualOverride: override,
            manualOverrideSessionId: Number(overrideSessionId),
          }
        : { mode },
    );
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        kicker="Settings"
        title="Semester & Session Settings"
        description="Auto resolves the active semester from the session calendar below. Manual mode is the safety net for when real dates drift from what is recorded here."
      />

      {settingsQuery.isPending && (
        <div className="space-y-2 max-w-md" aria-busy="true" aria-label="Loading settings">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {settingsQuery.isError && (
        <div className="rounded-md border p-6 text-center" role="alert">
          <p className="text-sm text-muted-foreground">
            {settingsQuery.error instanceof ApiError
              ? settingsQuery.error.message
              : "Something went wrong"}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 min-h-11"
            onClick={() => void settingsQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {settingsQuery.isSuccess && (
        <fieldset className="max-w-md space-y-5 disabled:opacity-60" disabled={saveMutation.isPending}>
          <div>
            <Label htmlFor="semester-mode" className="text-sm font-medium">
              Mode
            </Label>
            <Select
              value={mode}
              onValueChange={(value) => setEditedMode(value as "auto" | "manual")}
            >
              <SelectTrigger id="semester-mode" className="mt-2 min-h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (calendar-driven)</SelectItem>
                <SelectItem value="manual">Manual override</SelectItem>
              </SelectContent>
            </Select>
            <p aria-live="polite" className="mt-2 text-sm text-muted-foreground">
              {mode === "auto"
                ? autoResolutionCopy(settingsQuery.data?.data.active ?? null, sessions)
                : "Active semester is pinned to your override below."}
            </p>
          </div>

          {mode === "manual" && (
            <>
              <div>
                <Label htmlFor="semester-override" className="text-sm font-medium">
                  Override session
                </Label>
                <Select
                  value={overrideSessionId}
                  onValueChange={setEditedOverrideSession}
                >
                  <SelectTrigger
                    id="semester-override"
                    className="mt-2 min-h-11 w-full"
                  >
                    <SelectValue placeholder="Select a session" />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map((session) => (
                      <SelectItem key={session.id} value={String(session.id)}>
                        {session.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {sessions.length === 0 && (
                  <p className="mt-2 text-sm text-destructive">
                    No sessions exist yet. Add one below before setting an override.
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="semester-override-semester" className="text-sm font-medium">
                  Override semester
                </Label>
                <Select value={override} onValueChange={setEditedOverride}>
                  <SelectTrigger
                    id="semester-override-semester"
                    className="mt-2 min-h-11 w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="harmattan">{SEMESTER_LABEL.harmattan}</SelectItem>
                    <SelectItem value="rain">{SEMESTER_LABEL.rain}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-2 text-sm text-muted-foreground">
                  Both halves matter: a semester on its own cannot say whether it is 2025/26 or
                  2026/27, and picking the wrong session would hide the entire year from
                  students.
                </p>
              </div>
            </>
          )}

          {saveMutation.isError && (
            <p role="alert" className="text-sm text-destructive">
              {saveMutation.error instanceof ApiError
                ? saveMutation.error.message
                : "Could not save — try again"}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending || (mode === "manual" && !overrideSessionId)}
              className="min-h-11"
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
            {settingsQuery.data.data.updatedAt && (
              <span className="text-xs text-muted-foreground">
                Last updated{" "}
                {new Date(settingsQuery.data.data.updatedAt).toLocaleString()}
              </span>
            )}
          </div>
        </fieldset>
      )}

      <hr className="border-border" />

      <SessionManager />
    </div>
  );
}
