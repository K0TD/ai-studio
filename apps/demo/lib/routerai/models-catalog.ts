import type { ModelFamily, ModelMetadata } from "./types";

// ============================================================================
// 1. ВИДЕО-МОДЕЛИ (Семейства и модификации)
// ============================================================================

export const VIDEO_FAMILIES: ModelFamily[] = [
  {
    badge: "Хит 2025",
    category: "video",
    defaultModelId: "alibaba/wan-3.0-prime",
    description:
      "Семейство кинематографических видео-моделей Wan от Alibaba. Исключительная реалистичность физики, высокая динамика и детальный рендеринг человека и окружения.",
    id: "wan",
    models: [
      {
        badge: "Флагман",
        basePriceRub: 6.5,
        category: "video",
        description:
          "Флагман Alibaba Wan 3.0 Prime: максимальная кинематографичность, естественное движение камеры и реалистичная анатомия. 6.50 ₽/сек.",
        familyId: "wan",
        familyName: "Wan",
        id: "alibaba/wan-3.0-prime",
        name: "Wan 3.0 Prime",
        priceUnit: "second",
        provider: "Alibaba",
        subModes: [
          { id: "text2video", name: "Text to Video" },
          { id: "img2video", name: "Image to Video" },
          { id: "keyframes", name: "Keyframes" },
        ],
        supportedAspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
        supportedDurations: [3, 5, 8, 10],
        supportedResolutions: ["480p", "720p", "1080p"],
        supportsAudio: false,
      },
      {
        badge: "Базовая",
        basePriceRub: 4.25,
        category: "video",
        description:
          "Базовая версия Wan 3.0 нового поколения: баланс высочайшего качества и доступного тарифа. 4.25 ₽/сек.",
        familyId: "wan",
        familyName: "Wan",
        id: "alibaba/wan-3.0",
        name: "Wan 3.0",
        priceUnit: "second",
        provider: "Alibaba",
        subModes: [
          { id: "text2video", name: "Text to Video" },
          { id: "img2video", name: "Image to Video" },
        ],
        supportedAspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
        supportedDurations: [3, 5, 8],
        supportedResolutions: ["480p", "720p", "1080p"],
        supportsAudio: false,
      },
      {
        basePriceRub: 8.5,
        category: "video",
        description:
          "Стабильная Pro-версия Wan 2.7 со строгим сохранением композиции и консистентности объектов. 8.50 ₽/сек.",
        familyId: "wan",
        familyName: "Wan",
        id: "alibaba/wan-2.7",
        name: "Wan 2.7 Pro",
        priceUnit: "second",
        provider: "Alibaba",
        subModes: [
          { id: "text2video", name: "Text to Video" },
          { id: "img2video", name: "Image to Video" },
        ],
        supportedAspectRatios: ["16:9", "9:16", "1:1"],
        supportedDurations: [5, 10],
        supportedResolutions: ["720p", "1080p"],
        supportsAudio: false,
      },
      {
        basePriceRub: 5.5,
        category: "video",
        description:
          "Проверенная версия Wan 2.6 для рекламных роликов и контента соцсетей. 5.50 ₽/сек.",
        familyId: "wan",
        familyName: "Wan",
        id: "alibaba/wan-2.6",
        name: "Wan 2.6",
        priceUnit: "second",
        provider: "Alibaba",
        subModes: [
          { id: "text2video", name: "Text to Video" },
          { id: "img2video", name: "Image to Video" },
        ],
        supportedAspectRatios: ["16:9", "9:16", "1:1"],
        supportedDurations: [5, 10],
        supportedResolutions: ["480p", "720p"],
        supportsAudio: false,
      },
      {
        badge: "Быстрая",
        basePriceRub: 3.8,
        category: "video",
        description:
          "Турбо-генерация на базе Wan 2.1 с минимальным временем ожидания очереди. 3.80 ₽/сек.",
        familyId: "wan",
        familyName: "Wan",
        id: "alibaba/wan-2.1",
        name: "Wan 2.1 Turbo",
        priceUnit: "second",
        provider: "Alibaba",
        subModes: [
          { id: "text2video", name: "Text to Video" },
          { id: "img2video", name: "Image to Video" },
        ],
        supportedAspectRatios: ["16:9", "9:16", "1:1"],
        supportedDurations: [3, 5],
        supportedResolutions: ["480p", "720p"],
        supportsAudio: false,
      },
    ],
    name: "Wan",
    provider: "Alibaba",
  },
  {
    badge: "Звук",
    category: "video",
    defaultModelId: "black-forest-labs/flux-3-video",
    description:
      "Флагманская видео-модель с фотореалистичной физикой, поддержкой нативного звука и детализацией до 4K.",
    id: "flux-video",
    models: [
      {
        badge: "Топ качество",
        basePriceRub: 18.12,
        category: "video",
        description:
          "Передовая модель FLUX 3 с фотореалистичной физикой, поддержкой нативного звука и высокой детализацией. 18.12 ₽/сек.",
        familyId: "flux-video",
        familyName: "FLUX Video",
        id: "black-forest-labs/flux-3-video",
        name: "FLUX 3 Video",
        priceUnit: "second",
        provider: "Black Forest Labs",
        subModes: [
          { id: "text2video", name: "FLUX 3" },
          { id: "keyframes", name: "Keyframes" },
          { id: "continue", name: "Продление" },
        ],
        supportedAspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
        supportedDurations: [5, 8, 10],
        supportedResolutions: ["720p", "1080p", "2K", "4K"],
        supportsAudio: true,
      },
      {
        badge: "Скорость",
        basePriceRub: 12.5,
        category: "video",
        description:
          "Ускоренная версия FLUX 3 с нативным звуком по сниженному тарифу. 12.50 ₽/сек.",
        familyId: "flux-video",
        familyName: "FLUX Video",
        id: "black-forest-labs/flux-3-video-turbo",
        name: "FLUX 3 Turbo",
        priceUnit: "second",
        provider: "Black Forest Labs",
        subModes: [
          { id: "text2video", name: "FLUX 3 Turbo" },
          { id: "img2video", name: "Image to Video" },
        ],
        supportedAspectRatios: ["16:9", "9:16", "1:1"],
        supportedDurations: [5, 8],
        supportedResolutions: ["720p", "1080p"],
        supportsAudio: true,
      },
    ],
    name: "FLUX Video",
    provider: "Black Forest Labs",
  },
  {
    category: "video",
    defaultModelId: "x-ai/grok-imagine-video-1.5",
    description:
      "Генерация кинематографичных видео от xAI с реалистичной динамикой сцен, кинематографическим освещением и естественной глубиной.",
    id: "grok-imagine",
    models: [
      {
        badge: "Рекомендуем",
        basePriceRub: 8.525,
        category: "video",
        description:
          "Генерация кинематографичных видео от xAI с реалистичной динамикой сцен. Тариф RouterAI — 8.53 ₽/сек.",
        familyId: "grok-imagine",
        familyName: "Grok Imagine",
        id: "x-ai/grok-imagine-video-1.5",
        name: "Grok Imagine 1.5",
        priceUnit: "second",
        provider: "xAI",
        subModes: [
          { id: "text2video", name: "Text to Video" },
          { id: "img2video", name: "Image to Video" },
        ],
        supportedAspectRatios: [
          "16:9",
          "9:16",
          "1:1",
          "4:3",
          "3:4",
          "3:2",
          "2:3",
        ],
        supportedDurations: [4, 5, 8],
        supportedResolutions: ["480p", "720p"],
        supportsAudio: false,
      },
      {
        badge: "Эконом",
        basePriceRub: 2.13,
        category: "video",
        description:
          "Сверхбыстрая и доступная версия Grok Imagine для быстрых концептов и тестов. 2.13 ₽/сек.",
        familyId: "grok-imagine",
        familyName: "Grok Imagine",
        id: "x-ai/grok-imagine-video-1.5-lite",
        name: "Grok Imagine 1.5 Lite",
        priceUnit: "second",
        provider: "xAI",
        subModes: [{ id: "text2video", name: "Text to Video" }],
        supportedAspectRatios: ["16:9", "9:16", "1:1"],
        supportedDurations: [4, 5],
        supportedResolutions: ["480p", "720p"],
        supportsAudio: false,
      },
      {
        basePriceRub: 8.5,
        category: "video",
        description: "Первое поколение видеогенерации от xAI. 8.50 ₽/сек.",
        familyId: "grok-imagine",
        familyName: "Grok Imagine",
        id: "x-ai/grok-imagine-video",
        name: "Grok Imagine 1.0",
        priceUnit: "second",
        provider: "xAI",
        subModes: [{ id: "text2video", name: "Text to Video" }],
        supportedAspectRatios: ["16:9", "9:16", "1:1"],
        supportedDurations: [4, 5],
        supportedResolutions: ["480p", "720p"],
        supportsAudio: false,
      },
    ],
    name: "Grok Imagine",
    provider: "xAI",
  },
  {
    badge: "Кино",
    category: "video",
    defaultModelId: "runway/gen-4.5",
    description:
      "Промышленный стандарт видеогенерации для кино, рекламы и спецэффектов.",
    id: "runway",
    models: [
      {
        badge: "Новинка",
        basePriceRub: 12.79,
        category: "video",
        description:
          "Флагман Runway Gen-4.5: профессиональный контроль сцены и голливудская постобработка. 12.79 ₽/сек.",
        familyId: "runway",
        familyName: "Runway",
        id: "runway/gen-4.5",
        name: "Gen-4.5",
        priceUnit: "second",
        provider: "Runway",
        subModes: [
          { id: "text2video", name: "Gen-4.5" },
          { id: "img2video", name: "Image to Video" },
        ],
        supportedAspectRatios: ["16:9", "9:16"],
        supportedDurations: [5, 10],
        supportedResolutions: ["720p", "1080p"],
        supportsAudio: false,
      },
      {
        basePriceRub: 10.6,
        category: "video",
        description:
          "Популярный стандарт Runway Gen-3 Alpha для видеопродакшна. 10.60 ₽/сек.",
        familyId: "runway",
        familyName: "Runway",
        id: "runway/gen-3-alpha",
        name: "Gen-3 Alpha",
        priceUnit: "second",
        provider: "Runway",
        subModes: [{ id: "text2video", name: "Gen-3 Alpha" }],
        supportedAspectRatios: ["16:9", "9:16"],
        supportedDurations: [5, 10],
        supportedResolutions: ["720p"],
        supportsAudio: false,
      },
      {
        badge: "Быстрая",
        basePriceRub: 5.33,
        category: "video",
        description:
          "Быстрый рендеринг Runway Gen-3 со скидкой 50%. 5.33 ₽/сек.",
        familyId: "runway",
        familyName: "Runway",
        id: "runway/gen-3-alpha-turbo",
        name: "Gen-3 Turbo",
        priceUnit: "second",
        provider: "Runway",
        subModes: [{ id: "text2video", name: "Gen-3 Turbo" }],
        supportedAspectRatios: ["16:9", "9:16"],
        supportedDurations: [5, 10],
        supportedResolutions: ["720p"],
        supportsAudio: false,
      },
    ],
    name: "Runway",
    provider: "Runway",
  },
  {
    badge: "Звук",
    category: "video",
    defaultModelId: "minimax/hailuo-3-max",
    description:
      "Флагманские модели MiniMax с выдающейся реалистичностью персонажей, плавностью движений и нативной поддержкой звука.",
    id: "minimax-hailuo",
    models: [
      {
        badge: "Флагман",
        basePriceRub: 8.53,
        category: "video",
        description:
          "Флагманская модель MiniMax H3 Max: высочайшая плавность движений человека, мимики и нативный звук. 8.53 ₽/сек.",
        familyId: "minimax-hailuo",
        familyName: "Hailuo Minimax",
        id: "minimax/hailuo-3-max",
        name: "Hailuo 3 Max",
        priceUnit: "second",
        provider: "MiniMax",
        subModes: [
          { id: "text2video", name: "Text to Video" },
          { id: "keyframes", name: "Keyframes (First/Last)" },
        ],
        supportedAspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
        supportedDurations: [5, 8, 10],
        supportedResolutions: ["720p", "1080p", "2K"],
        supportsAudio: true,
      },
      {
        basePriceRub: 6.4,
        category: "video",
        description:
          "Стандартная версия Hailuo 3 для повседневных задач со звуком. 6.40 ₽/сек.",
        familyId: "minimax-hailuo",
        familyName: "Hailuo Minimax",
        id: "minimax/hailuo-3",
        name: "Hailuo 3 Standard",
        priceUnit: "second",
        provider: "MiniMax",
        subModes: [{ id: "text2video", name: "Text to Video" }],
        supportedAspectRatios: ["16:9", "9:16", "1:1"],
        supportedDurations: [5, 8],
        supportedResolutions: ["720p", "1080p"],
        supportsAudio: true,
      },
      {
        badge: "Эконом",
        basePriceRub: 4.8,
        category: "video",
        description:
          "Первая коммерческая версия MiniMax Video-01 по доступной цене. 4.80 ₽/сек.",
        familyId: "minimax-hailuo",
        familyName: "Hailuo Minimax",
        id: "minimax/video-01-live",
        name: "MiniMax Video-01",
        priceUnit: "second",
        provider: "MiniMax",
        subModes: [{ id: "text2video", name: "Text to Video" }],
        supportedAspectRatios: ["16:9", "9:16"],
        supportedDurations: [5],
        supportedResolutions: ["720p"],
        supportsAudio: false,
      },
    ],
    name: "Hailuo Minimax",
    provider: "MiniMax",
  },
  {
    badge: "4K & Звук",
    category: "video",
    defaultModelId: "google/veo-3.1-fast",
    description:
      "Передовая видео-нейросеть от Google DeepMind с поддержкой 4K, нативным звуком и точным контролем физики.",
    id: "google-veo",
    models: [
      {
        badge: "Рекомендуем",
        basePriceRub: 10.66,
        category: "video",
        description:
          "Быстрая версия Veo 3.1 с нативным звуком, поддержкой кадров и разрешением до 4K. 10.66 ₽/сек.",
        familyId: "google-veo",
        familyName: "Google Veo",
        id: "google/veo-3.1-fast",
        name: "Veo 3.1 Fast",
        priceUnit: "second",
        provider: "Google",
        subModes: [
          { id: "text2video", name: "Text to Video" },
          { id: "img2video", name: "Image to Video" },
        ],
        supportedAspectRatios: ["16:9", "9:16"],
        supportedDurations: [4, 6, 8],
        supportedResolutions: ["720p", "1080p", "4K"],
        supportsAudio: true,
      },
      {
        badge: "Быстрая",
        basePriceRub: 5.33,
        category: "video",
        description: "Облегченная версия Veo 3.1 со звуком по цене 5.33 ₽/сек.",
        familyId: "google-veo",
        familyName: "Google Veo",
        id: "google/veo-3.1-lite",
        name: "Veo 3.1 Lite",
        priceUnit: "second",
        provider: "Google",
        subModes: [{ id: "text2video", name: "Text to Video" }],
        supportedAspectRatios: ["16:9", "9:16"],
        supportedDurations: [4, 6],
        supportedResolutions: ["720p"],
        supportsAudio: true,
      },
      {
        basePriceRub: 8.5,
        category: "video",
        description: "Предыдущее поколение Google Veo 2.0. 8.50 ₽/сек.",
        familyId: "google-veo",
        familyName: "Google Veo",
        id: "google/veo-2.0",
        name: "Veo 2.0",
        priceUnit: "second",
        provider: "Google",
        subModes: [{ id: "text2video", name: "Text to Video" }],
        supportedAspectRatios: ["16:9", "9:16"],
        supportedDurations: [5],
        supportedResolutions: ["720p", "1080p"],
        supportsAudio: false,
      },
    ],
    name: "Google Veo",
    provider: "Google",
  },
  {
    badge: "Анатомия",
    category: "video",
    defaultModelId: "kwaivgi/kling-v3.0-pro",
    description:
      "Азиатский лидер генерации видео: реалистичные ткани, текучие жидкости, волосы и сложная анатомия.",
    id: "kling",
    models: [
      {
        badge: "Pro",
        basePriceRub: 17.9,
        category: "video",
        description:
          "Флагман Kling 3.0 Pro: исключительная точность физики, анатомии и звукового ряда. 17.90 ₽/сек.",
        familyId: "kling",
        familyName: "Kling",
        id: "kwaivgi/kling-v3.0-pro",
        name: "Kling 3.0 Pro",
        priceUnit: "second",
        provider: "Kuaishou",
        subModes: [
          { id: "kling-3-pro", name: "Kling 3.0 Pro" },
          { id: "img2video", name: "Image to Video" },
        ],
        supportedAspectRatios: ["16:9", "9:16", "1:1"],
        supportedDurations: [5, 10],
        supportedResolutions: ["720p", "1080p"],
        supportsAudio: true,
      },
      {
        basePriceRub: 12.2,
        category: "video",
        description:
          "Стандартная версия Kling 3.0 для регулярных проектов. 12.20 ₽/сек.",
        familyId: "kling",
        familyName: "Kling",
        id: "kwaivgi/kling-v3.0-std",
        name: "Kling 3.0 Standard",
        priceUnit: "second",
        provider: "Kuaishou",
        subModes: [{ id: "kling-3-std", name: "Kling 3.0 Standard" }],
        supportedAspectRatios: ["16:9", "9:16", "1:1"],
        supportedDurations: [5, 10],
        supportedResolutions: ["720p"],
        supportsAudio: true,
      },
      {
        basePriceRub: 14.5,
        category: "video",
        description: "Проверенная временем версия Kling 2.6 Pro. 14.50 ₽/сек.",
        familyId: "kling",
        familyName: "Kling",
        id: "kwaivgi/kling-v2.6-pro",
        name: "Kling 2.6 Pro",
        priceUnit: "second",
        provider: "Kuaishou",
        subModes: [{ id: "text2video", name: "Text to Video" }],
        supportedAspectRatios: ["16:9", "9:16"],
        supportedDurations: [5],
        supportedResolutions: ["720p"],
        supportsAudio: false,
      },
      {
        badge: "Эконом",
        basePriceRub: 8.9,
        category: "video",
        description: "Доступная версия Kling 1.6 Pro. 8.90 ₽/сек.",
        familyId: "kling",
        familyName: "Kling",
        id: "kwaivgi/kling-v1.6-pro",
        name: "Kling 1.6 Pro",
        priceUnit: "second",
        provider: "Kuaishou",
        subModes: [{ id: "text2video", name: "Text to Video" }],
        supportedAspectRatios: ["16:9", "9:16"],
        supportedDurations: [5],
        supportedResolutions: ["720p"],
        supportsAudio: false,
      },
    ],
    name: "Kling",
    provider: "Kuaishou",
  },
  {
    badge: "TikTok AI",
    category: "video",
    defaultModelId: "bytedance/seedance-2.5",
    description:
      "Экспрессивная генерация видео от создателей TikTok с поддержкой нативного аудио и разрешением до 4K.",
    id: "seedance",
    models: [
      {
        badge: "Флагман",
        basePriceRub: 18.5,
        category: "video",
        description:
          "Новейшая модель ByteDance Seedance 2.5 Pro со звуком и разрешением до 4K. 18.50 ₽/сек.",
        familyId: "seedance",
        familyName: "Seedance",
        id: "bytedance/seedance-2.5",
        name: "Seedance 2.5 Pro",
        priceUnit: "second",
        provider: "ByteDance",
        subModes: [
          { id: "seedance-2.5", name: "Seedance 2.5 Pro" },
          { id: "img2video", name: "Image to Video" },
        ],
        supportedAspectRatios: ["1:1", "3:4", "9:16", "4:3", "16:9", "21:9"],
        supportedDurations: [4, 5, 8, 10],
        supportedResolutions: ["720p", "1080p", "4K"],
        supportsAudio: true,
      },
      {
        basePriceRub: 16.11,
        category: "video",
        description:
          "Стабильная версия Seedance 2.0 с динамичными движениями. 16.11 ₽/сек.",
        familyId: "seedance",
        familyName: "Seedance",
        id: "bytedance/seedance-2.0",
        name: "Seedance 2.0",
        priceUnit: "second",
        provider: "ByteDance",
        subModes: [{ id: "seedance-2.0", name: "Seedance 2.0" }],
        supportedAspectRatios: ["1:1", "3:4", "9:16", "4:3", "16:9"],
        supportedDurations: [4, 5, 8],
        supportedResolutions: ["480p", "720p", "1080p"],
        supportsAudio: true,
      },
      {
        badge: "Суперцена",
        basePriceRub: 1.28,
        category: "video",
        description:
          "Самый экономичный видео-генератор в каталоге — всего 1.28 ₽/сек.",
        familyId: "seedance",
        familyName: "Seedance",
        id: "bytedance/seedance-1.5-pro",
        name: "Seedance 1.5 Lite",
        priceUnit: "second",
        provider: "ByteDance",
        subModes: [{ id: "text2video", name: "Text to Video" }],
        supportedAspectRatios: ["9:16", "16:9", "1:1"],
        supportedDurations: [4, 5],
        supportedResolutions: ["480p", "720p"],
        supportsAudio: false,
      },
    ],
    name: "Seedance",
    provider: "ByteDance",
  },
  {
    badge: "Аватары",
    category: "video",
    defaultModelId: "heygen/avatar-iv",
    description:
      "Анимация цифровых аватаров и синхронизация губ (LipSync) под русскую и международную речь.",
    id: "heygen",
    models: [
      {
        badge: "Аватар",
        basePriceRub: 5.33,
        category: "video",
        description:
          "Оживление портретов и говорящие ведущие с естественной артикуляцией. 5.33 ₽/сек.",
        familyId: "heygen",
        familyName: "HeyGen",
        id: "heygen/avatar-iv",
        name: "Avatar IV",
        priceUnit: "second",
        provider: "HeyGen",
        subModes: [{ id: "avatar", name: "Avatar IV" }],
        supportedAspectRatios: ["16:9", "9:16", "1:1"],
        supportedDurations: [5, 10],
        supportedResolutions: ["720p", "1080p"],
        supportsAudio: true,
      },
      {
        badge: "LipSync",
        basePriceRub: 2.13,
        category: "video",
        description:
          "Синхронизация губ под готовую аудиодорожку или текст. 2.13 ₽/сек.",
        familyId: "heygen",
        familyName: "HeyGen",
        id: "heygen/lipsync-express",
        name: "LipSync Express",
        priceUnit: "second",
        provider: "HeyGen",
        subModes: [{ id: "lipsync", name: "LipSync Express" }],
        supportedAspectRatios: ["16:9", "9:16"],
        supportedDurations: [5, 10],
        supportedResolutions: ["720p"],
        supportsAudio: true,
      },
    ],
    name: "HeyGen",
    provider: "HeyGen",
  },
  {
    category: "video",
    defaultModelId: "luma/ray-2",
    description:
      "Генератор реалистичных видеороликов от Luma AI с плавными переходами камеры и физикой света.",
    id: "luma",
    models: [
      {
        badge: "Новинка",
        basePriceRub: 13.5,
        category: "video",
        description:
          "Новейшая модель Luma Ray 2 с кинематографическим фокусом и глубиной резкости. 13.50 ₽/сек.",
        familyId: "luma",
        familyName: "Luma Dream Machine",
        id: "luma/ray-2",
        name: "Luma Ray 2",
        priceUnit: "second",
        provider: "Luma",
        subModes: [
          { id: "text2video", name: "Ray 2" },
          { id: "img2video", name: "Image to Video" },
        ],
        supportedAspectRatios: ["16:9", "9:16"],
        supportedDurations: [5],
        supportedResolutions: ["720p", "1080p"],
        supportsAudio: false,
      },
      {
        basePriceRub: 9.6,
        category: "video",
        description: "Классическая модель Luma Dream Machine 1.5. 9.60 ₽/сек.",
        familyId: "luma",
        familyName: "Luma Dream Machine",
        id: "luma/dream-machine",
        name: "Dream Machine 1.5",
        priceUnit: "second",
        provider: "Luma",
        subModes: [{ id: "text2video", name: "Dream Machine" }],
        supportedAspectRatios: ["16:9", "9:16"],
        supportedDurations: [5],
        supportedResolutions: ["720p"],
        supportsAudio: false,
      },
    ],
    name: "Luma Dream Machine",
    provider: "Luma",
  },
];

