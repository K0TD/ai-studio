# AGENTS.md — Спецификация для параллельной разработки ИИ-агентами

Данный документ регламентирует параллельную разработку гибридного веб-клиента **Syntx.ai + Studio** на базе **RouterAI API** (`https://routerai.ru/api/v1`).

---

## 1. Архитектурные принципы и границы

1. **Гибрид проектов**: берется основа текущего Next.js проекта `apps/demo` (React 19, Tailwind CSS, Radix UI, Lucide/Tabler icons, Zustand), в которую интегрируются дизайн-паттерны и разделы из `syntx.pdf`.
2. **Только 3 основных рабочих раздела**:
   - **«Видео»**: длительность, формат/соотношение, качество, звук, модели (Flux 3 video, Grok Imagine, Runway, Minimax, Luma, HeyGen, Kling, Seedance).
   - **«Изображения»**: модели (Nano Banana / Gemini Flash Image Preview, GPT Image, Seedream, Flux, Recraft), соотношения сторон, 1K/2K/4K, Image-to-Image.
   - **«Аудио»**: ElevenLabs (TTS + каталог голосов), Suno (создание музыки: простой / свой режим с пресетами стилей и текстом песен), Видео в аудио.
3. **Разделы вне списка** («Тренды», «Агенты», «LLM-студия», «Редактор»): заглушка `InDevelopment` с красивым оформлением.
4. **Валюта и расчеты**: строго в **рублях (₽)**. Перед запуском отображается расчетная цена (например, `18.20 ₽`), после генерации — фактическая из `usage.cost` RouterAI.
5. **API-ключ**: `ROUTERAI_API_KEY` берется из переменной окружения `process.env.ROUTERAI_API_KEY`.

---

## 2. Разделение зон ответственности (Workstreams)

```
apps/demo/
├── lib/
│   ├── routerai/               <-- [AGENT 1: Backend & RouterAI Service]
│   └── store/syntx-store.ts    <-- [AGENT 2: Shared Store Slice / Video]
├── app/api/syntx/              <-- [AGENT 1: Backend & RouterAI Service]
├── components/syntx/
│   ├── video/                  <-- [AGENT 2: Video Studio]
│   ├── image/                  <-- [AGENT 3: Image Studio]
│   ├── audio/                  <-- [AGENT 3: Audio Studio (ElevenLabs + Suno)]
│   └── shell/                  <-- [AGENT 4: Shell, Navigation, Prompt Bar, InDev]
├── app/page.tsx                <-- [AGENT 4: App Mounting]
└── app/globals.css             <-- [AGENT 4: Syntx Styling]
```

---

## 3. Спецификации для агентов

### Агент 1: Backend & RouterAI Service

**Зона ответственности**: серверный слой взаимодействия с RouterAI API.

**Файлы**:

- `apps/demo/lib/routerai/client.ts`
- `apps/demo/lib/routerai/models-catalog.ts`
- `apps/demo/app/api/syntx/generate/route.ts`
- `apps/demo/app/api/syntx/videos/[id]/route.ts`
- `apps/demo/app/api/syntx/models/route.ts`
- `apps/demo/app/api/syntx/files/route.ts`

**Задачи**:

1. Реализовать `RouterAIClient`:
   - `generateVideo({ model, prompt, aspect_ratio, duration, resolution, generate_audio, frame_images, input_references })` -> `POST https://routerai.ru/api/v1/videos`
   - `getVideoStatus(id)` -> `GET https://routerai.ru/api/v1/videos/{id}`
   - `generateImage({ model, prompt, aspect_ratio, resolution, quality, n, input_references })` -> `POST https://routerai.ru/api/v1/images` (для нативных моделей) и `POST /chat/completions` с `modalities: ["image", "text"]` для Nano Banana / Gemini.
   - `generateSpeech({ model, input, voice, response_format })` -> `POST https://routerai.ru/api/v1/audio/speech`
   - `uploadFile(formData)` -> `POST https://routerai.ru/api/v1/files`
