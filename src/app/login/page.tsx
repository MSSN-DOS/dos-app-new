import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { RedirectIfAuthenticated } from "@/components/auth/redirect-if-authenticated";

export default function LoginPage() {
  return (
    <AuthCard title="Log in to DOS Site">
      <RedirectIfAuthenticated />
      <LoginForm />
    </AuthCard>
  );
}
