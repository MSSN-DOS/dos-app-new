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
import { toast } from "sonner";

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
    role === "student" ? "Format: YY/FF/DD### (e.g. 21/30GN019)" : "10 chars (e.g. 12345678AB) or 14 chars (e.g. 123456789012AB)";

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!fullName.trim()) errs.fullName = "Enter your full name as it appears on your records";
    const idRes = idSchema.safeParse(identifier);
    if (!idRes.success) errs.identifier = idRes.error.issues[0]?.message ?? "Check the format and try again";
    if (password.length < 8) errs.password = "Use at least 8 characters";
    if (confirm !== password) errs.confirm = "Passwords do not match — re-enter the same password";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      await register({ fullName: fullName.trim(), identifier: identifier.trim(), password, role });
      toast.success("Account created");
      router.push("/onboarding");
    } catch (err) {
      let msg: string;
      if (err instanceof ApiError) {
        if (err.code === "CONFLICT" || err.status === 409) msg = "An account with this identifier already exists.";
        else if (err.status === 422) msg = err.details ? String(err.message) : err.message;
        else if (err.status === 429) msg = "Too many attempts. Try again in a minute.";
        else if (err.status >= 500) msg = "Service temporarily unavailable. Try again.";
        else msg = err.message;
      } else if (err instanceof TypeError) {
        msg = "Network error. Check your connection and try again.";
      } else {
        msg = "Something went wrong. Try again.";
      }
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="fullName">
          Full name <span aria-hidden="true" className="text-destructive">*</span>
        </Label>
        <Input
          id="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          maxLength={100}
          autoComplete="name"
          aria-invalid={Boolean(fieldErrors.fullName) || undefined}
          aria-describedby={fieldErrors.fullName ? "fullName-error" : undefined}
          className="wrap-break-word"
        />
        {fieldErrors.fullName ? (
          <p id="fullName-error" role="alert" className="wrap-break-word text-sm text-destructive">{fieldErrors.fullName}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="identifier">
          {idLabel} <span aria-hidden="true" className="text-destructive">*</span>
        </Label>
        <Input
          id="identifier"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
          maxLength={24}
          autoComplete="username"
          inputMode="text"
          aria-invalid={Boolean(fieldErrors.identifier) || undefined}
          aria-describedby={fieldErrors.identifier ? "identifier-error identifier-hint" : "identifier-hint"}
          className="wrap-break-word"
        />
        <p id="identifier-hint" className="wrap-break-word text-xs text-muted-foreground">{idHint}</p>
        {fieldErrors.identifier ? (
          <p id="identifier-error" role="alert" className="wrap-break-word text-sm text-destructive">{fieldErrors.identifier}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">
          Password <span aria-hidden="true" className="text-destructive">*</span>
        </Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          maxLength={128}
          autoComplete="new-password"
          aria-invalid={Boolean(fieldErrors.password) || undefined}
          aria-describedby={fieldErrors.password ? "password-error" : undefined}
        />
        {fieldErrors.password ? (
          <p id="password-error" role="alert" className="wrap-break-word text-sm text-destructive">{fieldErrors.password}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">
          Confirm password <span aria-hidden="true" className="text-destructive">*</span>
        </Label>
        <Input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          maxLength={128}
          autoComplete="new-password"
          aria-invalid={Boolean(fieldErrors.confirm) || undefined}
          aria-describedby={fieldErrors.confirm ? "confirm-error" : undefined}
        />
        {fieldErrors.confirm ? (
          <p id="confirm-error" role="alert" className="wrap-break-word text-sm text-destructive">{fieldErrors.confirm}</p>
        ) : null}
      </div>
      {error ? (
        <p role="alert" aria-live="assertive" className="wrap-break-word rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting} aria-busy={submitting} className="w-full min-h-11">
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
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
