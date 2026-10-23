"use client";
import {
  ArrowUp,
  FileAudio2,
  FileVideo2,
  Loader2,
  Paperclip,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";

import type { ModelMetadata } from "@/lib/routerai/types";
import {
  apiErrorSchema,
  chatResponseSchema,
  generationResponseSchema,
  quoteResponseSchema,
} from "@/lib/store/client-contracts";
import { modelAllowed, validQuote } from "@/lib/store/client-policy";
import type {
  ImageSettings,
  K0tdStoreState,
  VideoSettings,
} from "@/lib/store/k0td-store";
import { useSyntxStore } from "@/lib/store/syntx-store";

import type {
  GenerateRequest,
  GenerationSettings,
  UploadedReference,
} from "./syntx-api";
import { uploadReference } from "./syntx-api";
import { formatRub } from "./syntx-format";
interface Quote {
  id: string;
  estimatedCostRub: string;
  reserveCostRub: string;
  expiresAt: string;
  provider: { tag: string; name: string; estimatedCostRub: string };
  providerOptions: { tag: string; name: string; estimatedCostRub: string }[];
}
interface Submission {
  serialized: string;
  body: GenerateRequest & { quoteId: string };
  key: string;
}
const postStudio = async <T,>(
  path: "quote" | "generate" | "chats",
  serialized: string,
  schema: z.ZodType<T>,
  key?: string
): Promise<T> => {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (key) {
    headers["Idempotency-Key"] = key;
  }
  const response = await fetch(`/api/k0td-ai/${path}`, {
    body: serialized,
    headers,
    method: "POST",
  });
  const data = await response.json();
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(data);
    throw Object.assign(
      new Error(error.success ? error.data.error : `Ошибка ${response.status}`),
      {
        status: response.status,
      }
    );
  }
  return schema.parse(data);
};
const videoFrameInputs = (
  settings: VideoSettings,
  model: ModelMetadata | undefined,
  attachments: UploadedReference[]
): NonNullable<GenerationSettings["frameImages"]> => {
  const frameImages: NonNullable<GenerationSettings["frameImages"]> = [];
  if (
    settings.firstFrameUrl &&
    model?.supportedFrameImages?.includes("first_frame")
  ) {
    frameImages.push({
      frame_type: "first_frame",
      image_url: { url: settings.firstFrameUrl },
      type: "image_url",
    });
  }
  if (
    settings.lastFrameUrl &&
    model?.supportedFrameImages?.includes("last_frame")
  ) {
    frameImages.push({
      frame_type: "last_frame",
      image_url: { url: settings.lastFrameUrl },
      type: "image_url",
    });
  }
  const attachmentsBecomeFrames =
    model?.supportsFrameReferences && !model.supportsReferences;
  if (attachmentsBecomeFrames || model?.framesExclusiveWithReferences) {
    const images = attachments.filter((file) =>
      file.mimeType.startsWith("image/")
    );
    const usedFrames = new Set(frameImages.map((frame) => frame.frame_type));
    const frameSlots = (model?.supportedFrameImages ?? []).filter(
      (frame): frame is "first_frame" | "last_frame" =>
        (frame === "first_frame" || frame === "last_frame") &&
        !usedFrames.has(frame)
    );
    for (const [index, frame] of frameSlots.entries()) {
      const image = images[index];
      if (!image) {
        break;
      }
      frameImages.push({
        frame_type: frame,
        image_url: { url: image.url },
        type: "image_url",
      });
    }
  }
  return frameImages;
};
const videoRequest = (
  settings: VideoSettings,
  model: ModelMetadata | undefined,
  attachments: UploadedReference[]
): GenerationSettings => {
  const frameImages = videoFrameInputs(settings, model, attachments);
  const shouldUseFileReferences =
    model?.supportsReferences &&
    !(model.framesExclusiveWithReferences && attachments.length > 0);
  return {
    aspectRatio: settings.aspectRatio,
    duration: settings.duration,
    frameImages,
    generateAudio: !!model?.supportsAudio && settings.generateAudio,
    heygenVoiceId: settings.heygenVoiceId,
    inputReferences: shouldUseFileReferences
      ? attachments.map((attachment) => ({
          file: { file_id: attachment.id },
          type: "file" as const,
        }))
      : undefined,
    negativePrompt: settings.negativePrompt,
    resolution: settings.resolution,
    seed: settings.seed,
  };
};
const imageRequest = (
  settings: ImageSettings,
  attachments: UploadedReference[],
  supportsReferences: boolean
): GenerationSettings => {
  const result: GenerationSettings = {
    aspectRatio: settings.aspectRatio,
    background: settings.background,
    n: settings.n,
    negativePrompt: settings.negativePrompt,
    outputFormat: settings.outputFormat,
    quality: settings.quality,
    resolution: settings.resolution,
    seed: settings.seed,
  };
  if (!supportsReferences) {
    return result;
  }
  if (attachments.length) {
    result.inputReferences = attachments
      .filter((attachment) => attachment.mimeType.startsWith("image/"))
      .map((attachment) => ({
        file: { file_id: attachment.id },
        type: "file",
      }));
  } else if (settings.referenceImageUrl) {
    result.inputReferences = [
      { image_url: { url: settings.referenceImageUrl }, type: "image_url" },
    ];
  }
  return result;
};
const promptRequest = (
  state: K0tdStoreState,
  attachments: UploadedReference[]
): GenerateRequest | null => {
  const common = { chatId: state.activeChatId, prompt: state.prompt.trim() };
  if (state.activeTab === "video") {
    const model = state.models.find(
      (candidate) => candidate.id === state.videoSettings.modelId
    );
    return {
      ...common,
      modelId: state.videoSettings.modelId,
      settings: videoRequest(state.videoSettings, model, attachments),
      tab: "video",
    };
  }
  if (state.activeTab === "image") {
    const model = state.models.find(
      (candidate) => candidate.id === state.imageSettings.modelId
    );
    return {
      ...common,
      modelId: state.imageSettings.modelId,
      settings: imageRequest(
        state.imageSettings,
        attachments,
        model?.supportsReferences === true
      ),
      tab: "image",
    };
  }
  if (state.activeTab === "audio") {
    return {
      ...common,
      modelId: state.audioSettings.modelId,
      settings: { mode: "elevenlabs", voiceId: state.audioSettings.voiceId },
      tab: "audio",
    };
  }
  return null;
};
const useChatInitialization = (
  request: GenerateRequest | null,
  allowed: boolean
) => {
  const creating = useRef(false);
  const chats = useSyntxStore((state) => state.chats);
  const tab = request?.tab;
  const chatId = request?.chatId;
  useEffect(() => {
    if (!allowed || chatId || creating.current || !tab) {
      return;
    }
    const create = async () => {
      creating.current = true;
      try {
        const { chat } = await postStudio(
          "chats",
          JSON.stringify({ tab }),
          chatResponseSchema
        );
        useSyntxStore.setState((previous) => ({
          activeChatId:
            previous.activeTab === chat.tab ? chat.id : previous.activeChatId,
          chats: [chat, ...previous.chats],
        }));
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Не удалось создать чат"
        );
      } finally {
        creating.current = false;
      }
    };
    create();
  }, [allowed, chatId, tab, chats.length]);
};
const useQuote = (
  request: GenerateRequest | null,
  providerTag: string | undefined,
  allowed: boolean,
  generating: boolean
) => {
  const [quoted, setQuoted] = useState<{
    quote: Quote;
    serialized: string;
  } | null>(null);
  const [quoteError, setError] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [tick, setTick] = useState(0);
  const serialized = JSON.stringify({ ...request, providerTag });
  const ready = !!request?.prompt && !!request.chatId && allowed && !generating;
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setQuoted(null);
    setError("");
    setQuoting(false);
    if (!ready) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      setQuoting(true);
      try {
        const response = await postStudio(
          "quote",
          serialized,
          quoteResponseSchema
        );
        if (!cancelled) {
          setQuoted({ quote: response.quote, serialized });
        }
      } catch (error) {
        if (!cancelled) {
          setError(
            error instanceof Error ? error.message : "Расчет недоступен"
          );
        }
      } finally {
        if (!cancelled) {
          setQuoting(false);
        }
      }
    };
    const timer = setTimeout(load, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready, serialized, tick]);
  return {
    error: quoteError,
    quote: ready && quoted?.serialized === serialized ? quoted.quote : null,
    quoting,
  };
};
const retryAllowed = (error: Error) =>
  !("status" in error) ||
  Number(error.status) >= 500 ||
  [408, 429].includes(Number(error.status));