2. Сформировать `models-catalog.ts` с актуальными ценами в рублях (₽):
   - Видео-модели (Seedance, Grok Imagine, Runway, Kling, Minimax, Luma, HeyGen, Flux).
   - Графические модели (Nano Banana, GPT Image, Seedream, Flux, Recraft).
   - Аудио-модели (ElevenLabs, Suno, Grok Voice, Voxtral).
3. Создать роуты Next.js с обработкой ошибок и возвратом `usage.cost` в рублях.

---

### Агент 2: Video Studio Feature & Store

**Зона ответственности**: состояние приложения и раздел генерации видео.

**Файлы**:

- `apps/demo/lib/store/syntx-store.ts`
- `apps/demo/components/syntx/video/video-settings.tsx`
- `apps/demo/components/syntx/video/video-player.tsx`
- `apps/demo/components/syntx/video/video-card.tsx`

**Задачи**:

1. Разработать единый Zustand-стор (`syntx-store.ts`):
   - `activeTab`: `"video" | "image" | "audio" | "llm" | "trends" | "editor" | "agents"`
   - `videoSettings`: `{ modelId, subMode, aspectRatio, resolution, duration, generateAudio, seed, negativePrompt }`
   - `imageSettings`: `{ modelId, subMode, aspectRatio, resolution, quality, n }`
   - `audioSettings`: `{ mode: "elevenlabs" | "suno" | "video2audio", voiceId, sunoMode: "simple" | "custom", songTitle, style, lyrics, instrumental }`
   - `history`: массив сообщений и результатов с ценой в ₽, статусом (`pending`, `completed`, `failed`), длительностью и датой.
   - `balanceRub`: числовой баланс в рублях (по умолчанию `1250.00 ₽`).
2. Разработать правую панель настроек видео (`video-settings.tsx`):
   - Выбор модели (Grok, Seedance, Runway, Hailuo Minimax, Luma, HeyGen, Kling, Flux).
   - Выбор режима (Текст в видео, Кадры/Keyframes, Продление).
   - Сетка соотношений сторон (`Auto`, `16:9`, `9:16`, `1:1`, `21:9`, `4:3`...) с кнопкой «Сбросить».
   - Разрешение (`HD`, `Full HD`, `2K`, `4K`).
   - Слайдер длительности (3, 4, 5, 10 сек).
   - Переключатель «Аудио».
3. Разработать адаптивный плеер видео (`video-player.tsx`) с контролами, таймкодом и скачиванием.

---

### Агент 3: Images & Audio (ElevenLabs + Suno) Features

**Зона ответственности**: раздел генерации картинок и звука/музыки.

**Файлы**:

- `apps/demo/components/syntx/image/image-settings.tsx`
- `apps/demo/components/syntx/image/image-card.tsx`
- `apps/demo/components/syntx/audio/audio-settings.tsx`
- `apps/demo/components/syntx/audio/audio-player.tsx`
- `apps/demo/components/syntx/audio/audio-card.tsx`
- `apps/demo/components/syntx/audio/voice-selector-modal.tsx`

**Задачи**:

1. Раздел «Изображения»:
   - Панель настроек: модели (Nano Banana 2 / Gemini, GPT Image, Seedream, Flux, Recraft), форматы (1:1, 16:9, 9:16, 3:2, 2:3, 4:3, 1:2...), разрешения 1K/2K/4K, качество, формат вывода (PNG, JPEG, WebP, SVG).
   - Карточка результата с зумом, скачиванием и баннером восстановления параметров.
2. Раздел «Аудио»:
   - **ElevenLabs**: выбор версии модели, переключатель «Текст в речь» / «Смена голоса», каталог голосов (`voice-selector-modal.tsx`) с фильтрами по имени, возрасту, акценту и аудиоплеером для сэмплов.
   - **Suno**: переключатель «Простой» / «Свой», ввод названия песни (до 80 симв.), стиль музыки с пресетами-чипами (Rock, Pop, Synthwave, Lo-Fi, Orchestral, Hip-hop), исключенные стили, текст песни и тумблер «Инструментал».
   - **Видео в аудио**: область загрузки видеоролика до 20 сек.
