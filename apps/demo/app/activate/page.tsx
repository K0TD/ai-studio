"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  apiErrorSchema,
  activationResponseSchema,
} from "@/lib/store/client-contracts";
const ActivatePage = () => {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errorMessage, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    setToken(
      new URLSearchParams(window.location.hash.slice(1)).get("token") ?? ""
    );
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  const activate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmation) {
      setError("Пароли не совпадают");
      return;
    }
    setPending(true);
    setError("");
    try {
      const res = await fetch("/api/k0td-ai/activate", {
        body: JSON.stringify({ password, token }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        const error = apiErrorSchema.safeParse(data);
        throw new Error(
          error.success ? error.data.error : "Не удалось активировать аккаунт"
        );
      }
      activationResponseSchema.parse(data);
      setDone(true);
      setToken("");
      setPassword("");
      setConfirmation("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Ошибка сети");
    } finally {
      setPending(false);
    }
  };
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <section className="rounded-3xl border bg-card p-7 shadow-xl">
        <h1 className="mb-5 text-2xl font-semibold">Активация аккаунта</h1>
        {done ? (
          <>
            <p className="mb-4">
              Пароль установлен. Теперь можно войти в студию.
            </p>
            <Link className="text-[#f05138] underline" href="/login">
              Перейти ко входу
            </Link>
          </>
        ) : (
          <form className="grid gap-4" onSubmit={activate}>
            <p className="text-sm text-muted-foreground">
              Создайте пароль для приглашенного аккаунта.
            </p>
            <label className="grid gap-2 text-sm">
              Пароль
              <input
                className="rounded-xl border bg-background p-3"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm">
              Повторите пароль
              <input
                className="rounded-xl border bg-background p-3"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
            {errorMessage && (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage}
              </p>
            )}
            <button
              disabled={pending || !token}
              className="rounded-xl bg-[#f05138] p-3 font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Активация…" : "Установить пароль"}
            </button>
            {!token && (
              <p className="text-sm text-muted-foreground">
                Откройте действующую ссылку приглашения от администратора.
              </p>
            )}
          </form>
        )}
      </section>
    </main>
  );
};
export default ActivatePage;
