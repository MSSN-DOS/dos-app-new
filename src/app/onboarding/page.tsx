"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import { roleDashboardPath } from "@/components/auth/redirect-if-authenticated";
import { apiFetch, ApiError } from "@/lib/auth/client-fetch";
import { toast } from "sonner";
import { AuthCard } from "@/components/auth/auth-card";
import {
  StructurePicker,
  type StructureOption,
} from "@/components/structure/structure-picker";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface Option {
  id: number;
  name?: string;
  value?: number;
  facultyId?: number;
}

function SubmitButton({ submitting, label }: { submitting: boolean; label: string }) {
  return (
    <Button
      type="submit"
      disabled={submitting}
      aria-busy={submitting}
      className="w-full min-w-0"
    >
      {submitting ? (
        <>
          <Spinner />
          Saving…
        </>
      ) : (
        label
      )}
    </Button>
  );
}

function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      aria-live="assertive"
      className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive wrap-break-word"
    >
      {error}
    </p>
  );
}

function StructureUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="space-y-4 text-center min-w-0">
      <p className="text-sm leading-relaxed text-muted-foreground wrap-break-word">
        The Board hasn&apos;t published the academic structure yet, so there&apos;s
        nothing to choose from. Try reloading — if it persists, check back later.
      </p>
      <Button variant="outline" onClick={onRetry} className="w-full min-w-0">
        Reload
      </Button>
    </div>
  );
}

export default function OnboardingPage() {
  const { user, isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const roleOk = user?.role === "student" || user?.role === "aspirant";

  const statusQuery = useQuery({
    // Structure of this check: 200 = already onboarded (redirect away), 404 = needs the
    // form. Any other error still falls through to the form so the user isn't stuck —
    // the submit will surface a real error if something is wrong.
    queryKey: ["auth", "onboarding", "status"],
    queryFn: () => apiFetch<void>("/auth/onboarding", { method: "GET" }),
    enabled: !loading && isAuthenticated && roleOk,
    retry: false,
  });

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) router.replace("/login");
    else if (!roleOk) router.replace(roleDashboardPath(user?.role));
  }, [loading, isAuthenticated, roleOk, user?.role, router]);

  useEffect(() => {
    if (statusQuery.isSuccess) router.replace("/dashboard"); // already onboarded
  }, [statusQuery.isSuccess, router]);

  if (
    loading ||
    !isAuthenticated ||
    !roleOk ||
    statusQuery.isPending ||
    statusQuery.isSuccess
  ) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  return (
    <AuthCard title="Complete your profile">
      {user?.role === "aspirant" ? <AspirantForm /> : <StudentForm />}
    </AuthCard>
  );
}