// Плоский список всех видео-моделей для обратной совместимости
export const VIDEO_MODELS: ModelMetadata[] = VIDEO_FAMILIES.flatMap(
  (f) => f.models
);

// ============================================================================
// 2. ГРАФИЧЕСКИЕ МОДЕЛИ (Изображения)
// ============================================================================

export const IMAGE_FAMILIES: ModelFamily[] = [
  {
    badge: "Быстрая",
    category: "image",
    defaultModelId: "google/gemini-3.1-flash-image-preview",
    description:
      "Быстрая мультимодальная графика от Google с великолепным пониманием контекста и надписей.",
    id: "google-image",
    models: [
      {
        badge: "Топ скорость",
        basePriceRub: 4.2,
        category: "image",
        description:
          "Сверхбыстрая генерация от Google (Nano Banana 2) с пониманием текста на картинке. 4.20 ₽.",
        familyId: "google-image",
        familyName: "Google",
        id: "google/gemini-3.1-flash-image-preview",
        name: "Nano Banana 2 (Gemini Preview)",
        priceUnit: "image",
        provider: "Google",
        subModes: [
          { id: "flash-image", name: "Gemini Flash Image" },
          { id: "img2img", name: "Image to Image" },
        ],
        supportedAspectRatios: [
          "1:1",
          "1:4",
          "1:8",
          "2:3",
          "3:2",
          "3:4",
          "4:1",
          "4:3",
          "4:5",
          "5:4",
          "8:1",
          "9:16",
          "16:9",
          "21:9",
        ],
        supportedResolutions: ["512", "1K", "2K", "4K"],
      },
      {
        badge: "Фотореализм",
        basePriceRub: 4.5,
        category: "image",
        description:
          "Флагманский фотореализм и студийный свет от Google Imagen 3. 4.50 ₽.",
        familyId: "google-image",
        familyName: "Google",
        id: "google/imagen-3",
        name: "Google Imagen 3",
        priceUnit: "image",
        provider: "Google",
        subModes: [{ id: "text2img", name: "Text to Image" }],
        supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
        supportedResolutions: ["1K", "2K"],
      },
    ],
    name: "Google (Nano Banana & Imagen)",
    provider: "Google",
  },
  {
    badge: "OpenAI",
    category: "image",
    defaultModelId: "openai/gpt-image-1",
    description:
      "Интеллектуальная генерация от OpenAI с предельной точностью следования сложным текстовым инструкциям.",
    id: "openai-image",
    models: [
      {
        badge: "Рекомендуем",
        basePriceRub: 4.26,
        category: "image",
        description:
          "Флагманская графика от OpenAI с высокой точностью следования промпту. 4.26 ₽.",
        familyId: "openai-image",
        familyName: "OpenAI",
        id: "openai/gpt-image-1",
        name: "GPT Image 1.0",
        priceUnit: "image",
        provider: "OpenAI",
        subModes: [
          { id: "gpt-image-1", name: "GPT Image 1.0" },
          { id: "inpaint", name: "Inpaint & Edit" },
        ],
        supportedAspectRatios: ["1:1", "3:2", "2:3", "16:9", "9:16"],
        supportedResolutions: ["1K", "2K", "4K"],
      },
      {
        basePriceRub: 4.26,
        category: "image",
        description: "Классическая художественная модель DALL-E 3. 4.26 ₽.",
        familyId: "openai-image",
        familyName: "OpenAI",
        id: "openai/dall-e-3",
        name: "DALL-E 3",
        priceUnit: "image",
        provider: "OpenAI",
        subModes: [{ id: "dalle-3", name: "DALL-E 3 HD" }],
        supportedAspectRatios: ["1:1", "16:9", "9:16"],
        supportedResolutions: ["1K"],
      },
    ],
    name: "OpenAI (GPT Image & DALL-E)",
    provider: "OpenAI",
  },
  {
    badge: "Фотореализм",
    category: "image",
    defaultModelId: "black-forest-labs/flux-3-image",
    description:
      "Мировой эталон в фотореализме, анатомии человеческого тела и натуральном освещении.",
    id: "flux-image",
    models: [
      {
        badge: "Флагман",
        basePriceRub: 4.37,
        category: "image",
        description:
          "Флагман фотореализма, анатомии рук и передачи сложных текстур. 4.37 ₽.",
        familyId: "flux-image",
        familyName: "FLUX Image",
        id: "black-forest-labs/flux-3-image",
        name: "FLUX 3 Image",
        priceUnit: "image",
        provider: "Black Forest Labs",
        subModes: [
          { id: "flux-3-image", name: "FLUX 3 Image" },
          { id: "flux-3-klein", name: "FLUX 3 Klein" },
        ],
        supportedAspectRatios: [
          "21:9",
          "16:9",
          "3:2",
          "4:3",
          "1:1",
          "3:4",
          "2:3",
          "9:16",
        ],
        supportedResolutions: ["1K", "2K", "4K"],
      },
      {
        badge: "Pro",
        basePriceRub: 5.33,
        category: "image",
        description:
          "Студийная версия FLUX 1.1 Pro с повышенным динамическим диапазоном. 5.33 ₽.",
        familyId: "flux-image",
        familyName: "FLUX Image",
        id: "black-forest-labs/flux-1.1-pro",
        name: "FLUX 1.1 Pro",
        priceUnit: "image",
        provider: "Black Forest Labs",
        subModes: [{ id: "flux-pro", name: "FLUX 1.1 Pro" }],
        supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
        supportedResolutions: ["1K", "2K"],
      },
      {
        badge: "1.07 ₽",
        basePriceRub: 1.07,
        category: "image",
        description:
          "Сверхбыстрый и дешевый FLUX всего за 1.07 ₽ за изображение.",
        familyId: "flux-image",
        familyName: "FLUX Image",
        id: "black-forest-labs/flux-1-schnell",
        name: "FLUX 1 Schnell",
        priceUnit: "image",
        provider: "Black Forest Labs",
        subModes: [{ id: "flux-schnell", name: "Schnell (4 шага)" }],
        supportedAspectRatios: ["1:1", "16:9", "9:16"],
        supportedResolutions: ["1K"],
      },
      {
        basePriceRub: 2.66,
        category: "image",
        description:
          "Открытая архитектура FLUX Dev для кастомных стилей. 2.66 ₽.",
        familyId: "flux-image",
        familyName: "FLUX Image",
        id: "black-forest-labs/flux-1-dev",
        name: "FLUX 1 Dev",
        priceUnit: "image",
        provider: "Black Forest Labs",
        subModes: [{ id: "flux-dev", name: "FLUX Dev" }],
        supportedAspectRatios: ["1:1", "16:9", "9:16"],
        supportedResolutions: ["1K"],
      },
    ],
    name: "FLUX Image",
    provider: "Black Forest Labs",
  },
  {
    badge: "Эстетика",
    category: "image",
    defaultModelId: "bytedance-seed/seedream-4.5",
    description:
      "Художественная эстетика, реалистичные портреты и высокое композиционное качество от ByteDance.",
    id: "bytedance-seedream",
    models: [
      {
        badge: "Новинка",
        basePriceRub: 4.26,
        category: "image",
        description:
          "Художественная эстетика, реалистичные портреты и высокое композиционное качество. 4.26 ₽.",
        familyId: "bytedance-seedream",
        familyName: "Seedream",
        id: "bytedance-seed/seedream-4.5",
        name: "Seedream 4.5",
        priceUnit: "image",
        provider: "ByteDance",
        subModes: [
          { id: "seedream-4.5", name: "Seedream 4.5" },
          { id: "pro", name: "Text to Image Pro" },
        ],
        supportedAspectRatios: [
          "1:1",
          "1:2",
          "2:1",
          "2:3",
          "3:2",
          "3:4",
          "4:3",
          "4:5",
          "5:4",
          "9:16",
          "16:9",
          "21:9",
        ],
        supportedResolutions: ["1K", "2K", "4K"],
      },
      {
        basePriceRub: 3.2,
        category: "image",
        description: "Быстрая стабильная версия Seedream 4.0. 3.20 ₽.",
        familyId: "bytedance-seedream",
        familyName: "Seedream",
        id: "bytedance-seed/seedream-4.0",
        name: "Seedream 4.0",
        priceUnit: "image",
        provider: "ByteDance",
        subModes: [{ id: "seedream-4.0", name: "Seedream 4.0" }],
        supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3"],
        supportedResolutions: ["1K", "2K"],
      },
    ],
    name: "Seedream",
    provider: "ByteDance",
  },
  {
    badge: "Вектор SVG",
    category: "image",
    defaultModelId: "recraft/recraft-v4-pro-vector",
    description:
      "Специализированная нейросеть для дизайнеров: генерация чистых SVG-векторов, иконок и детального растра.",
    id: "recraft-family",
    models: [
      {
        badge: "Вектор SVG",
        basePriceRub: 31.97,
        category: "image",
        description:
          "Премиальный векторный формат SVG: бесконечное масштабирование, чистые слои, иконки и иллюстрации. 31.97 ₽.",
        familyId: "recraft-family",
        familyName: "Recraft",
        id: "recraft/recraft-v4-pro-vector",
        name: "Recraft V4 Pro Vector (SVG)",
        priceUnit: "image",
        provider: "Recraft",
        subModes: [{ id: "vector", name: "Вектор (SVG)" }],
        supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
        supportedResolutions: ["1K", "2K"],
        vectorPriceRub: 31.97,
      },
      {
        badge: "Растр 2K",
        basePriceRub: 26.64,
        category: "image",
        description:
          "Дизайнерский растровый рендеринг высокого разрешения ~2K от Recraft. 26.64 ₽.",
        familyId: "recraft-family",
        familyName: "Recraft",
        id: "recraft/recraft-v4-pro",
        name: "Recraft V4 Pro Raster (~2K)",
        priceUnit: "image",
        provider: "Recraft",
        subModes: [{ id: "raster", name: "Растр 2K" }],
        supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
        supportedResolutions: ["1K", "2K"],
      },
      {
        basePriceRub: 8.53,
        category: "image",
        description:
          "Базовая векторная SVG-генерация по доступному тарифу. 8.53 ₽.",
        familyId: "recraft-family",
        familyName: "Recraft",
        id: "recraft/recraft-v4-vector",
        name: "Recraft V4 Vector",
        priceUnit: "image",
        provider: "Recraft",
        subModes: [{ id: "vector", name: "Вектор (SVG)" }],
        supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
        supportedResolutions: ["1K"],
        vectorPriceRub: 8.53,
      },
      {
        basePriceRub: 4.26,
        category: "image",
        description: "Быстрая растровая графика в разрешении ~1K. 4.26 ₽.",
        familyId: "recraft-family",
        familyName: "Recraft",
        id: "recraft/recraft-v3",
        name: "Recraft V3 (~1K)",
        priceUnit: "image",
        provider: "Recraft",
        subModes: [{ id: "raster", name: "Растр 1K" }],
        supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
        supportedResolutions: ["1K"],
      },
    ],
    name: "Recraft (Растр & Вектор SVG)",
    provider: "Recraft",
  },
  {
    badge: "10 референсов",
    category: "image",
    defaultModelId: "sourceful/riverflow-v2.5-pro",
    description:
      "Производственный конвейер генерации с поддержкой пользовательских шрифтов и до 10 референсов.",
    id: "riverflow",
    models: [
      {
        badge: "Студия",
        basePriceRub: 13.85,
        category: "image",
        description:
          "Riverflow V2.5 Pro: многоэтапные рассуждения, фирменные шрифты и сложное композирование. 13.85 ₽ (1K), 15.98 ₽ (2K), 18.12 ₽ (4K).",
        familyId: "riverflow",
        familyName: "Riverflow",
        id: "sourceful/riverflow-v2.5-pro",
        name: "Riverflow V2.5 Pro",
        priceUnit: "image",
        provider: "Sourceful",
        subModes: [
          { id: "text2img", name: "Text to Image" },
          { id: "multiref", name: "Мультиреференс (до 10)" },
        ],
        supportedAspectRatios: [
          "1:1",
          "4:3",
          "3:4",
          "3:2",
          "2:3",
          "16:9",
          "9:16",
          "21:9",
        ],
        supportedResolutions: ["1K", "2K", "4K"],
      },
    ],
    name: "Riverflow",
    provider: "Sourceful",
  },
  {
    badge: "Типографика",
    category: "image",
    defaultModelId: "stabilityai/stable-diffusion-3.5-large",
    description:
      "Популярные мировые модели для арта, иллюстраций и идеальной типографики.",
    id: "stability-ideogram",
    models: [
      {
        badge: "Флагман SD",
        basePriceRub: 4.26,
        category: "image",
        description:
          "Флагман Stability AI SD 3.5 Large с улучшенной композицией и деталями. 4.26 ₽.",
        familyId: "stability-ideogram",
        familyName: "Stable Diffusion",
        id: "stabilityai/stable-diffusion-3.5-large",
        name: "SD 3.5 Large",
        priceUnit: "image",
        provider: "Stability AI",
        subModes: [{ id: "text2img", name: "Text to Image" }],
        supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
        supportedResolutions: ["1K"],
      },
      {
        badge: "Быстрая",
        basePriceRub: 2.13,
        category: "image",
        description: "Скоростная модель SD 3.5 Turbo за 2.13 ₽.",
        familyId: "stability-ideogram",
        familyName: "Stable Diffusion",
        id: "stabilityai/stable-diffusion-3.5-turbo",
        name: "SD 3.5 Turbo",
        priceUnit: "image",
        provider: "Stability AI",
        subModes: [{ id: "text2img", name: "Turbo" }],
        supportedAspectRatios: ["1:1", "16:9", "9:16"],
        supportedResolutions: ["1K"],
      },
      {
        badge: "Текст в арте",
        basePriceRub: 8.53,
        category: "image",
        description:
          "Лучшая модель для создания постеров, логотипов и надписей внутри изображения. 8.53 ₽.",
        familyId: "stability-ideogram",
        familyName: "Ideogram",
        id: "ideogram/ideogram-v3",
        name: "Ideogram v3",
        priceUnit: "image",
        provider: "Ideogram",
        subModes: [{ id: "text2img", name: "Ideogram v3" }],
        supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
        supportedResolutions: ["1K", "2K"],
      },
    ],
    name: "Stable Diffusion & Ideogram",
    provider: "Open Source / Ideogram",
  },
];

