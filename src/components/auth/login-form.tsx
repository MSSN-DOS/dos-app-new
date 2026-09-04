"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { ApiError } from "@/lib/auth/client-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const data = await login(identifier, password);
      const role = data.user.role;
      if (role === "admin") router.push("/admin");
      else if (role === "teacher") router.push("/teacher");
      else router.push("/onboarding");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="identifier">Matric No. / JAMB Reg No. / Staff ID</Label>
        <Input
          id="identifier"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
          autoComplete="username"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
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
