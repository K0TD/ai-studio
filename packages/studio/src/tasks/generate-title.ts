// Fire-and-forget sidecar for image and video requests: generates the 2-4 word
// gallery title from the user's typed prompt and stamps it on the request's
// rows whenever it's ready. Nothing waits on the generated title — a slow or
// failed title never delays or fails the generation pipeline. Moved from
// trigger/generate-title.ts.

import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

import { runTitle } from "../ai/prompt-runners";
import type { StudioConfig } from "../config/types";
import type { GenerationRepository } from "../server/generation-repository";

export const generateTitlePayloadSchema = z.object({
  generationIds: z.array(z.uuid()).min(1),
  prompt: z.string().min(1),
  traceHeaders: z.record(z.string(), z.string()).default({}),
  userId: z.string(),
});

export type GenerateTitlePayload = z.infer<typeof generateTitlePayloadSchema>;

const EXCERPT_WORD_COUNT = 4;
const WHITESPACE_RE = /\s+/u;

// Fallback when prompts.title isn't configured: a short
// excerpt of the typed prompt instead of an LLM call.
const excerptTitle = (prompt: string): string =>
  prompt
    .trim()
    .split(WHITESPACE_RE)
    .slice(0, EXCERPT_WORD_COUNT)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

export const createGenerateTitleTask = (
  config: StudioConfig,
  queries: GenerationRepository
) =>
  schemaTask({
    id: "generate-title",
    machine: "micro",
    retry: { maxAttempts: 2 },
    run: async (payload) => {
      const title = await logger.trace("title-llm", async (span) => {
        span.setAttribute("input.prompt", payload.prompt);
        const spec = config.prompts?.title;
        const out = spec
          ? await runTitle(spec, payload.prompt)
          : excerptTitle(payload.prompt);
        span.setAttribute("output.title", out ?? "");
        return out;
      });
      if (title) {
        await queries.setTitles(payload.userId, payload.generationIds, title);
      }
      logger.info("title saved", {
        generationIds: payload.generationIds,
        title,
      });
    },
    schema: generateTitlePayloadSchema,
  });

export type GenerateTitleTask = ReturnType<typeof createGenerateTitleTask>;
