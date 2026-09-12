import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";
import { RedirectIfAuthenticated } from "@/components/auth/redirect-if-authenticated";

export default function RegisterAspirantPage() {
  return (
    <AuthShell title="Create your aspirant account">
      <RedirectIfAuthenticated />
      <RegisterForm role="aspirant" />
    </AuthShell>
  );
}
