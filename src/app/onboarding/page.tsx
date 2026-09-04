"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { roleDashboardPath } from "@/components/auth/redirect-if-authenticated";
import { apiFetch, ApiError } from "@/lib/auth/client-fetch";
import { toast } from "sonner";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";

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
  const [open, setOpen] = useState(false);
  const selected = items.find((item) => String(item.id) === value);
  const display = selected ? (labelKey === "name" ? selected.name : String(selected.value)) : "";
  return (
    <div className="space-y-2 min-w-0">
      <Label htmlFor={id}>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={label}
            disabled={disabled || loading}
            className={cn(
              "h-11 min-h-[44px] w-full min-w-0 justify-between bg-transparent px-3 py-2 text-sm font-normal",
              !value && "text-muted-foreground",
            )}
          >
            <span className="truncate text-left">{loading ? "Loading…" : display || placeholder}</span>
            <ChevronDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder={`Search ${label.toLowerCase()}…`} className="h-9" />
            <CommandList>
              <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">No results found.</CommandEmpty>
              <CommandGroup>
                {items.map((item) => {
                  const text = labelKey === "name" ? (item.name ?? "") : String(item.value ?? "");
                  return (
                    <CommandItem
                      key={item.id}
                      value={`${text} ${item.id}`}
                      onSelect={() => {
                        onChange(String(item.id));
                        setOpen(false);
                      }}
                      className="min-h-[44px] wrap-break-word"
                    >
                      <span className="truncate wrap-break-word">{text}</span>
                      <Check
                        className={cn("ml-auto size-4 shrink-0", value === String(item.id) ? "opacity-100" : "opacity-0")}
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

function SubmitButton({ submitting, label }: { submitting: boolean; label: string }) {
  return (
    <Button type="submit" disabled={submitting} aria-busy={submitting} className="w-full min-w-0">
      {submitting ? (
        <>
          <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
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
    <p role="alert" aria-live="assertive" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive wrap-break-word">
      {error}
    </p>
  );
}

function StructureUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="space-y-4 text-center min-w-0">
      <p className="text-sm leading-relaxed text-muted-foreground wrap-break-word">
        The Board hasn&apos;t published the academic structure yet, so there&apos;s nothing to
        choose from. Try reloading — if it persists, check back later.
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
