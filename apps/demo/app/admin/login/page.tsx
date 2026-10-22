import { LoginForm } from "@/components/login-form";
export default function AdminLoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <LoginForm admin callbackUrl="/admin" />
    </main>
  );
}
