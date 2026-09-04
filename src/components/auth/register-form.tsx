"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { ApiError } from "@/lib/auth/client-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { jambRegNumberSchema, matricNumberSchema } from "@/lib/validation/identifiers";

export function RegisterForm({ role }: { role: "student" | "aspirant" }) {
  const { register } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const idSchema = role === "student" ? matricNumberSchema : jambRegNumberSchema;
  const idLabel = role === "student" ? "Matric Number" : "JAMB Registration Number";
  const idHint =
    role === "student" ? "Format: YY/FF/DD### (e.g. 21/30GN019)" : "10 or 14 characters";

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!fullName.trim()) errs.fullName = "Full name is required";
    const idRes = idSchema.safeParse(identifier);
    if (!idRes.success) errs.identifier = idRes.error.issues[0]?.message ?? "Invalid identifier";
    if (password.length < 8) errs.password = "Password must be at least 8 characters";
    if (confirm !== password) errs.confirm = "Passwords do not match";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      await register({ fullName, identifier, password, role });
      router.push("/onboarding");
    } catch (err) {
      if (err instanceof ApiError && err.code === "CONFLICT") {
        setError("An account with this identifier already exists");
      } else {
        setError(err instanceof ApiError ? err.message : "Something went wrong");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
        {fieldErrors.fullName ? (
          <p className="text-sm text-destructive">{fieldErrors.fullName}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="identifier">{idLabel}</Label>
        <Input
          id="identifier"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">{idHint}</p>
        {fieldErrors.identifier ? (
          <p className="text-sm text-destructive">{fieldErrors.identifier}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
        />
        {fieldErrors.password ? (
          <p className="text-sm text-destructive">{fieldErrors.password}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
        />
        {fieldErrors.confirm ? (
          <p className="text-sm text-destructive">{fieldErrors.confirm}</p>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Creating account…
          </>
        ) : (
          "Create account"
        )}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <a href="/login" className="text-primary underline underline-offset-4">
          Log in
        </a>
      </p>
    </form>
  );
}
