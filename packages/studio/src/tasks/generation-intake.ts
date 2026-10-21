import type { ModerationProvider } from "../config/types";

type GenerationPromptResolution =
  | { action: "block"; reason?: string }
  | {
      action: "allow";
      prompt: string;
      originalPrompt?: string;
      moderationAction: "allow" | "rewrite";
      moderatedPrompt?: string;
    };

interface ResolveGenerationPromptInput {
  moderation: ModerationProvider;
  prompt: string;
  userId: string;
  referenceImage?: string;
  fallbackPrompt?: Promise<string>;
}

export const resolveGenerationPrompt = async ({
  moderation,
  prompt,
  userId,
  referenceImage,
  fallbackPrompt = Promise.resolve(prompt),
}: ResolveGenerationPromptInput): Promise<GenerationPromptResolution> => {
  const [fallback, result] = await Promise.all([
    fallbackPrompt,
    Promise.resolve().then(() =>
      moderation.check({ prompt, referenceImage, userId })
    ),
  ]);
  if (result.action === "block") {
    return result;
  }

  const finalPrompt = result.rewritten ?? fallback;
  const resolution: GenerationPromptResolution = {
    action: "allow",
    moderationAction: result.rewritten ? "rewrite" : "allow",
    prompt: finalPrompt,
  };
  if (finalPrompt !== prompt) {
    resolution.originalPrompt = prompt;
  }
  if (result.rewritten) {
    resolution.moderatedPrompt = result.rewritten;
  }
  return resolution;
};
