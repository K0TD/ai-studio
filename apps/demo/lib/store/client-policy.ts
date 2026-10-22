import { isBudgetModel } from "../routerai/models-catalog";
import type { ModelMetadata } from "../routerai/types";
export const safeCallbackUrl = (value?: string): string => {
  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /%2f|%5c/iu.test(value) ||
    [...value].some(
      (character) =>
        (character.codePointAt(0) ?? 0) <= 32 ||
        character.codePointAt(0) === 127
    )
  ) {
    return "/";
  }
  try {
    const url = new URL(value, "https://studio.invalid");
    return url.origin === "https://studio.invalid"
      ? `${url.pathname}${url.search}${url.hash}`
      : "/";
  } catch {
    return "/";
  }
};
export const sectionAllowed = (
  account: {
    role: string;
    isApproved: boolean;
    isBanned: boolean;
    permissions?: {
      sections?: string[];
    };
  } | null,
  section: string
) =>
  Boolean(
    account &&
    !account.isBanned &&
    account.isApproved &&
    (account.role === "admin" ||
     account.role === "vip" ||
     !account.permissions?.sections ||
     account.permissions.sections.length === 0 ||
     account.permissions.sections.includes(section))
  );
export const modelAllowed = (
  account: {
    role: string;
    isApproved: boolean;
    isBanned: boolean;
    permissions?: {
      sections?: string[];
      modelIds?: string[];
    };
  } | null,
  model?: ModelMetadata
): boolean => {
  if (!model || !account || account.isBanned || !account.isApproved) {
    return false;
  }
  if (!sectionAllowed(account, model.category)) {
    return false;
  }
  // VIP и Администратор: все модели доступны по умолчанию
  if (account.role === "admin" || account.role === "vip") {
    return true;
  }
  // Индивидуально открытые модели в permissions
  if (account.permissions?.modelIds?.includes(model.id)) {
    return true;
  }
  // Обычный пользователь: по умолчанию доступны бюджетные модели
  return isBudgetModel(model);
};
export const validQuote = (
  quote: {
    expiresAt: string;
    maxCostRub: string;
  } | null,
  availableRub: string,
  now = Date.now()
): boolean => {
  if (
    !quote ||
    !Number.isFinite(Date.parse(quote.expiresAt)) ||
    Date.parse(quote.expiresAt) <= now
  ) {
    return false;
  }
  return (
    /^\d+(\.\d{1,2})?$/u.test(quote.maxCostRub) &&
    /^\d+(\.\d{1,2})?$/u.test(availableRub) &&
    Number.isFinite(Number(quote.maxCostRub)) &&
    Number(quote.maxCostRub) > 0 &&
    Number(availableRub) >= Number(quote.maxCostRub)
  );
};
export const disabledModelReason = (reason?: string): string =>
  ({
    access_not_granted: "Доступ к модели не выдан",
    catalog_stale: "Каталог ожидает обновления",
    model_unavailable: "Модель отсутствует у провайдера",
    unsupported_pricing: "Провайдер не подтвердил подходящий тариф",
    unsupported_provider_capability: "Возможность пока не подключена",
    vip_required: "Доступно только для тарифа VIP",
  })[reason ?? ""] ?? "Модель временно недоступна";
export const normalizeRubInput = (value: string): string => {
  const match = value.trim().match(/^(-?)(\d{1,10})(?:\.(\d{1,2}))?$/u);
  if (!match) {
    throw new Error("Укажите сумму в рублях с точностью до копейки");
  }
  return `${match[1]}${match[2].replace(/^0+(?=\d)/u, "")}.${(match[3] ?? "").padEnd(2, "0")}`;
};