function StudentForm() {
  const router = useRouter();
  const [facultyId, setFacultyId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const facultiesQuery = useQuery({
    queryKey: ["structure", "faculties"],
    queryFn: () =>
      apiFetch<{ data: Option[] }>("/structure/faculties").then((r) => r.data ?? []),
  });
  const departmentsQuery = useQuery({
    queryKey: ["structure", "departments", facultyId],
    queryFn: () =>
      apiFetch<{ data: Option[] }>(`/structure/departments?facultyId=${facultyId}`).then(
        (r) => r.data ?? [],
      ),
    enabled: facultyId !== "",
  });
  const levelsQuery = useQuery({
    queryKey: ["structure", "levels", departmentId],
    queryFn: () =>
      apiFetch<{ data: Option[] }>(`/structure/levels?departmentId=${departmentId}`).then(
        (r) => r.data ?? [],
      ),
    enabled: departmentId !== "",
  });

  function onFacultyChange(value: string) {
    setFacultyId(value);
    setDepartmentId("");
    setLevelId("");
  }

  function onDepartmentChange(value: string) {
    setDepartmentId(value);
    setLevelId("");
  }

  const submitMutation = useMutation({
    mutationFn: (body: string) => apiFetch("/auth/onboarding", { method: "POST", body }),
    onSuccess: () => {
      toast.success("Profile saved");
      router.push("/dashboard");
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : "Something went wrong";
      setError(msg);
      toast.error(msg);
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (facultyId === "" || departmentId === "" || levelId === "") {
      const msg = "Choose your faculty, department and level to continue.";
      setError(msg);
      toast.error(msg);
      return;
    }
    submitMutation.mutate(
      JSON.stringify({ departmentId: Number(departmentId), levelId: Number(levelId) }),
    );
  }

  return (
    <div className="space-y-4">
      {facultiesQuery.isError ? (
        <StructureUnavailable onRetry={() => void facultiesQuery.refetch()} />
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <StructurePicker
            id="faculty"
            label="Faculty"
            placeholder="Select faculty…"
            value={facultyId}
            onChange={onFacultyChange}
            options={(facultiesQuery.data ?? [])
              .filter((item) => item.name?.trim().toLowerCase() !== "engineering")
              .map((item) => ({
                id: item.id,
                label: item.name ?? "",
              }))}
            loading={facultiesQuery.isPending}
            countLabel="faculty"
            emptyLabel="No faculty matches that search."
          />
          <StructurePicker
            id="department"
            label="Department"
            placeholder={
              facultyId === "" ? "Choose a faculty first…" : "Select department…"
            }
            value={departmentId}
            onChange={onDepartmentChange}
            disabled={facultyId === "" || departmentsQuery.isError}
            options={(departmentsQuery.data ?? []).map((item) => ({
              id: item.id,
              label: item.name ?? "",
            }))}
            loading={facultyId !== "" && departmentsQuery.isPending}
            countLabel="department"
            emptyLabel="No department matches that search."
          />
          <StructurePicker
            id="level"
            label="Level"
            placeholder={
              departmentId === "" ? "Choose a department first…" : "Select level…"
            }
            value={levelId}
            onChange={setLevelId}
            disabled={departmentId === "" || levelsQuery.isError}
            options={(levelsQuery.data ?? []).map((item) => ({
              id: item.id,
              label: item.value == null ? "" : `${item.value}L`,
            }))}
            loading={departmentId !== "" && levelsQuery.isPending}
            countLabel="level"
            emptyLabel="This department has no levels yet — check back later."
          />
          <FormError error={error} />
          <SubmitButton
            submitting={submitMutation.isPending}
            label="Continue to dashboard"
          />
          <p className="text-center text-xs text-muted-foreground">
            No GPA/CGPA entry — the platform calculates it from quiz results.
          </p>
        </form>
      )}
    </div>
  );
}

function AspirantForm() {
  const router = useRouter();
  const [aspirationDepartmentId, setAspirationDepartmentId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const departmentsQuery = useQuery({
    queryKey: ["structure", "departments", "all"],
    queryFn: () =>
      apiFetch<{ data: Option[] }>("/structure/departments").then((r) => r.data ?? []),
  });
  // Only used to label department groups — the department rows already carry `facultyId`.
  const facultiesQuery = useQuery({
    queryKey: ["structure", "faculties"],
    queryFn: () =>
      apiFetch<{ data: Option[] }>("/structure/faculties").then((r) => r.data ?? []),
  });

  // Grouped by faculty, then alphabetical inside each group: 114 departments as one flat
  // list is unusable, and the groups double as the faculty name the aspirant may be
  // searching for instead of a department.
  const departmentOptions = useMemo<StructureOption[]>(() => {
    const facultyNames = new Map(
      (facultiesQuery.data ?? []).map((item) => [item.id, item.name ?? ""]),
    );
    return (departmentsQuery.data ?? [])
      .map((item) => ({
        id: item.id,
        label: item.name ?? "",
        group: facultyNames.get(item.facultyId ?? -1) ?? "Other departments",
      }))
      .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
  }, [departmentsQuery.data, facultiesQuery.data]);

  const submitMutation = useMutation({
    mutationFn: (body: string) => apiFetch("/auth/onboarding", { method: "POST", body }),
    onSuccess: () => {
      toast.success("Profile saved");
      router.push("/dashboard");
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : "Something went wrong";
      setError(msg);
      toast.error(msg);
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (aspirationDepartmentId === "") {
      const msg = "Choose your department of aspiration to continue.";
      setError(msg);
      toast.error(msg);
      return;
    }
    submitMutation.mutate(
      JSON.stringify({ aspirationDepartmentId: Number(aspirationDepartmentId) }),
    );
  }

  return (
    <div className="space-y-4">
      {departmentsQuery.isError ? (
        <StructureUnavailable onRetry={() => void departmentsQuery.refetch()} />
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <StructurePicker
            id="aspiration"
            label="Department of aspiration"
            placeholder="Select department…"
            value={aspirationDepartmentId}
            onChange={setAspirationDepartmentId}
            options={departmentOptions}
            loading={departmentsQuery.isPending}
            countLabel="department"
            emptyLabel="No department matches that search."
            searchPlaceholder="Search department or faculty…"
          />
          <FormError error={error} />
          <SubmitButton
            submitting={submitMutation.isPending}
            label="Continue to dashboard"
          />
          <p className="text-center text-xs text-muted-foreground">
            No JAMB score entry — the platform calculates Post-UTME from quiz results.
          </p>
        </form>
      )}
    </div>
  );
}