// Плоский список всех моделей картинок для обратной совместимости
export const IMAGE_MODELS: ModelMetadata[] = IMAGE_FAMILIES.flatMap(
  (f) => f.models
);

// ============================================================================
// 3. АУДИО-МОДЕЛИ (Озвучка, Музыка, Эффекты)
// ============================================================================

export const AUDIO_FAMILIES: ModelFamily[] = [
  {
    badge: "Голоса",
    category: "audio",
    defaultModelId: "elevenlabs/eleven-multilingual-v2",
    description:
      "Эталон дикторской озвучки с естественными интонациями, эмоциями, дыханием и каталогом из сотен голосов.",
    id: "elevenlabs-family",
    models: [
      {
        badge: "Топ качество",
        basePriceRub: 2.5,
        category: "audio",
        description:
          "Реалистичная дикторская озвучка на русском и 29 языках с живыми интонациями. 2.50 ₽/запрос.",
        familyId: "elevenlabs-family",
        familyName: "ElevenLabs",
        id: "elevenlabs/eleven-multilingual-v2",
        name: "Eleven Multilingual v2",
        priceUnit: "request",
        provider: "ElevenLabs",
        subModes: [
          { id: "tts", name: "Текст в речь" },
          { id: "voice-changer", name: "Смена голоса" },
        ],
      },
      {
        badge: "Скорость",
        basePriceRub: 1.8,
        category: "audio",
        description:
          "Сверхбыстрый синтез с низкой задержкой для стримов и диалогов. 1.80 ₽/запрос.",
        familyId: "elevenlabs-family",
        familyName: "ElevenLabs",
        id: "elevenlabs/eleven-turbo-v2.5",
        name: "Eleven Turbo v2.5",
        priceUnit: "request",
        provider: "ElevenLabs",
        subModes: [{ id: "tts", name: "Текст в речь" }],
      },
      {
        badge: "Эконом",
        basePriceRub: 1.2,
        category: "audio",
        description:
          "Экономичная версия ElevenLabs со скидкой более 50%. 1.20 ₽/запрос.",
        familyId: "elevenlabs-family",
        familyName: "ElevenLabs",
        id: "elevenlabs/eleven-flash-v2",
        name: "Eleven Flash v2",
        priceUnit: "request",
        provider: "ElevenLabs",
        subModes: [{ id: "tts", name: "Текст в речь" }],
      },
    ],
    name: "ElevenLabs (Озвучка & Голоса)",
    provider: "ElevenLabs",
  },
  {
    badge: "Музыка",
    category: "audio",
    defaultModelId: "suno/suno-v4",
    description:
      "Создание полноценных песен с вокалом, куплетами, припевами и инструментальными треками в любых стилях.",
    id: "suno-family",
    models: [
      {
        badge: "Флагман",
        basePriceRub: 12,
        category: "audio",
        description:
          "Полноформатные треки Suno v4 со сложными аранжировками и вокалом. 12.00 ₽/трек.",
        familyId: "suno-family",
        familyName: "Suno",
        id: "suno/suno-v4",
        name: "Suno v4.0",
        priceUnit: "request",
        provider: "Suno",
        subModes: [
          { id: "simple", name: "Простой режим" },
          { id: "custom", name: "Свой (текст и стили)" },
        ],
      },
      {
        basePriceRub: 8,
        category: "audio",
        description:
          "Быстрое создание демо-треков и сэмплов Suno v3.5. 8.00 ₽/трек.",
        familyId: "suno-family",
        familyName: "Suno",
        id: "suno/suno-v3.5",
        name: "Suno v3.5",
        priceUnit: "request",
        provider: "Suno",
        subModes: [
          { id: "simple", name: "Простой" },
          { id: "custom", name: "Свой" },
        ],
      },
    ],
    name: "Suno (Генерация музыки)",
    provider: "Suno",
  },
  {
    badge: "Mistral",
    category: "audio",
    defaultModelId: "mistralai/voxtral-mini-tts-3-0",
    description:
      "Компактные европейские модели преобразования речи в текст и текста в речь от Mistral AI.",
    id: "voxtral-family",
    models: [
      {
        badge: "TTS",
        basePriceRub: 1.39,
        category: "audio",
        description:
          "Озвучка текста естественно звучащим голосом с минимальным временем отклика от Mistral. 1.39 ₽.",
        familyId: "voxtral-family",
        familyName: "Voxtral",
        id: "mistralai/voxtral-mini-tts-3-0",
        name: "Voxtral TTS 3",
        priceUnit: "request",
        provider: "Mistral",
      },
      {
        badge: "STT",
        basePriceRub: 0.66,
        category: "audio",
        description:
          "Преобразование аудио в текст с таймкодами и разделением по спикерам. 0.66 ₽.",
        familyId: "voxtral-family",
        familyName: "Voxtral",
        id: "mistralai/voxtral-mini-transcribe-3-0",
        name: "Voxtral Transcribe 3",
        priceUnit: "request",
        provider: "Mistral",
      },
    ],
    name: "Voxtral (Mistral AI)",
    provider: "Mistral",
  },
  {
    badge: "xAI",
    category: "audio",
    defaultModelId: "x-ai/grok-voice-tts-1.0",
    description:
      "Быстрый синтез речи с естественной интонацией и характером от xAI.",
    id: "grok-voice-family",
    models: [
      {
        basePriceRub: 1.8,
        category: "audio",
        description:
          "Быстрый эмоциональный синтез речи от Илона Маска и xAI. 1.80 ₽/запрос.",
        familyId: "grok-voice-family",
        familyName: "Grok Voice",
        id: "x-ai/grok-voice-tts-1.0",
        name: "Grok Voice 1.0",
        priceUnit: "request",
        provider: "xAI",
      },
    ],
    name: "Grok Voice",
    provider: "xAI",
  },
  {
    badge: "Саунд-дизайн",
    category: "audio",
    defaultModelId: "video-to-audio/foley-fx",
    description:
      "Интеллектуальная генерация фоновых шумов, саунд-дизайна и звуковых эффектов под видеоряд.",
    id: "video2audio-family",
    models: [
      {
        basePriceRub: 8,
        category: "audio",
        description:
          "Загрузите ролик до 20 сек для создания адаптивной звуковой дорожки и шумов окружения. 8.00 ₽.",
        familyId: "video2audio-family",
        familyName: "Видео в аудио",
        id: "video-to-audio/foley-fx",
        name: "Foley FX Studio",
        priceUnit: "request",
        provider: "k0td AI",
      },
    ],
    name: "Видео в аудио (Foley FX)",
    provider: "k0td AI",
  },
];

