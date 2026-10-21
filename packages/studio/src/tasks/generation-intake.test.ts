import { describe, expect, test } from "bun:test";

import type { ModerationProvider } from "../config/types";
import { resolveGenerationPrompt } from "./generation-intake";

const moderation = (
  check: ModerationProvider["check"]
): ModerationProvider => ({ check });

describe("resolveGenerationPrompt", () => {
  test("uses enhancement after an allow outcome", async () => {
    const result = await resolveGenerationPrompt({
      fallbackPrompt: Promise.resolve("enhanced prompt"),
      moderation: moderation(() => Promise.resolve({ action: "allow" })),
      prompt: "typed prompt",
      userId: "user-1",
    });

    expect(result).toEqual({
      action: "allow",
      moderationAction: "allow",
      originalPrompt: "typed prompt",
      prompt: "enhanced prompt",
    });
  });

  test("uses a moderation rewrite instead of enhancement", async () => {
    const result = await resolveGenerationPrompt({
      fallbackPrompt: Promise.resolve("enhanced prompt"),
      moderation: moderation(() =>
        Promise.resolve({ action: "allow", rewritten: "rewritten prompt" })
      ),
      prompt: "typed prompt",
      userId: "user-1",
    });

    expect(result).toEqual({
      action: "allow",
      moderatedPrompt: "rewritten prompt",
      moderationAction: "rewrite",
      originalPrompt: "typed prompt",
      prompt: "rewritten prompt",
    });
  });

  test("passes reference images through the moderation seam", async () => {
    let received: Parameters<ModerationProvider["check"]>[0] | undefined;
    const result = await resolveGenerationPrompt({
      moderation: moderation((input) => {
        received = input;
        return Promise.resolve({ action: "allow" });
      }),
      prompt: "motion prompt",
      referenceImage: "source-image",
      userId: "user-1",
    });

    expect(received).toEqual({
      prompt: "motion prompt",
      referenceImage: "source-image",
      userId: "user-1",
    });
    expect(result).toEqual({
      action: "allow",
      moderationAction: "allow",
      prompt: "motion prompt",
    });
  });

  test("returns a block without resolving a generation prompt", async () => {
    await expect(
      resolveGenerationPrompt({
        moderation: moderation(() =>
          Promise.resolve({ action: "block", reason: "content policy" })
        ),
        prompt: "typed prompt",
        userId: "user-1",
      })
    ).resolves.toEqual({ action: "block", reason: "content policy" });
  });

  test("propagates moderation outages", async () => {
    await expect(
      resolveGenerationPrompt({
        moderation: moderation(() => Promise.reject(new Error("offline"))),
        prompt: "typed prompt",
        userId: "user-1",
      })
    ).rejects.toThrow("offline");
  });
});
