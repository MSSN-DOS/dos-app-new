import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";
import { RedirectIfAuthenticated } from "@/components/auth/redirect-if-authenticated";

export default function RegisterStudentPage() {
  return (
    <AuthShell title="Create your student account">
      <RedirectIfAuthenticated />
      <RegisterForm role="student" />
    </AuthShell>
  );
}