// Плоский список аудио-моделей
export const AUDIO_MODELS: ModelMetadata[] = AUDIO_FAMILIES.flatMap(
  (f) => f.models
);

// ============================================================================
// 4. КАТАЛОГ ГОЛОСОВ (ElevenLabs)
// ============================================================================

export interface VoicePreset {
  id: string;
  name: string;
  accent: string;
  age: string;
  gender: "male" | "female";
  description: string;
  previewUrl: string;
}

export const ELEVENLABS_VOICES: VoicePreset[] = [
  {
    accent: "Multilingual / Russian",
    age: "Adult",
    description:
      "Чистый, выразительный женский голос для русской и мультиязычной озвучки.",
    gender: "female",
    id: "kore-multilingual",
    name: "Kore (Русский / Мульти)",
    previewUrl: "/mock/sample-speech.wav",
  },
  {
    accent: "Multilingual / Russian",
    age: "Adult",
    description:
      "Уверенный мужской дикторский тембр для презентаций, рекламы и роликов.",
    gender: "male",
    id: "orus-multilingual",
    name: "Orus (Русский / Мульти)",
    previewUrl: "/mock/sample-speech.wav",
  },
  {
    accent: "American",
    age: "Young",
    description:
      "Спокойный, мягкий и теплый голос для обучающих видео, подкастов и аудиокниг.",
    gender: "female",
    id: "rachel-warm",
    name: "Rachel",
    previewUrl: "/mock/sample-speech.wav",
  },
  {
    accent: "American",
    age: "Middle-Aged",
    description:
      "Глубокий радио-тембр с солидной подачей для документалок и трейлеров.",
    gender: "male",
    id: "drew-deep",
    name: "Drew",
    previewUrl: "/mock/sample-speech.wav",
  },
  {
    accent: "British / English",
    age: "Middle-Aged",
    description:
      "Классический винтажный британский диктор в стиле телепередач 70-х.",
    gender: "male",
    id: "1970s-gentleman",
    name: "1970s Gentleman",
    previewUrl: "/mock/sample-speech.wav",
  },
  {
    accent: "American",
    age: "Adult",
    description:
      "Харизматичный рассказчик для художественных историй и озвучки персонажей.",
    gender: "male",
    id: "a-carlisle",
    name: "A Carlisle",
    previewUrl: "/mock/sample-speech.wav",
  },
];