const useSubmission = (
  request: GenerateRequest | null,
  allowed: boolean,
  quote: Quote | null,
  uploading: boolean,
  onSuccess: () => void
) => {
  const state = useSyntxStore();
  const submission = useRef<Submission | null>(null);
  const serialized = JSON.stringify({
    providerTag: quote?.provider.tag,
    request,
  });
  const hasRetry = submission.current?.serialized === serialized;
  const quoteReady = validQuote(quote, state.user?.availableRub ?? "0.00");
  const generate = async () => {
    if (!request || !allowed || state.isGenerating || uploading) {
      return;
    }
    let { current } = submission;
    if (current?.serialized !== serialized) {
      if (!quoteReady || !quote) {
        return;
      }
      current = {
        body: { ...request, quoteId: quote.id },
        key: crypto.randomUUID(),
        serialized,
      };
      submission.current = current;
    }
    if (!current) {
      return;
    }
    state.setGenerating(true);
    try {
      const { item } = await postStudio(
        "generate",
        JSON.stringify(current.body),
        generationResponseSchema,
        current.key
      );
      state.addGenerationItem(item);
      submission.current = null;
      state.setPrompt("");
      onSuccess();
      if (item.status === "failed") {
        toast.error(item.metadata?.error ?? "Задание завершилось с ошибкой");
      } else if (item.status === "reconciling") {
        toast.info("Задание сверяется с провайдером. Резерв сохранен.");
      } else {
        toast.success(
          item.status === "completed"
            ? `Готово · ${formatRub(item.costRub)}`
            : "Задание принято. Статус обновится автоматически."
        );
      }
      await state.refreshServer();
    } catch (error) {
      if (error instanceof Error && !retryAllowed(error)) {
        submission.current = null;
      }
      toast.error(
        error instanceof Error
          ? error.message
          : "Не удалось отправить запрос. Повторите попытку."
      );
      await state.refreshServer();
    } finally {
      state.setGenerating(false);
    }
  };
  const disabled =
    !allowed ||
    state.isGenerating ||
    uploading ||
    (!quoteReady && !hasRetry) ||
    !request?.prompt;
  return { disabled, generate, hasRetry };
};
const QuoteSummary = ({
  allowed,
  error,
  quote,
  prompt,
  available,
  onProviderChange,
}: {
  allowed: boolean;
  error: string;
  quote: Quote | null;
  prompt: string;
  available: string;
  onProviderChange: (tag: string) => void;
}) => {
  let message = "Стоимость появится после ввода промпта";
  if (!allowed) {
    message =
      "👑 Для этой модели требуется статус VIP. Переключитесь на бюджетную модель или обратитесь к администратору.";
  } else if (error) {
    message = error;
  } else if (Number(available) < 0) {
    message = `Баланс в долге на ${formatRub(Math.abs(Number(available)))}. Пополните счёт, чтобы продолжить генерацию.`;
  } else if (quote && Number(available) < Number(quote.reserveCostRub)) {
    message = "Недостаточно доступного баланса. Обратитесь к администратору.";
  } else if (quote) {
    message = `Оценка ${formatRub(Number(quote.estimatedCostRub))} · Провайдер ${quote.provider.name} · Резерв ${formatRub(Number(quote.reserveCostRub))} · Фактическое списание по RouterAI · Доступно ${formatRub(Number(available))}`;
  } else if (prompt.trim()) {
    message = "Рассчитываем стоимость…";
  }
  return (
    <output
      aria-live="polite"
      className="mt-2 block text-center text-xs text-syntx-muted"
    >
      {message}
      {quote && quote.providerOptions.length > 1 && (
        <label className="ml-2 inline-flex items-center gap-1">
          <span>Провайдер:</span>
          <select
            aria-label="Провайдер генерации"
            className="rounded-md border border-syntx-line bg-syntx-surface px-1 py-0.5"
            value={quote.provider.tag}
            onChange={(event) => onProviderChange(event.target.value)}
          >
            {quote.providerOptions.map((option) => (
              <option key={option.tag} value={option.tag}>
                {option.name} · {formatRub(Number(option.estimatedCostRub))}
              </option>
            ))}
          </select>
        </label>
      )}
    </output>
  );
};
const AttachmentControl = ({
  disabled,
  attachments,
  maxCount,
  supportedTypes,
  onAdd,
  onRemove,
  onBusy,
}: {
  disabled: boolean;
  attachments: UploadedReference[];
  maxCount: number;
  supportedTypes: string[];
  onAdd: (references: UploadedReference[]) => void;
  onRemove: (id: string) => void;
  onBusy: (value: boolean) => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) {
      return;
    }
    const previousFocus = document.activeElement;
    dialogRef.current
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      if (previousFocus instanceof HTMLElement) {
        previousFocus.focus();
      }
    };
  }, [open]);
  const accept = supportedTypes
    .flatMap((type) => {
      if (type === "image") {
        return ["image/png", "image/jpeg", "image/webp"];
      }
      if (type === "video") {
        return ["video/mp4"];
      }
      if (type === "audio") {
        return [
          "audio/mpeg",
          "audio/mp4",
          "audio/wav",
          "audio/flac",
          "audio/ogg",
        ];
      }
      return [];
    })
    .join(",");
  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (!files.length) {
      return;
    }
    const allowedSlots = Math.max(0, maxCount - attachments.length);
    const selected = files.slice(0, allowedSlots);
    if (files.length > allowedSlots) {
      toast.error(`Можно добавить не больше ${maxCount} файлов`);
    }
    const currentBytes = attachments.reduce(
      (sum, file) => sum + file.sizeBytes,
      0
    );
    let acceptedBytes = currentBytes;
    onBusy(true);
    setBusy(true);
    try {
      const uploaded: UploadedReference[] = [];
      for (const file of selected) {
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`${file.name}: размер файла больше 20 МБ`);
          continue;
        }
        if (acceptedBytes + file.size > 24 * 1024 * 1024) {
          toast.error("Общий размер вложений не должен превышать 24 МБ");
          break;
        }
        try {
          const result = await uploadReference(file);
          acceptedBytes += result.sizeBytes;
          uploaded.push(result);
        } catch (error) {
          toast.error(
            error instanceof Error
              ? `${file.name}: ${error.message}`
              : `${file.name}: загрузка не удалась`
          );
        }
      }
      if (uploaded.length) {
        onAdd(uploaded);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Загрузка не удалась"
      );
    } finally {
      onBusy(false);
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        aria-label="Открыть вложения"
        aria-haspopup="dialog"
        disabled={disabled}
        className="rounded-lg p-2 disabled:opacity-40"
        onClick={() => setOpen(true)}
      >
        <Paperclip className="size-4" />
        {attachments.length > 0 && (
          <span className="ml-1 text-xs">{attachments.length}</span>
        )}
      </button>
      <input
        accept={accept}
        className="hidden"
        onChange={upload}
        ref={inputRef}
        multiple
        type="file"
      />
      {open && (
        <dialog
          open
          ref={dialogRef}
          aria-label="Вложения генерации"
          aria-modal="true"
          className="fixed inset-0 z-[100] m-0 flex h-full w-full max-w-none items-end justify-center border-0 bg-black/40 p-3 sm:items-center"
        >
          <section className="w-full max-w-xl rounded-2xl border border-syntx-line bg-syntx-surface p-4 shadow-2xl">
            <header className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Вложения</h2>
                <p className="text-xs text-syntx-muted">
                  {attachments.length} / {maxCount} · до 20 МБ на файл · 24 МБ
                  всего
                </p>
              </div>
              <button
                aria-label="Закрыть вложения"
                className="rounded-lg p-2 hover:bg-black/5"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X className="size-4" />
              </button>
            </header>
            {attachments.length ? (
              <ul className="mb-3 grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {attachments.map((attachment) => (
                  <li
                    className="group relative overflow-hidden rounded-xl border border-syntx-line bg-syntx-bg"
                    key={attachment.id}
                  >
                    {attachment.mimeType.startsWith("image/") ? (
                      <Image
                        alt={attachment.filename}
                        className="h-28 w-full object-cover"
                        height={224}
                        unoptimized
                        src={attachment.url}
                        width={320}
                      />
                    ) : (
                      <div className="flex h-28 items-center justify-center text-syntx-muted">
                        {attachment.mimeType.startsWith("video/") ? (
                          <FileVideo2 className="size-8" />
                        ) : (
                          <FileAudio2 className="size-8" />
                        )}
                      </div>
                    )}
                    <div className="truncate px-2 py-1.5 text-[11px]">
                      {attachment.filename}
                      <span className="block text-syntx-muted">
                        {(attachment.sizeBytes / 1024 / 1024).toFixed(1)} МБ
                      </span>
                    </div>
                    <button
                      aria-label={`Удалить ${attachment.filename}`}
                      className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                      onClick={() => onRemove(attachment.id)}
                      type="button"
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-3 rounded-xl border border-dashed border-syntx-line px-4 py-8 text-center text-xs text-syntx-muted">
                Добавьте изображение, видео или аудио. Доступные форматы зависят
                от модели.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                className="rounded-lg border border-syntx-line px-3 py-2 text-xs"
                onClick={() => setOpen(false)}
                type="button"
              >
                Готово
              </button>
              <button
                className="rounded-lg bg-syntx-ink px-3 py-2 text-xs text-white disabled:opacity-40"
                disabled={busy || attachments.length >= maxCount}
                onClick={() => inputRef.current?.click()}
                type="button"
              >
                {busy ? "Загружаем…" : "Добавить файлы"}
              </button>
            </div>
          </section>
        </dialog>
      )}
    </>
  );
};
const PromptParameters = ({ state }: { state: K0tdStoreState }) => {
  let text = "";
  if (state.activeTab === "video") {
    text = `${state.videoSettings.resolution} · ${state.videoSettings.duration}s · ${state.videoSettings.aspectRatio}`;
  }
  if (state.activeTab === "image") {
    text = `${state.imageSettings.resolution} · ${state.imageSettings.aspectRatio} · ×${state.imageSettings.n}`;
  }
  return <span className="text-xs text-syntx-muted">{text}</span>;
};
const attachmentTypesFor = (
  tab: K0tdStoreState["activeTab"],
  model: ModelMetadata
): string[] => {
  if (tab === "image") {
    return ["image"];
  }
  if (model.supportsReferences && !model.framesExclusiveWithReferences) {
    return model.supportedInputTypes ?? ["image"];
  }
  return ["image"];
};
const modelAcceptsAttachments = (
  tab: K0tdStoreState["activeTab"],
  model: ModelMetadata | undefined
) =>
  tab !== "audio" &&
  Boolean(model?.supportsReferences || model?.supportsFrameReferences);
const GenerationButton = ({
  generating,
  quoting,
  retry,
  disabled,
  onClick,
  quote,
}: {
  generating: boolean;
  quoting: boolean;
  retry: boolean;
  disabled: boolean;
  onClick: () => Promise<void>;
  quote: Quote | null;
}) => {
  let title = "Генерировать";
  if (generating) {
    title = "Отправляем…";
  } else if (retry) {
    title = "Повторить отправку";
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl bg-syntx-ink px-4 py-2 text-xs font-semibold text-syntx-bg hover:bg-syntx-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
    >
      {generating || quoting ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <ArrowUp className="size-4" />
      )}
      {title}
      {quote && <span>{formatRub(Number(quote.estimatedCostRub))}</span>}
    </button>
  );
};
export const SyntxPromptBar = ({
  onOpenSettings,
}: {
  onOpenSettings?: () => void;
}) => {
  const state = useSyntxStore();
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState<UploadedReference[]>([]);
  const [providerTag, setProviderTag] = useState<string>();
  const request = promptRequest(state, attachments);
  const model = state.models.find(
    (candidate) => candidate.id === request?.modelId
  );
  const canAttach = modelAcceptsAttachments(state.activeTab, model);
  useEffect(() => {
    const supportsAttachments =
      model?.supportsReferences || model?.supportsFrameReferences;
    if (attachments.length && !supportsAttachments) {
      setAttachments([]);
    }
  }, [
    attachments.length,
    model?.supportsReferences,
    model?.supportsFrameReferences,
  ]);
  const allowed = !!request && modelAllowed(state.user, model);
  useChatInitialization(request, allowed);
  const { quote, error, quoting } = useQuote(
    request,
    providerTag,
    allowed,
    state.isGenerating
  );
  const { generate, hasRetry, disabled } = useSubmission(
    request,
    allowed,
    quote,
    uploading,
    () => setAttachments([])
  );
  const keyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      generate();
    }
  };
  return (
    <div className="relative z-20 shrink-0 px-3 pb-3 sm:px-5 sm:pb-5">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-[24px] border border-syntx-line/80 bg-syntx-surface/90 p-2 shadow-[0_24px_60px_-30px_rgba(60,40,20,0.45)] backdrop-blur-2xl">
          <textarea
            aria-label="Промпт генерации"
            id="k0td-prompt-input"
            className="max-h-40 min-h-20 w-full resize-none bg-transparent px-3 py-2 text-sm outline-none"
            maxLength={5000}
            onChange={(event) => state.setPrompt(event.target.value)}
            onKeyDown={keyDown}
            placeholder={
              state.activeTab === "audio"
                ? "Введите текст для озвучки…"
                : "Опишите, что нужно создать…"
            }
            value={state.prompt}
          />
          <div className="flex flex-wrap items-center gap-2 px-1">
            <button
              type="button"
              className="flex items-center gap-1 rounded-lg border px-2 py-1 text-xs"
              onClick={onOpenSettings ?? state.toggleRightSidebar}
            >
              <SlidersHorizontal className="size-3" />
              {model?.name ?? "Параметры"}
            </button>
            <PromptParameters state={state} />
            {canAttach && model && (
              <AttachmentControl
                disabled={uploading || !allowed}
                attachments={attachments}
                maxCount={
                  model.maxReferenceCount ??
                  (model.supportsFrameReferences ? 2 : 4)
                }
                supportedTypes={attachmentTypesFor(state.activeTab, model)}
                onAdd={(added) =>
                  setAttachments((current) => [...current, ...added])
                }
                onRemove={(id) =>
                  setAttachments((current) =>
                    current.filter((file) => file.id !== id)
                  )
                }
                onBusy={setUploading}
              />
            )}
            <span className="ml-auto text-xs tabular-nums text-syntx-muted">
              {state.prompt.length} / 5000
            </span>
            <GenerationButton
              disabled={disabled}
              generating={state.isGenerating}
              onClick={generate}
              quote={quote}
              quoting={quoting}
              retry={hasRetry}
            />
          </div>
        </div>
        <QuoteSummary
          allowed={allowed}
          available={state.user?.availableRub ?? "0.00"}
          error={error}
          onProviderChange={setProviderTag}
          prompt={state.prompt}
          quote={quote}
        />
      </div>
    </div>
  );
};
