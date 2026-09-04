"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { roleDashboardPath } from "@/components/auth/redirect-if-authenticated";
import { apiFetch, ApiError } from "@/lib/auth/client-fetch";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Option {
  id: number;
  name?: string;
  value?: number;
}

function SelectField({
  id,
  label,
  placeholder,
  value,
  onChange,
  disabled,
  items,
  loading,
  labelKey,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  items: Option[];
  loading: boolean;
  labelKey: "name" | "value";
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled || loading}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={loading ? "Loading…" : placeholder} />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.id} value={String(item.id)}>
              {labelKey === "name" ? item.name : item.value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SubmitButton({ submitting, label }: { submitting: boolean; label: string }) {
  return (
    <Button type="submit" disabled={submitting} className="w-full">
      {submitting ? (
        <>
          <Loader2 className="animate-spin" aria-hidden="true" />
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
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  );
}

function StructureUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="space-y-4 text-center">
      <p className="text-sm leading-relaxed text-muted-foreground">
        The Board hasn&apos;t set up the academic structure yet, so there&apos;s nothing to
        choose from right now. Check back soon.
      </p>
      <Button variant="outline" onClick={onRetry} className="w-full">
        Try again
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

  if (loading || !isAuthenticated || !roleOk || statusQuery.isPending || statusQuery.isSuccess) {
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
    queryFn: () => apiFetch<{ data: Option[] }>("/structure/faculties").then((r) => r.data ?? []),
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
    mutationFn: (body: string) =>
      apiFetch("/auth/onboarding", { method: "POST", body }),
    onSuccess: () => router.push("/dashboard"),
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : "Something went wrong"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (facultyId === "" || departmentId === "" || levelId === "") {
      setError("Please choose a faculty, department and level");
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
          <SelectField
            id="faculty"
            label="Faculty"
            placeholder="Select faculty…"
            value={facultyId}
            onChange={onFacultyChange}
            items={facultiesQuery.data ?? []}
            loading={facultiesQuery.isPending}
            labelKey="name"
          />
          <SelectField
            id="department"
            label="Department"
            placeholder="Select department…"
            value={departmentId}
            onChange={onDepartmentChange}
            disabled={facultyId === "" || departmentsQuery.isError}
            items={departmentsQuery.data ?? []}
            loading={facultyId !== "" && departmentsQuery.isPending}
            labelKey="name"
          />
          <SelectField
            id="level"
            label="Level"
            placeholder="Select level…"
            value={levelId}
            onChange={setLevelId}
            disabled={departmentId === "" || levelsQuery.isError}
            items={levelsQuery.data ?? []}
            loading={departmentId !== "" && levelsQuery.isPending}
            labelKey="value"
          />
          <FormError error={error} />
          <SubmitButton submitting={submitMutation.isPending} label="Continue to dashboard" />
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

  const submitMutation = useMutation({
    mutationFn: (body: string) =>
      apiFetch("/auth/onboarding", { method: "POST", body }),
    onSuccess: () => router.push("/dashboard"),
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : "Something went wrong"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (aspirationDepartmentId === "") {
      setError("Please choose a department of aspiration");
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
          <SelectField
            id="aspiration"
            label="Department of aspiration"
            placeholder="Select department…"
            value={aspirationDepartmentId}
            onChange={setAspirationDepartmentId}
            items={departmentsQuery.data ?? []}
            loading={departmentsQuery.isPending}
            labelKey="name"
          />
          <FormError error={error} />
          <SubmitButton submitting={submitMutation.isPending} label="Continue to dashboard" />
          <p className="text-center text-xs text-muted-foreground">
            No JAMB score entry — the platform calculates Post-UTME from quiz results.
          </p>
        </form>
      )}
    </div>
  );
}
