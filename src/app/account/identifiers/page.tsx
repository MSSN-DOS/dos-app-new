"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { AuthCard } from "@/components/auth/auth-card";
import { RequireRole } from "@/components/auth/require-role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiError } from "@/lib/auth/client-fetch";

type MeResponse = {
  data: {
    identifier: string;
    matricNumber: string | null;
    jambRegNumber: string | null;
    role: string;
  };
};

type MissingType = "matric" | "jamb";

const COPY: Record<MissingType, { label: string; hint: string; placeholder: string }> = {
  matric: {
    label: "Matric Number",
    hint: "Format YY/FF/DD### — for example 21/30GN019.",
    placeholder: "21/30GN019",
  },
  jamb: {
    label: "JAMB Registration Number",
    hint: "Format 4-digit year + 8 digits + 2 letters — for example 202612345678AB.",
    placeholder: "202612345678AB",
  },
};

// Student-only (deliberately unlike /account/password, which every role reaches): a Student may
// sign up with either their Matric number or their JAMB registration number, and this page
// attaches whichever one is still missing so both work at login (Board decision 2026-11-10).
// One-way by design — a set value is never editable or removable here.
export default function LoginDetailsPage() {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<MeResponse>("/me"),
    staleTime: 60_000,
    retry: false,
  });

  const me = data?.data;
  const missingType: MissingType | null = !me
    ? null
    : me.matricNumber === null
      ? "matric"
      : me.jambRegNumber === null
        ? "jamb"
        : null;
  const copy = missingType ? COPY[missingType] : null;

  const adding = useMutation({
    mutationFn: (identifier: string) =>
      apiFetch<{ data: { identifier: string } }>("/me", {
        method: "PATCH",
        body: JSON.stringify({ identifier }),
      }),
    onSuccess: () => {
      setValue("");
      setFieldError(null);
      toast.success("Login detail added");
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => {
      if (err instanceof ApiError && Array.isArray(err.details) && err.details.length > 0) {
        const first = err.details[0] as { field?: string; message?: string };
        setFieldError(first.message ?? err.message);
      } else {
        setFieldError(
          err instanceof ApiError ? err.message : "Could not save that identifier. Try again.",
        );
      }
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setFieldError(`Enter your ${copy?.label ?? "identifier"}.`);
      return;
    }
    setFieldError(null);
    adding.mutate(trimmed);
  };

  return (
    <RequireRole roles={["student"]}>
      <AuthCard title="Login details">
        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading your login details…</p>
        ) : isError || !me ? (
          <div className="grid gap-3">
            <p role="alert" className="text-sm text-destructive">
              Could not load your login details.
            </p>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full justify-center"
              onClick={() => void refetch()}
            >
              Try again
            </Button>
          </div>
        ) : (
          <div className="grid gap-5">
            <dl className="grid gap-3 text-sm">
              <div className="grid gap-1">
                <dt className="text-muted-foreground">Matric Number</dt>
                <dd className="font-mono">{me.matricNumber ?? "Not added"}</dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-muted-foreground">JAMB Registration Number</dt>
                <dd className="font-mono">{me.jambRegNumber ?? "Not added"}</dd>
              </div>
            </dl>

            {copy ? (
              <form onSubmit={handleSubmit} className="grid gap-3" noValidate>
                <div className="grid gap-2">
                  <Label htmlFor="identifier">Add your {copy.label}</Label>
                  <Input
                    id="identifier"
                    required
                    maxLength={50}
                    autoComplete="off"
                    placeholder={copy.placeholder}
                    value={value}
                    onChange={(e) => setValue(e.target.value.toUpperCase())}
                  />
                  <p className="text-xs text-muted-foreground">{copy.hint}</p>
                </div>
                {fieldError && (
                  <p role="alert" className="text-sm text-destructive">
                    {fieldError}
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={adding.isPending}
                  aria-busy={adding.isPending}
                  className="h-11 w-full justify-center gap-2"
                >
                  {adding.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ShieldCheck className="size-4" aria-hidden="true" />
                  )}
                  {adding.isPending ? "Saving…" : `Add ${copy.label}`}
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                Both identifiers are on your account, so you can sign in with either one. They
                can&apos;t be changed here — contact the Board if one of them is wrong.
              </p>
            )}
          </div>
        )}
      </AuthCard>
    </RequireRole>
  );
}