export const SUNO_STYLE_PRESETS = [
  "Rock",
  "Pop",
  "Synthwave",
  "Lo-Fi",
  "Orchestral",
  "Hip-hop",
  "Cyberpunk",
  "Electronic",
  "Indie Pop",
  "Jazz",
  "Ambient",
  "Cinematic Epic",
  "Future Bass",
  "Deep House",
];

// ============================================================================
// 5. УТИЛИТЫ ПОИСКА И НОРМАЛИЗАЦИИ
// ============================================================================

export const normalizeVideoModelId = (id?: string): string => {
  if (!id) {
    return VIDEO_MODELS[0].id;
  }
  if (
    id === "x-ai/grok-imagine-video" ||
    id === "x-ai/grok-imagine-video-1.5"
  ) {
    return "x-ai/grok-imagine-video-1.5";
  }
  if (id === "minimax/hailuo-3" || id === "minimax/hailuo-3-max") {
    return "minimax/hailuo-3-max";
  }
  if (id === "wan" || id === "alibaba/wan") {
    return "alibaba/wan-3.0-prime";
  }
  return id;
};

export const findVideoModel = (id?: string): ModelMetadata => {
  const normalized = normalizeVideoModelId(id);
  return (
    VIDEO_MODELS.find((m) => m.id === normalized) ||
    VIDEO_MODELS.find((m) => m.id === id) ||
    VIDEO_MODELS.find(
      (m) =>
        (id && (m.id.includes(id) || id.includes(m.id))) ||
        (normalized && (m.id.includes(normalized) || normalized.includes(m.id)))
    ) ||
    VIDEO_MODELS[0]
  );
};

