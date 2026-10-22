"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { safeCallbackUrl } from "@/lib/store/client-policy";
export const LoginForm = ({
  admin = false,
  callbackUrl = "/",
}: {
  admin?: boolean;
  callbackUrl?: string;
}) => {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = admin
        ? await authClient.signIn.username({ password, username: login })
        : await authClient.signIn.email({ email: login, password });
      if (result.error) {
        setError("Не удалось войти. Проверьте логин и пароль.");
        return;
      }
      router.replace(safeCallbackUrl(callbackUrl));
      router.refresh();
    } catch {
      setError("Сервис временно недоступен. Повторите вход.");
    } finally {
      setPending(false);
    }
  };
  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-7 shadow-xl"
    >
      <div>
        <span className="text-sm font-bold text-[#f05138]">k0td.ai</span>
        <h1 className="mt-2 text-2xl font-semibold">
          {admin ? "Вход администратора" : "Вход в студию"}
        </h1>
      </div>
      <label className="grid gap-2 text-sm">
        {admin ? "Логин" : "Email"}
        <input
          autoComplete="username"
          className="rounded-xl border border-input bg-background px-3 py-2.5"
          required
          type={admin ? "text" : "email"}
          value={login}
          onChange={(e) => setLogin(e.target.value)}
        />
      </label>
      <label className="grid gap-2 text-sm">
        Пароль
        <input
          autoComplete="current-password"
          className="rounded-xl border border-input bg-background px-3 py-2.5"
          required
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <button
        disabled={pending}
        className="rounded-xl bg-[#f05138] px-4 py-3 font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Входим…" : "Войти"}
      </button>
      {!admin && (
        <p className="text-sm text-muted-foreground">
          Для получения доступа обратитесь к администратору. Новый аккаунт
          активируется по приглашению.
        </p>
      )}
    </form>
  );
};
