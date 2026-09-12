"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { ApiError } from "@/lib/auth/client-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!identifier.trim() || !password) {
      setError("Enter your identifier and password to continue.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const data = await login(identifier.trim(), password);
      const role = data.user.role;
      toast.success("Logged in");
      if (role === "admin") router.push("/admin");
      else if (role === "teacher") router.push("/teacher");
      else router.push("/onboarding");
    } catch (err) {
      let msg: string;
      if (err instanceof ApiError) {
        if (err.status === 401) msg = "Invalid identifier or password. Check and try again.";
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
        <Label htmlFor="identifier">
          Identifier — Matric / JAMB / Staff ID <span aria-hidden="true" className="text-destructive">*</span>
        </Label>
        <Input
          id="identifier"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
          autoComplete="username"
          maxLength={24}
          inputMode="text"
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? "login-error" : undefined}
          className="wrap-break-word"
        />
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
          autoComplete="current-password"
          maxLength={128}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? "login-error" : undefined}
        />
      </div>
      {error ? (
        <p id="login-error" role="alert" aria-live="assertive" className="wrap-break-word rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting} aria-busy={submitting} className="w-full min-h-11">
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Logging in…
          </>
        ) : (
          "Log in"
        )}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <a href="/register/student" className="text-primary underline underline-offset-4">
          Sign up
        </a>
      </p>
      <p className="text-center text-sm text-muted-foreground">
        {/* TODO(needs-board-decision): no reset flow in MVP (screens-auth.md) — placeholder only. */}
        <span
          aria-disabled="true"
          title="Password reset is not available yet"
          className="cursor-default text-muted-foreground underline underline-offset-4 opacity-70"
        >
          Forgot password?
        </span>
      </p>
    </form>
  );
}
