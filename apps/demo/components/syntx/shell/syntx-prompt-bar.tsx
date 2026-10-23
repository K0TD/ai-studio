"use client";
import {
  ArrowUp,
  Loader2,
  Paperclip,
  SlidersHorizontal,
  X,
} from "lucide-react";
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
  maxCostRub: string;
  expiresAt: string;
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
const videoRequest = (
  settings: VideoSettings,
  model: ModelMetadata | undefined,
  attachment: UploadedReference | null
): GenerationSettings => {
  const result: GenerationSettings = {
    aspectRatio: settings.aspectRatio,
    duration: settings.duration,
    generateAudio: !!model?.supportsAudio && settings.generateAudio,
    heygenVoiceId: settings.heygenVoiceId,
    negativePrompt: settings.negativePrompt,
    resolution: settings.resolution,
    seed: settings.seed,
  };
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
  result.frameImages = frameImages;
  if (attachment && model?.supportsReferences) {
    result.inputReferences = [
      { file: { file_id: attachment.id }, type: "file" },
    ];
  }
  return result;
};
const imageRequest = (
  settings: ImageSettings,
  attachment: UploadedReference | null,
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
  if (attachment) {
    result.inputReferences = [
      { file: { file_id: attachment.id }, type: "file" },
    ];
  } else if (settings.referenceImageUrl) {
    result.inputReferences = [
      { image_url: { url: settings.referenceImageUrl }, type: "image_url" },
    ];
  }
  return result;
};
const promptRequest = (
  state: K0tdStoreState,
  attachment: UploadedReference | null
): GenerateRequest | null => {
  const common = { chatId: state.activeChatId, prompt: state.prompt.trim() };
  if (state.activeTab === "video") {
    const model = state.models.find(
      (candidate) => candidate.id === state.videoSettings.modelId
    );
    return {
      ...common,
      modelId: state.videoSettings.modelId,
      settings: videoRequest(state.videoSettings, model, attachment),
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
        attachment,
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
  const serialized = JSON.stringify(request);
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
  const serialized = JSON.stringify(request);
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
}: {
  allowed: boolean;
  error: string;
  quote: Quote | null;
  prompt: string;
  available: string;
}) => {
  let message = "Стоимость появится после ввода промпта";
  if (!allowed) {
    message =
      "👑 Для этой модели требуется статус VIP. Переключитесь на бюджетную модель или обратитесь к администратору.";
  } else if (error) {
    message = error;
  } else if (quote && Number(available) < Number(quote.maxCostRub)) {
    message = "Недостаточно доступного баланса. Обратитесь к администратору.";
  } else if (quote) {
    message = `Оценка ${formatRub(Number(quote.estimatedCostRub))} · Резерв до ${formatRub(Number(quote.maxCostRub))} · Доступно ${formatRub(Number(available))}`;
  } else if (prompt.trim()) {
    message = "Рассчитываем стоимость…";
  }
  return (
    <output
      aria-live="polite"
      className="mt-2 block text-center text-xs text-syntx-muted"
    >
      {message}
    </output>
  );
};
const AttachmentControl = ({
  disabled,
  onChange,
  onBusy,
}: {
  disabled: boolean;
  onChange: (reference: UploadedReference) => void;
  onBusy: (value: boolean) => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    onBusy(true);
    try {
      onChange(await uploadReference(file));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Загрузка не удалась"
      );
    } finally {
      onBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        aria-label="Прикрепить референс"
        disabled={disabled}
        className="rounded-lg p-2 disabled:opacity-40"
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip className="size-4" />
      </button>
      <input
        accept="image/png,image/jpeg,image/webp,video/mp4"
        className="hidden"
        onChange={upload}
        ref={inputRef}
        type="file"
      />
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
  const [attachment, setAttachment] = useState<UploadedReference | null>(null);
  const request = promptRequest(state, attachment);
  const model = state.models.find(
    (candidate) => candidate.id === request?.modelId
  );
  useEffect(() => {
    if (attachment && !model?.supportsReferences) {
      setAttachment(null);
    }
  }, [attachment, model?.supportsReferences]);
  const allowed = !!request && modelAllowed(state.user, model);
  useChatInitialization(request, allowed);
  const { quote, error, quoting } = useQuote(
    request,
    allowed,
    state.isGenerating
  );
  const { generate, hasRetry, disabled } = useSubmission(
    request,
    allowed,
    quote,
    uploading,
    () => setAttachment(null)
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
          {attachment && (
            <div className="mb-2 flex items-center gap-2 rounded-xl border p-2 text-xs">
              <Paperclip className="size-3" />
              <span className="truncate">{attachment.filename}</span>
              <button
                type="button"
                aria-label="Убрать референс"
                onClick={() => setAttachment(null)}
              >
                <X className="size-3" />
              </button>
            </div>
          )}
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
            {state.activeTab !== "audio" && (
              <AttachmentControl
                disabled={uploading || !allowed || !model?.supportsReferences}
                onChange={setAttachment}
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
          prompt={state.prompt}
          quote={quote}
        />
      </div>
    </div>
  );
};
