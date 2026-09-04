"use client";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
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

type SemesterSettings = {
  mode: "auto" | "manual";
  manualOverride: "harmattan" | "rain" | null;
  updatedAt: string | null;
};

const SEMESTER_LABEL = {
  harmattan: "Harmattan (1st Semester)",
  rain: "Rain (2nd Semester)",
} as const;

export default function SemesterSettingsPage() {
  const queryClient = useQueryClient();
  // Server values stay authoritative until the Admin touches a control; edits
  // are held separately so no effect-driven mirroring is needed.
  const [editedMode, setEditedMode] = useState<"auto" | "manual" | null>(null);
  const [editedOverride, setEditedOverride] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["admin", "semester-settings"],
    queryFn: () => apiFetch<{ data: SemesterSettings }>("/admin/settings/semester"),
  });

  const mode =
    editedMode ??
    (settingsQuery.data?.data.mode === "manual" ? "manual" : "auto");
  const override =
    editedOverride ?? settingsQuery.data?.data.manualOverride ?? "harmattan";

  const saveMutation = useMutation({
    mutationFn: (input: { mode: "auto" | "manual"; manualOverride?: string }) =>
      apiFetch<{ data: SemesterSettings }>("/admin/settings/semester", {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      setEditedMode(null);
      setEditedOverride(null);
      void queryClient.invalidateQueries({
        queryKey: ["admin", "semester-settings"],
      });
    },
  });

  const handleSave = () => {
    saveMutation.mutate(
      mode === "manual"
        ? { mode, manualOverride: override }
        : { mode },
    );
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        kicker="Settings"
        title="Semester Settings"
        description="Auto is the default. Manual mode is a safety net for when real dates drift from the hardcoded calendar."
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
                ? "Active semester derives from today's date against the 2025/26 calendar."
                : "Active semester is pinned to your override below."}
            </p>
          </div>

          {mode === "manual" && (
            <div>
              <Label htmlFor="semester-override" className="text-sm font-medium">
                Override
              </Label>
              <Select value={override} onValueChange={setEditedOverride}>
                <SelectTrigger id="semester-override" className="mt-2 min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="harmattan">{SEMESTER_LABEL.harmattan}</SelectItem>
                  <SelectItem value="rain">{SEMESTER_LABEL.rain}</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
              disabled={saveMutation.isPending}
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
    </div>
  );
}