export const findVideoFamily = (familyId?: string): ModelFamily => {
  if (!familyId) {
    return VIDEO_FAMILIES[0];
  }
  return (
    VIDEO_FAMILIES.find((f) => f.id === familyId) ||
    VIDEO_FAMILIES.find((f) => f.models.some((m) => m.id === familyId)) ||
    VIDEO_FAMILIES[0]
  );
};

export const findImageModel = (id?: string): ModelMetadata => {
  if (!id) {
    return IMAGE_MODELS[0];
  }
  return (
    IMAGE_MODELS.find((m) => m.id === id) ||
    IMAGE_MODELS.find((m) => id.includes(m.id) || m.id.includes(id)) ||
    IMAGE_MODELS[0]
  );
};

export const findImageFamily = (familyId?: string): ModelFamily => {
  if (!familyId) {
    return IMAGE_FAMILIES[0];
  }
  return (
    IMAGE_FAMILIES.find((f) => f.id === familyId) ||
    IMAGE_FAMILIES.find((f) => f.models.some((m) => m.id === familyId)) ||
    IMAGE_FAMILIES[0]
  );
};

export const findAudioModel = (id?: string): ModelMetadata => {
  if (!id) {
    return AUDIO_MODELS[0];
  }
  return (
    AUDIO_MODELS.find((m) => m.id === id) ||
    AUDIO_MODELS.find((m) => id.includes(m.id) || m.id.includes(id)) ||
    AUDIO_MODELS[0]
  );
};

