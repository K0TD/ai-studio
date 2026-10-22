"use client";
import { Plus, RefreshCw, Shield, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SystemStats } from "@/lib/admin/types";
import { authClient } from "@/lib/auth-client";
import { roleSchema } from "@/lib/security/permissions";
import {
  adminUsersResponseSchema,
  adminRowsResponseSchema,
  invitationResponseSchema,
} from "@/lib/store/admin-contracts";
import {
  accountResponseSchema,
  apiErrorSchema,
  clientCatalogSchema,
  okResponseSchema,
} from "@/lib/store/client-contracts";
import { normalizeRubInput } from "@/lib/store/client-policy";
type Section = "video" | "image" | "audio";
interface Permissions {
  sections: Section[];
  modelIds: string[];
  dailyLimitRub: string | null;
  maxConcurrentJobs: number;
}
interface User {
  id: string;
  name: string;
  email: string;
  role: "user" | "vip" | "admin";
  balanceRub: string;
  reservedRub?: string;
  isApproved: boolean;
  isBanned: boolean;
  permissions: Permissions;
}
interface Row {
  id?: string;
  reason?: string;
  action?: string;
  prompt?: string;
  type?: string;
  amountRub?: string;
  status?: string;
  userName?: string;
  userId?: string;
}
type Stats = Partial<SystemStats> & { activeJobs?: number };
interface ReconcilePayload {
  action: "release" | "settle";
  reason: string;
  costRub?: string;
}
interface UserForm {
  name: string;
  email: string;
  role: User["role"];
  isApproved: boolean;
  isBanned: boolean;
  initialBalanceRub: string;
  permissions: Permissions;
}
const input =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm";
const button =
  "rounded-xl border border-border px-3 py-2 text-sm transition-colors hover:bg-muted disabled:opacity-50";
const rub = (value: string | number | undefined) =>
  `${Number(value ?? 0).toLocaleString("ru-RU", { maximumFractionDigits: 2, minimumFractionDigits: 2 })} ₽`;
const defaults: Permissions = {
  dailyLimitRub: null,
  maxConcurrentJobs: 1,
  modelIds: [],
  sections: [],
};
const labels = {
  audio: "Аудио",
  image: "Изображения",
  video: "Видео",
};
const api = async <T,>(
  path: string,
  schema: z.ZodType<T>,
  options?: RequestInit
): Promise<T> => {
  const response = await fetch(`/api/k0td-ai/${path}`, {
    ...options,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      window.location.assign("/admin/login");
    }
    const error = apiErrorSchema.safeParse(data);
    throw new Error(
      error.success ? error.data.error : `Ошибка ${response.status}`
    );
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error("Некорректный ответ сервера. Повторите попытку.");
  }
  return result.data;
};
const PermissionFields = ({
  value,
  onChange,
  models,
}: {
  value: Permissions;
  onChange: (p: Permissions) => void;
  models: {
    id: string;
    name: string;
  }[];
}) => (
  <fieldset className="grid gap-4 rounded-2xl border p-4">
    <legend className="px-2 text-sm font-semibold">Разрешения</legend>
    <div className="flex flex-wrap gap-4">
      {(["video", "image", "audio"] as const).map((section) => (
        <label key={section} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.sections.includes(section)}
            onChange={(e) =>
              onChange({
                ...value,
                sections: e.target.checked
                  ? [...value.sections, section]
                  : value.sections.filter((s) => s !== section),
              })
            }
          />
          {labels[section]}
        </label>
      ))}
    </div>
    <label className="grid gap-2 text-sm">
      Разрешенные модели
      <select
        multiple
        className={`${input} min-h-36`}
        value={value.modelIds}
        onChange={(e) =>
          onChange({
            ...value,
            modelIds: Array.from(
              e.target.selectedOptions,
              (option) => option.value
            ),
          })
        }
      >
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
      </select>
      <span className="text-xs text-muted-foreground">
        Пустой список не дает доступ к моделям. Для выбора нескольких
        используйте Ctrl / ⌘.
      </span>
    </label>
    <div className="grid grid-cols-2 gap-3">
      <label className="grid gap-2 text-sm">
        Лимит расходов в сутки, ₽
        <input
          className={input}
          inputMode="decimal"
          placeholder="Без лимита"
          pattern="[0-9]+([.][0-9]{1,2})?"
          value={value.dailyLimitRub ?? ""}
          onChange={(e) =>
            onChange({ ...value, dailyLimitRub: e.target.value || null })
          }
        />
      </label>
      <label className="grid gap-2 text-sm">
        Параллельных заданий
        <input
          className={input}
          type="number"
          min={1}
          max={20}
          required
          value={value.maxConcurrentJobs}
          onChange={(e) =>
            onChange({ ...value, maxConcurrentJobs: Number(e.target.value) })
          }
        />
      </label>
    </div>
  </fieldset>
);
const Reason = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) => (
  <label className="grid gap-2 text-sm">
    Причина изменения
    <textarea
      className={input}
      required
      minLength={5}
      maxLength={500}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </label>
);
const Modal = ({
  title,
  children,
  onClose,
  busy,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  busy: boolean;
}) => (
  <Dialog
    open
    onOpenChange={(open) => {
      if (!open && !busy) {
        onClose();
      }
    }}
  >
    <DialogContent
      aria-describedby={undefined}
      showCloseButton={!busy}
      className="max-h-[90dvh] overflow-y-auto rounded-3xl bg-card sm:max-w-xl"
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      {children}
    </DialogContent>
  </Dialog>
);