3. Аудиоплеер для озвучки и музыки с таймлайном, регулятором громкости и кнопкой скачивания MP3.

---

### Агент 4: Shell, Navigation, Prompt Bar & Polish

**Зона ответственности**: общая раскладка, шапка, левый сайдбар, нижний бар ввода и заглушки.

**Файлы**:

- `apps/demo/components/syntx/shell/syntx-shell.tsx`
- `apps/demo/components/syntx/shell/syntx-header.tsx`
- `apps/demo/components/syntx/shell/syntx-sidebar.tsx`
- `apps/demo/components/syntx/shell/syntx-prompt-bar.tsx`
- `apps/demo/components/syntx/shell/in-development.tsx`
- `apps/demo/app/page.tsx`
- `apps/demo/app/globals.css`

**Задачи**:

1. Шапка (`syntx-header.tsx`):
   - Логотип `S≡`.
   - Табы: «Видео», «Изображения», «Аудио» (рабочие) и «Тренды», «Агенты», «LLM-студия», «Редактор» (со значком или заглушкой «В разработке»).
   - Индикатор баланса в рублях: чип с молнией `1 250.00 ₽`.
   - Переключатель светлой/темной темы, поиск, уведомления, профиль.
2. Левый сайдбар (`syntx-sidebar.tsx`):
   - Табы «Чаты» и «Проекты».
   - Поиск по чатам с кнопкой очистки.
   - Кнопка «+ Новый чат» и Избранное `★`.
   - Группа истории «Ранее» с контекстными меню (удалить, переименовать).
3. Нижний бар промпта (`syntx-prompt-bar.tsx`):
   - Многострочный textarea.
   - Быстрые чипы параметров слева (`Auto`, `HD`, `5.0s`, `1:1`).
   - Иконка скрепки для загрузки референсов.
   - Счетчик символов (`0 / 5000`).
   - Кнопка генерации с динамической расчетной ценой в рублях (например, `18.20 ₽`).
4. Компонент `in-development.tsx`:
   - Красивая заглушка для вкладок «Тренды», «Агенты», «LLM-студия», «Редактор».
5. Стилизация в `globals.css`:
   - Шрифты, акцентные коралловые цвета `#f05138` / `#e24a33`, гладкие скругления и тени.

---

## 4. Контракты интерфейсов (Shared Types)

```typescript
// Shared Types for all Agents

export type SyntxTab =
  "video" | "image" | "audio" | "llm" | "trends" | "editor" | "agents";

export interface GenerationItem {
  id: string;
  tab: "video" | "image" | "audio";
  modelId: string;
  prompt: string;
  createdAt: string;
  status: "pending" | "completed" | "failed";
  costRub: number;
  outputUrls: string[]; // mp4, png/jpg/svg, mp3
  metadata?: {
    durationSeconds?: number;
    resolution?: string;
    aspectRatio?: string;
    audioVoice?: string;
    sunoTitle?: string;
    sunoStyle?: string;
    error?: string;
  };
}

export interface ModelMetadata {
  id: string;
  name: string;
  provider: string;
  category: "video" | "image" | "audio" | "llm";
  basePriceRub: number;
  priceUnit: "request" | "second" | "image" | "token";
  supportedAspectRatios?: string[];
  supportedResolutions?: string[];
  supportedDurations?: number[];
  supportsAudio?: boolean;
}
```

---

## 5. Порядок и правила параллельного выполнения

1. **Изоляция**: Агенты работают строго со своими файлами согласно разделу 2.
2. **Отсутствие циклов**: Агенты 2, 3 и 4 импортируют общие типы и функции клиента, созданные Агентом 1.
3. **Верификация**: Каждый агент проверяет отсутствие ошибок компиляции TypeScript (`tsc --noEmit`).
