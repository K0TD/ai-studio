import { z } from "zod";

import { mediaUrlSchema } from "@/lib/store/client-contracts";

/**
 * Client-side facade for the RouterAI proxy routes. Every response is decoded
 * with Zod at the boundary, so components only ever see domain types.
 */
export interface GenerationSettings {
  aspectRatio?: string;
  background?: "auto" | "transparent" | "opaque";
  duration?: number;
  frameImages?: {
    frame_type: "first_frame" | "last_frame";
    type: "image_url";
    image_url: {
      url: string;
    };
  }[];
  generateAudio?: boolean;
  avatarUrl?: string;
  heygenVoiceId?: string;
  inputReferences?: {
    type: "file" | "image_url";
    file?: {
      file_id: string;
    };
    image_url?: {
      url: string;
    };
  }[];
  instrumental?: boolean;
  lyrics?: string;
  mode?: "elevenlabs" | "suno" | "video2audio";
  n?: number;
  negativePrompt?: string;
  outputFormat?: "png" | "jpeg" | "webp" | "svg";
  quality?: string;
  resolution?: string;
  seed?: number;
  songTitle?: string;
  style?: string;
  videoReferenceUrl?: string;
  voiceId?: string;
}
export interface GenerateRequest {
  chatId: string;
  modelId: string;
  prompt: string;
  settings: GenerationSettings;
  tab: "audio" | "image" | "video";
}
export interface UploadedReference {
  url: string;
  filename: string;
  id: string;
  mimeType: string;
  sizeBytes: number;
}
const uploadResponseSchema = z.object({
  filename: z.string(),
  id: z.string().uuid(),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  url: mediaUrlSchema,
});
export const uploadReference = async (
  file: File
): Promise<UploadedReference> => {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/k0td-ai/files", { body, method: "POST" });
  const data = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(data);
    throw new Error(
      error.success ? error.data.error : "Не удалось загрузить референс"
    );
  }
  return uploadResponseSchema.parse(data);
};