const accessLabel = (user: User) => {
  if (user.isBanned) {
    return "Заблокирован";
  }
  return user.isApproved ? "Одобрен" : "Ожидает доступа";
};
const StatsCards = ({
  stats,
  usersCount,
}: {
  stats: Stats;
  usersCount: number;
}) => {
  const cards = [
    {
      Icon: Users,
      label: "Пользователей",
      value: String(stats.totalUsers ?? usersCount),
    },
    { Icon: Wallet, label: "Общий баланс", value: rub(stats.totalBalanceRub) },
    {
      Icon: RefreshCw,
      label: "Активных заданий",
      value: String(stats.activeGenerations ?? stats.activeJobs ?? 0),
    },
  ];
  return cards.map(({ Icon, label, value }) => (
    <div key={label} className="rounded-2xl border bg-card p-5">
      <Icon className="mb-4 size-5 text-[#f05138]" />
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  ));
};
export const AdminConsole = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats>({});
  const [records, setRecords] = useState<Row[]>([]);
  const [models, setModels] = useState<
    {
      id: string;
      name: string;
    }[]
  >([]);
  const [tab, setTab] = useState<"users" | "transactions" | "audit" | "jobs">(
    "users"
  );
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [jobStatus, setJobStatus] = useState("");
  const [transactionUser, setTransactionUser] = useState("");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setError] = useState("");
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [balanceUser, setBalanceUser] = useState<User | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [activationUrl, setActivationUrl] = useState("");
  const [reconcileJob, setReconcileJob] = useState<Row | null>(null);
  const [settleCost, setSettleCost] = useState("");
  const [form, setForm] = useState<UserForm>({
    email: "",
    initialBalanceRub: "0.00",
    isApproved: true,
    isBanned: false,
    name: "",
    permissions: defaults,
    role: "user",
  });
  const balanceKey = useRef("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (tab === "users") {
        const data = await api(
          `admin/users?q=${encodeURIComponent(query)}&page=${page}&limit=25`,
          adminUsersResponseSchema
        );
        setUsers(data.users);
        setStats(data.stats ?? {});
        setTotal(data.total);
      } else {
        const data = await api(
          `admin/${tab}?page=${page}&limit=25${tab === "jobs" && jobStatus ? `&status=${encodeURIComponent(jobStatus)}` : ""}${tab === "transactions" && transactionUser ? `&userId=${encodeURIComponent(transactionUser)}` : ""}`,
          adminRowsResponseSchema
        );
        setRecords(data.transactions ?? data.events ?? data.items ?? []);
        setTotal(data.total ?? 0);
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Не удалось получить данные"
      );
    } finally {
      setLoading(false);
    }
  }, [tab, query, page, jobStatus, transactionUser]);
  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 250);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const loadModels = async () => {
      try {
        const data = await api("models", clientCatalogSchema);
        setModels([...data.video, ...data.image, ...data.audio]);
      } catch {
        toast.error("Каталог моделей недоступен");
      }
    };
    loadModels();
  }, []);
  const openEditor = (user: User | "new") => {
    setReason("");
    setEditing(user);
    setForm(
      user === "new"
        ? {
            email: "",
            initialBalanceRub: "0.00",
            isApproved: true,
            isBanned: false,
            name: "",
            permissions: { ...defaults },
            role: "user",
          }
        : {
            email: user.email,
            initialBalanceRub: "0.00",
            isApproved: user.isApproved,
            isBanned: user.isBanned,
            name: user.name,
            permissions: user.permissions ?? { ...defaults },
            role: user.role,
          }
    );
  };
  const mutate = async (action: () => Promise<void>) => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await action();
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось сохранить"
      );
    } finally {
      setBusy(false);
    }
  };
  const saveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    await mutate(async () => {
      if (editing === "new") {
        const { isBanned: _isBanned, ...createForm } = form;
        const data = await api("admin/users", invitationResponseSchema, {
          body: JSON.stringify({
            ...createForm,
            initialBalanceRub: normalizeRubInput(form.initialBalanceRub),
            permissions: {
              ...form.permissions,
              dailyLimitRub:
                form.permissions.dailyLimitRub === null
                  ? null
                  : normalizeRubInput(form.permissions.dailyLimitRub),
            },
          }),
          method: "POST",
        });
        setActivationUrl(data.activationUrl);
      } else if (editing) {
        await api(`admin/users/${editing.id}/access`, accountResponseSchema, {
          body: JSON.stringify({
            isApproved: form.isApproved,
            isBanned: form.isBanned,
            permissions: {
              ...form.permissions,
              dailyLimitRub:
                form.permissions.dailyLimitRub === null
                  ? null
                  : normalizeRubInput(form.permissions.dailyLimitRub),
            },
            reason,
            role: form.role,
          }),
          method: "POST",
        });
      }
      setEditing(null);
      toast.success("Изменения сохранены");
    });
  };
  const inviteUser = (user: User) =>
    mutate(async () => {
      const data = await api(
        `admin/users/${user.id}/invite`,
        invitationResponseSchema,
        { body: "{}", method: "POST" }
      );
      setActivationUrl(data.activationUrl);
    });
  const copyInvitation = async () => {
    try {
      await navigator.clipboard.writeText(activationUrl);
      toast.success("Ссылка скопирована");
    } catch {
      toast.error("Выделите и скопируйте ссылку вручную");
    }
  };
  const reconcileAction = (action: "release" | "settle") =>
    mutate(async () => {
      if (!reconcileJob) {
        return;
      }
      const payload: ReconcilePayload = { action, reason };
      if (action === "settle") {
        payload.costRub = normalizeRubInput(settleCost);
      }
      await api(`admin/jobs/${reconcileJob.id}/reconcile`, okResponseSchema, {
        body: JSON.stringify(payload),
        method: "POST",
      });
      setReconcileJob(null);
    });
  const renderEditingDialog = () =>
    editing && (
      <Modal
        title={
          editing === "new" ? "Приглашение пользователя" : "Доступ пользователя"
        }
        onClose={() => setEditing(null)}
        busy={busy}
      >
        <form onSubmit={saveUser} className="grid gap-4">
          {editing === "new" && (
            <>
              <label className="grid gap-2 text-sm">
                Имя
                <input
                  required
                  maxLength={100}
                  className={input}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="grid gap-2 text-sm">
                Email
                <input
                  required
                  type="email"
                  className={input}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label className="grid gap-2 text-sm">
                Начальный баланс, ₽
                <input
                  className={input}
                  required
                  pattern="[0-9]+([.][0-9]{1,2})?"
                  value={form.initialBalanceRub}
                  onChange={(e) =>
                    setForm({ ...form, initialBalanceRub: e.target.value })
                  }
                />
              </label>
            </>
          )}
          <label className="grid gap-2 text-sm">
            Роль
            <select
              className={input}
              value={form.role}
              onChange={(e) =>
                setForm({ ...form, role: roleSchema.parse(e.target.value) })
              }
            >
              <option value="user">Пользователь</option>
              <option value="vip">VIP</option>
              <option value="admin">Администратор</option>
            </select>
          </label>
          <div className="flex gap-5 text-sm">
            <label>
              <input
                type="checkbox"
                checked={form.isApproved}
                onChange={(e) =>
                  setForm({ ...form, isApproved: e.target.checked })
                }
              />{" "}
              Доступ одобрен
            </label>
            {editing !== "new" && (
              <label>
                <input
                  type="checkbox"
                  checked={form.isBanned}
                  onChange={(e) =>
                    setForm({ ...form, isBanned: e.target.checked })
                  }
                />{" "}
                Заблокирован
              </label>
            )}
          </div>
          <PermissionFields
            value={form.permissions}
            models={models}
            onChange={(permissions) => setForm({ ...form, permissions })}
          />
          {editing !== "new" && <Reason value={reason} onChange={setReason} />}
          <button
            disabled={busy}
            className={`${button} bg-[#f05138] text-white`}
          >
            {busy ? "Сохранение…" : "Сохранить"}
          </button>
        </form>
      </Modal>
    );
  const renderBalanceUserDialog = () =>
    balanceUser && (
      <Modal
        title={`Баланс: ${balanceUser.name}`}
        onClose={() => setBalanceUser(null)}
        busy={busy}
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void mutate(async () => {
              await api(
                `admin/users/${balanceUser.id}/balance`,
                accountResponseSchema,
                {
                  body: JSON.stringify({
                    amountRub: normalizeRubInput(amount),
                    reason,
                  }),
                  headers: { "Idempotency-Key": balanceKey.current },
                  method: "POST",
                }
              );
              setBalanceUser(null);
              toast.success("Баланс изменен");
            });
          }}
        >
          <p className="text-sm">
            Текущий: {rub(balanceUser.balanceRub)}. Резерв:{" "}
            {rub(balanceUser.reservedRub)}.
          </p>
          <label className="grid gap-2 text-sm">
            Изменение, ₽
            <input
              className={input}
              required
              pattern="-?[0-9]+([.][0-9]{1,2})?"
              placeholder="1000.00 или -500.00"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                balanceKey.current = crypto.randomUUID();
              }}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Положительная сумма зачисляет средства, отрицательная отзывает
            доступный баланс.
          </p>
          <Reason
            value={reason}
            onChange={(value) => {
              setReason(value);
              balanceKey.current = crypto.randomUUID();
            }}
          />
          <button
            disabled={busy}
            className={`${button} bg-[#f05138] text-white`}
          >
            {busy ? "Применение…" : "Применить изменение"}
          </button>
        </form>
      </Modal>
    );
  const renderActivationUrlDialog = () =>
    activationUrl && (
      <Modal
        title="Ссылка активации"
        onClose={() => setActivationUrl("")}
        busy={false}
      >
        <p className="mb-3 text-sm text-muted-foreground">
          Передайте эту одноразовую ссылку пользователю лично. После активации
          он установит свой пароль.
        </p>
        <input
          aria-label="Одноразовая ссылка активации"
          className={input}
          readOnly
          value={activationUrl}
          onFocus={(e) => e.target.select()}
        />
        <button className={`${button} mt-4`} onClick={copyInvitation}>
          Скопировать
        </button>
      </Modal>
    );
  const renderReconcileJobDialog = () =>
    reconcileJob && (
      <Modal
        title="Ручная сверка задания"
        onClose={() => setReconcileJob(null)}
        busy={busy}
      >
        <p className="mb-4 text-sm">
          Проверьте состояние и фактический расход в RouterAI перед финансовой
          операцией.
        </p>
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm">
            Фактическая стоимость, ₽
            <input
              className={input}
              pattern="[0-9]+([.][0-9]{1,2})?"
              value={settleCost}
              onChange={(e) => setSettleCost(e.target.value)}
            />
          </label>
          <Reason value={reason} onChange={setReason} />
          <div className="flex gap-2">
            {(["release", "settle"] as const).map((action) => (
              <button
                key={action}
                className={button}
                disabled={
                  busy ||
                  reason.trim().length < 5 ||
                  (action === "settle" &&
                    !/^[0-9]+(\.[0-9]{1,2})?$/u.test(settleCost))
                }
                onClick={() => reconcileAction(action)}
              >
                {action === "release"
                  ? "Освободить резерв"
                  : "Подтвердить расход"}
              </button>
            ))}
          </div>
        </div>
      </Modal>
    );
  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b pb-6">
          <div>
            <Link href="/" className="text-sm text-muted-foreground">
              ← В студию
            </Link>
            <h1 className="mt-3 flex items-center gap-3 text-3xl font-semibold">
              <Shield className="text-[#f05138]" />
              Управление сервисом
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Доступ, рублевый баланс и история действий
            </p>
          </div>
          <button
            className={button}
            onClick={async () => {
              await authClient.signOut();
              window.location.assign("/admin/login");
            }}
          >
            Выйти
          </button>
        </header>
        <div className="mb-7 grid gap-3 sm:grid-cols-3">
          <StatsCards stats={stats} usersCount={users.length} />
        </div>
        <div className="mb-5 flex flex-wrap justify-between gap-3">
          <nav className="flex flex-wrap gap-2">
            {(
              [
                ["users", "Пользователи"],
                ["transactions", "Операции"],
                ["audit", "Аудит"],
                ["jobs", "Задания"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={`${button} ${tab === id ? "bg-[#f05138] text-white" : ""}`}
                onClick={() => {
                  setTab(id);
                  setPage(1);
                  setRecords([]);
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="flex gap-2">
            <button
              aria-label="Обновить"
              className={button}
              disabled={loading}
              onClick={load}
            >
              <RefreshCw
                className={`size-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
            {tab === "users" && (
              <button
                className={`${button} flex items-center gap-2`}
                onClick={() => openEditor("new")}
              >
                <Plus className="size-4" />
                Пригласить
              </button>
            )}
          </div>
        </div>
        {tab === "users" && (
          <label className="mb-4 block max-w-md">
            <span className="sr-only">Поиск пользователей</span>
            <input
              className={input}
              placeholder="Имя, email или ID"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </label>
        )}
        {tab === "jobs" && (
          <label className="mb-4 grid max-w-xs gap-2 text-sm">
            Статус задания
            <select
              className={input}
              value={jobStatus}
              onChange={(e) => {
                setJobStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Все задания</option>
              <option value="reconciling">Нужна сверка</option>
              <option value="completed">Завершенные</option>
              <option value="failed">С ошибкой</option>
            </select>
          </label>
        )}
        {tab === "transactions" && (
          <label className="mb-4 grid max-w-md gap-2 text-sm">
            Пользователь
            <input
              className={input}
              placeholder="ID пользователя (пусто — все)"
              value={transactionUser}
              onChange={(e) => {
                setTransactionUser(e.target.value);
                setPage(1);
              }}
            />
          </label>
        )}
        {errorMessage && (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-destructive p-4 text-destructive"
          >
            {errorMessage}
          </p>
        )}
        <div
          className="overflow-x-auto rounded-2xl border bg-card"
          aria-busy={loading}
        >
          {tab === "users" ? (
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  {[
                    "Пользователь",
                    "Роль / доступ",
                    "Баланс / резерв",
                    "Действия",
                  ].map((label) => (
                    <th key={label} className="p-4">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b last:border-0">
                    <td className="p-4">
                      <p className="font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    </td>
                    <td className="p-4">
                      <p>{user.role}</p>
                      <p
                        className={`text-xs ${user.isBanned ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {accessLabel(user)}
                      </p>
                    </td>
                    <td className="p-4 tabular-nums">
                      {rub(user.balanceRub)}
                      <p className="text-xs text-muted-foreground">
                        Резерв: {rub(user.reservedRub)}
                      </p>
                    </td>
                    <td
                      className="p-4"
                      aria-label={`Действия с пользователем ${user.name}`}
                    >
                      <div className="flex flex-wrap gap-2">
                        <button
                          className={button}
                          onClick={() => openEditor(user)}
                        >
                          Доступ
                        </button>
                        <button
                          className={button}
                          onClick={() => {
                            setBalanceUser(user);
                            setAmount("");
                            setReason("");
                            balanceKey.current = crypto.randomUUID();
                          }}
                        >
                          Баланс ±
                        </button>
                        <button
                          disabled={busy}
                          className={button}
                          onClick={() => inviteUser(user)}
                        >
                          Приглашение
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="divide-y">
              {records.map((row, index) => (
                <article key={String(row.id ?? index)} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs text-muted-foreground">
                        {String(row.id ?? "")}
                      </p>
                      <p className="mt-1 text-sm font-medium">
                        {String(
                          row.reason ??
                            row.action ??
                            row.prompt ??
                            row.type ??
                            "Событие"
                        )}
                      </p>
                    </div>
                    {row.amountRub !== undefined && (
                      <strong className="tabular-nums">
                        {rub(row.amountRub)}
                      </strong>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {String(row.status ?? row.userName ?? row.userId ?? "")}
                    </span>
                    {tab === "jobs" &&
                      ["reconciling"].includes(String(row.status)) && (
                        <button
                          className={button}
                          onClick={() => {
                            setReconcileJob(row);
                            setReason("");
                            setSettleCost("");
                          }}
                        >
                          Сверить вручную
                        </button>
                      )}
                  </div>
                  <details className="mt-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Подробности</summary>
                    <pre className="mt-2 overflow-auto whitespace-pre-wrap">
                      {JSON.stringify(row, null, 2)}
                    </pre>
                  </details>
                </article>
              ))}
            </div>
          )}
          {!loading &&
            !errorMessage &&
            (tab === "users" ? users.length : records.length) === 0 && (
              <p className="p-8 text-center text-muted-foreground">
                Записей пока нет
              </p>
            )}
        </div>
        <footer className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>Всего: {total}</span>
          <div className="flex items-center gap-3">
            <button
              className={button}
              disabled={page === 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              Назад
            </button>
            <span>{page}</span>
            <button
              className={button}
              disabled={page * 25 >= total || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Далее
            </button>
          </div>
        </footer>
        {renderEditingDialog()}
        {renderBalanceUserDialog()}
        {renderActivationUrlDialog()}
        {renderReconcileJobDialog()}
      </div>
    </main>
  );
};
