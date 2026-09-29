"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch } from "@/lib/auth/client-fetch";

interface AvailabilityProps {
  quizId: number;
  weekStart: string | null;
  /** Server-side override; null on both means the default Sat 00:00 -> Mon 00:00 WAT window. */
  opensAt: string | null;
  closesAt: string | null;
}

interface WindowResponse {
  data: {
    id: number;
    opensAt: string | null;
    closesAt: string | null;
    effective: { opensAt: string; closesAt: string } | null;
  };
}

// The window rules are stated in WAT (Africa/Lagos, UTC+1, no DST). Format in that zone
// explicitly rather than trusting the viewer's device timezone, which would otherwise show a
// Nigerian admin a different time than the one the rule is defined in.
const WAT = "Africa/Lagos";

const dateTimeParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: WAT,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const watLabel = new Intl.DateTimeFormat("en-GB", {
  timeZone: WAT,
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** ISO instant -> value for <input type="datetime-local"> in WAT (YYYY-MM-DDTHH:mm). */
function toWatInputValue(iso: string | null): string {
  if (!iso) return "";
  const parts = dateTimeParts.formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function describeWat(iso: string | null): string {
  if (!iso) return "—";
  return `${watLabel.format(new Date(iso))} WAT`;
}

export function QuizAvailabilityPanel({
  quizId,
  weekStart,
  opensAt,
  closesAt,
}: AvailabilityProps) {
  const queryClient = useQueryClient();
  const isOverridden = opensAt != null || closesAt != null;

  // Server values stay authoritative until the Admin edits a field; local edits are held
  // separately so no effect-driven mirroring is needed.
  const [editedOpen, setEditedOpen] = useState<string | null>(null);
  const [editedClose, setEditedClose] = useState<string | null>(null);

  const openValue = editedOpen ?? toWatInputValue(opensAt);
  const closeValue = editedClose ?? toWatInputValue(closesAt);
  const dirty = editedOpen !== null || editedClose !== null;

  const saveMutation = useMutation({
    mutationFn: (input: { opensAt: string | null; closesAt: string | null }) =>
      apiFetch<WindowResponse>(`/admin/quizzes/${quizId}/window`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (result) => {
      setEditedOpen(null);
      setEditedClose(null);
      void queryClient.invalidateQueries({ queryKey: ["teacher", "quiz", quizId] });
      toast.success(
        result.data.opensAt || result.data.closesAt
          ? "Availability window updated"
          : "Reverted to the default Saturday–Sunday window",
      );
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : "Could not update the window",
      );
    },
  });

  const handleSave = () => {
    // datetime-local values are wall-clock in the viewer's zone; toISOString() normalises.
    saveMutation.mutate({
      opensAt: openValue ? new Date(openValue).toISOString() : null,
      closesAt: closeValue ? new Date(closeValue).toISOString() : null,
    });
  };

  const handleReset = () => {
    setEditedOpen("");
    setEditedClose("");
    saveMutation.mutate({ opensAt: null, closesAt: null });
  };

  const closeBeforeOpen =
    openValue !== "" &&
    closeValue !== "" &&
    new Date(closeValue).getTime() <= new Date(openValue).getTime();

  return (
    <section className="rounded-2xl border border-line bg-panel p-4 sm:p-6" aria-labelledby="quiz-availability-heading">
      <div className="space-y-1">
        <h2
          id="quiz-availability-heading"
          className="text-sm font-bold text-ink"
          style={{ fontFamily: "var(--font-fraunces), serif" }}
        >
          Availability window
        </h2>
        <p className="text-sm text-sub">
          Course Quizzes open Saturday 00:00 and close Monday 00:00 WAT by default. Override
          either side to release this quiz early, extend it, or close it sooner.
        </p>
      </div>

      <p className="mt-3 text-sm text-sub">
        Currently{" "}
        <span className="font-semibold text-ink">
          {isOverridden ? "overridden by an admin" : "the default weekly window"}
        </span>
        {weekStart ? ` for week starting ${weekStart}` : null}.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label
            htmlFor="quiz-opens-at"
            className="text-xs font-semibold uppercase tracking-wide text-sub"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            Opens at
          </Label>
          <Input
            id="quiz-opens-at"
            type="datetime-local"
            value={openValue}
            onChange={(e) => setEditedOpen(e.target.value)}
            className="min-h-11 rounded-xl border-line bg-canvas text-ink"
            disabled={saveMutation.isPending}
          />
          <p className="text-xs text-faint">
            {isOverridden && opensAt ? describeWat(opensAt) : "Defaults to Saturday 00:00 WAT"}
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label
            htmlFor="quiz-closes-at"
            className="text-xs font-semibold uppercase tracking-wide text-sub"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            Closes at
          </Label>
          <Input
            id="quiz-closes-at"
            type="datetime-local"
            value={closeValue}
            onChange={(e) => setEditedClose(e.target.value)}
            className="min-h-11 rounded-xl border-line bg-canvas text-ink"
            disabled={saveMutation.isPending}
          />
          <p className="text-xs text-faint">
            {isOverridden && closesAt ? describeWat(closesAt) : "Defaults to Monday 00:00 WAT"}
          </p>
        </div>
      </div>

      {closeBeforeOpen && (
        <p role="alert" className="mt-3 text-sm text-ruby">
          The close time must be after the open time.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          className="min-h-11 rounded-xl bg-brand text-white hover:bg-brand-hover"
          onClick={handleSave}
          disabled={!dirty || closeBeforeOpen || saveMutation.isPending}
        >
          {saveMutation.isPending ? "Saving…" : "Save window"}
        </Button>
        <Button
          variant="outline"
          className="min-h-11 rounded-xl border-line bg-canvas text-ink"
          onClick={handleReset}
          disabled={!isOverridden || saveMutation.isPending}
        >
          Reset to default
        </Button>
      </div>
    </section>
  );
}
