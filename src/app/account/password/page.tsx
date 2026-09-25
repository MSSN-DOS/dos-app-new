"use client";

import { KeyRound, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { apiFetch, ApiError } from "@/lib/auth/client-fetch";
import { AuthCard } from "@/components/auth/auth-card";
import { RequireRole } from "@/components/auth/require-role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Shared "your account" password rotation page. Every role reaches it from the header user
// menu; the API behind it (POST /api/auth/change-password) is deliberately role-agnostic —
// a Teacher's password is generated for them and shown once, so without this they could
// never rotate it.
export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const validationError =
    newPassword.length < 8 || newPassword.length > 72
      ? "Password must be 8 to 72 characters."
      : newPassword === currentPassword
        ? "Choose a password different from your current one."
        : confirmPassword !== newPassword
          ? "The confirmation doesn't match the new password."
          : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (validationError) {
      setFieldError(validationError);
      return;
    }
    setSaving(true);
    setFieldError(null);
    try {
      await apiFetch<{ ok: true }>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed");
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details) && err.details.length > 0) {
        const first = err.details[0] as { field?: string; message?: string };
        setFieldError(first.message ?? err.message);
      } else {
        setFieldError(err instanceof ApiError ? err.message : "Could not change the password. Try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <RequireRole roles={["admin", "teacher", "student", "aspirant"]}>
      <AuthCard title="Change password">
        <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-3" noValidate>
          <div className="grid gap-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              required
              maxLength={72}
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              required
              maxLength={72}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              required
              maxLength={72}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          {fieldError && (
            <p role="alert" className="text-sm text-destructive">{fieldError}</p>
          )}
          <Button
            type="submit"
            disabled={saving}
            aria-busy={saving}
            className="h-11 w-full justify-center gap-2"
          >
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <KeyRound className="size-4" aria-hidden="true" />}
            {saving ? "Saving…" : "Change password"}
          </Button>
        </form>
      </AuthCard>
    </RequireRole>
  );
}