export const findAudioFamily = (familyId?: string): ModelFamily => {
  if (!familyId) {
    return AUDIO_FAMILIES[0];
  }
  return (
    AUDIO_FAMILIES.find((f) => f.id === familyId) ||
    AUDIO_FAMILIES.find((f) => f.models.some((m) => m.id === familyId)) ||
    AUDIO_FAMILIES[0]
  );
};

// ============================================================================
// 6. БЮДЖЕТНЫЕ И VIP МОДЕЛИ (Концепция доступа)
// ============================================================================

export const BUDGET_MODEL_IDS: readonly string[] = [
  // Видео (бюджетные / lite / turbo / экономичные версии)
  "alibaba/wan-2.1",
  "alibaba/wan-3.0",
  "x-ai/grok-imagine-video-1.5-lite",
  "runway/gen-3-alpha-turbo",
  "minimax/video-01-live",
  "google/veo-3.1-lite",
  "kwaivgi/kling-v1.6-pro",
  "bytedance/seedance-1.5-pro",
  "heygen/lipsync-express",
  "luma/dream-machine",

  // Графика (бюджетные версии)
  "google/gemini-3.1-flash-image-preview",
  "openai/gpt-image-1",
  "openai/dall-e-3",
  "black-forest-labs/flux-1-schnell",
  "black-forest-labs/flux-1-dev",
  "bytedance-seed/seedream-4.0",
  "recraft/recraft-v3",
  "stabilityai/stable-diffusion-3.5-turbo",

  // Аудио (бюджетные версии)
  "elevenlabs/eleven-flash-v2",
  "elevenlabs/eleven-turbo-v2.5",
  "suno/suno-v3.5",
  "mistralai/voxtral-mini-tts-3-0",
  "mistralai/voxtral-mini-transcribe-3-0",
  "x-ai/grok-voice-tts-1.0",
];

export const isBudgetModel = (
  modelOrId?: ModelMetadata | { id: string } | string | null
): boolean => {
  if (!modelOrId) {
    return false;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- This internal helper accepts a typed model identifier or already validated catalog metadata; no external payload is parsed here.
  const id = typeof modelOrId === "string" ? modelOrId : modelOrId.id;
  return BUDGET_MODEL_IDS.includes(id);
};

export const isVipModel = (
  modelOrId?: ModelMetadata | { id: string } | string | null
): boolean => !isBudgetModel(modelOrId);

export const getFamilyModels = (family: ModelFamily): ModelMetadata[] =>
  family.models.map((m) => ({
    ...m,
    isBudget: isBudgetModel(m.id),
    tier: isBudgetModel(m.id) ? "budget" : "vip",
  }));

export const getBudgetModelsForFamily = (
  family: ModelFamily
): ModelMetadata[] => family.models.filter((m) => isBudgetModel(m.id));

export const getVipModelsForFamily = (family: ModelFamily): ModelMetadata[] =>
  family.models.filter((m) => !isBudgetModel(m.id));
