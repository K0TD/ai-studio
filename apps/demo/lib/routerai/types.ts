// Shared Types for k0td AI Studio powered by RouterAI API

export type K0tdTab =
  | "video"
  | "image"
  | "audio"
  | "llm"
  | "trends"
  | "editor"
  | "agents";

export type SyntxTab = K0tdTab;

export interface GenerationMetadata {
  durationSeconds?: number;
  resolution?: string;
  aspectRatio?: string;
  generateAudio?: boolean;
  audioVoice?: string;
  sunoTitle?: string;
  sunoStyle?: string;
  lyrics?: string;
  instrumental?: boolean;
  error?: string;
  pollingUrl?: string;
  seed?: number;
}

export interface GenerationItem {
  id: string;
  /** Chat the generation belongs to — items are scoped per chat session. */
  chatId: string;
  tab: "video" | "image" | "audio";
  modelId: string;
  prompt: string;
  createdAt: string;
  status: "pending" | "completed" | "failed" | "reconciling";
  costRub: number;
  estimatedCostRub?: string;
  maxCostRub?: string;
  chargedCostRub?: string | null;
  pricingSource?: "actual" | "estimated" | null;
  // mp4, png/jpg/svg/base64, mp3
  outputUrls: string[];
  metadata?: GenerationMetadata;
}

export interface ModelFamily {
  id: string;
  name: string;
  provider: string;
  category: "video" | "image" | "audio" | "llm";
  description: string;
  badge?: string;
  defaultModelId: string;
  models: ModelMetadata[];
}

export interface ModelMetadata {
  id: string;
  name: string;
  provider: string;
  category: "video" | "image" | "audio" | "llm";
  basePriceRub: number;
  priceUnit: "request" | "second" | "image" | "token";
  familyId?: string;
  familyName?: string;
  badge?: string;
  supportedAspectRatios?: string[];
  supportedResolutions?: string[];
  supportedDurations?: number[];
  supportsAudio?: boolean;
  subModes?: { id: string; name: string }[];
  description?: string;
  supportedQualities?: string[];
  supportedOutputFormats?: string[];
  supportedBackgrounds?: string[];
  maxImageCount?: number;
  supportsReferences?: boolean;
  supportedFrameImages?: string[];
  supportsSeed?: boolean;
  supportsNegativePrompt?: boolean;
  supportedVoices?: string[];
  vectorPriceRub?: number;
}

export interface VideoGenerateRequest {
  model: string;
  prompt: string;
  aspect_ratio?: string;
  duration?: number;
  resolution?: string;
  generate_audio?: boolean;
  seed?: number;
  negative_prompt?: string;
  frame_images?: {
    type: "image_url";
    image_url: { url: string };
    frame_type: "first_frame" | "last_frame";
  }[];
  input_references?: {
    type: "image_url" | "video_url" | "audio_url";
    image_url?: { url: string };
    video_url?: { url: string };
    audio_url?: { url: string };
  }[];
  heygen_voice_id?: string;
  provider?: {
    options?: {
      heygen?: {
        voice_id?: string;
      };
    };
  };
}

export interface ImageGenerateRequest {
  model: string;
  prompt: string;
  aspect_ratio?: string;
  resolution?: string;
  quality?: string;
  n?: number;
  output_format?: "png" | "jpeg" | "webp" | "svg";
  background?: "auto" | "transparent" | "opaque";
  seed?: number;
  negative_prompt?: string;
  input_references?: {
    type: "image_url" | "file";
    image_url?: { url: string };
    file?: { file_id: string };
  }[];
}

export interface SpeechGenerateRequest {
  model: string;
  input: string;
  voice: string;
  response_format?: "mp3" | "pcm";
  speed?: number;
}

export interface SunoGenerateRequest {
  model?: string;
  title?: string;
  style?: string;
  lyrics?: string;
  instrumental?: boolean;
  prompt?: string;
}

export interface RouterAIVideoResponse {
  id: string;
  status:
    | "pending"
    | "in_progress"
    | "completed"
    | "failed"
    | "cancelled"
    | "expired";
  polling_url?: string;
  unsigned_urls?: string[];
  usage?: {
    cost?: number;
  };
  error?: string | { message?: string };
}
