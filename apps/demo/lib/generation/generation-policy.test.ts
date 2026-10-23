import { describe, expect, test } from "bun:test";

import { isPublicAddress } from "../media/download";
import {
  IMAGE_MODELS,
  VIDEO_MODELS,
  AUDIO_MODELS,
} from "../routerai/models-catalog";
import {
  normalizeCatalogModel,
  estimate,
  speechPageRate,
  permittedModel,
} from "./catalog";
import {
  generationRequestSchema,
  requestHash,
  referencedFileIds,
  normalizedSettings,
} from "./contracts";

const id = "00000000-0000-4000-8000-000000000001";
const request = {
  chatId: id,
  modelId: "black-forest-labs/flux-3-image",
  prompt: "Тест",
  settings: {},
  tab: "image" as const,
};

describe("Generation boundaries and authoritative pricing", () => {
  test("request parser bounds prompt, count and unknown settings", () => {
    expect(
      generationRequestSchema.safeParse({ ...request, prompt: " " }).success
    ).toBe(false);
    expect(
      generationRequestSchema.safeParse({ ...request, settings: { n: -1 } })
        .success
    ).toBe(false);
    expect(
      generationRequestSchema.safeParse({ ...request, settings: { n: 200 } })
        .success
    ).toBe(false);
    expect(
      generationRequestSchema.safeParse({
        ...request,
        settings: { arbitraryProviderOption: true },
      }).success
    ).toBe(false);
  });
  test("idempotency hash is independent of object property insertion order", () => {
    expect(requestHash(request)).toBe(
      requestHash({
        chatId: id,
        modelId: request.modelId,
        prompt: "Тест",
        settings: {},
        tab: "image",
      })
    );
    expect(requestHash(request)).not.toBe(
      requestHash({ ...request, prompt: "Другой" })
    );
  });
  test("only owned local reference identifiers reach the provider", () => {
    expect(
      referencedFileIds({
        inputReferences: [{ file: { file_id: id }, type: "file" }],
      })
    ).toEqual([id]);
    expect(
      referencedFileIds({
        frameImages: [
          {
            frame_type: "first_frame",
            image_url: { url: `/api/k0td-ai/files/${id}/content` },
            type: "image_url",
          },
        ],
      })
    ).toEqual([id]);
    expect(() =>
      referencedFileIds({
        inputReferences: [
          {
            image_url: { url: "http://169.254.169.254/metadata" },
            type: "image_url",
          },
        ],
      })
    ).toThrow();
  });
  test("FLUX 4K uses live variant tariff, never the old hardcoded multiplier", () => {
    const base = IMAGE_MODELS.find((model) => model.id === request.modelId);
    if (!base) {
      throw new Error("Missing Flux fixture");
    }
    const model = normalizeCatalogModel(
      base,
      {
        image_pricing: [
          { price: 5.11517136, unit: "image", variant: "1k" },
          { price: 64.68560449, unit: "image", variant: "4k" },
        ],
        pricing: { image_output: 4 },
        supported_image_sizes: ["1K", "4K"],
      },
      new Date().toISOString()
    );
    expect(model.enabled).toBe(true);
    expect(estimate(model, { n: 1, resolution: "4K" }, "Тест")).toBe("64.69");
    expect(() => estimate(model, { n: 1, resolution: "2K" }, "Тест")).toThrow();
  });
  test("token-priced image models fail closed until a verified formula exists", () => {
    const model = normalizeCatalogModel(
      IMAGE_MODELS[0],
      {
        image_pricing: [{ price: 0.004, unit: "token", variant: null }],
        pricing: { image_output: 0.004 },
        pricing_units: { image_output: "token" },
      },
      new Date().toISOString()
    );
    expect(model.enabled).toBe(false);
    expect(model.disabledReason).toBe("unsupported_pricing");
  });
  test("TTS uses an explicitly published character tariff, never assumes tokens are characters", () => {
    expect(
      speechPageRate("<p>Символы — <b>1 615</b> ₽ за 1 млн символов.</p>")
    ).toBe(0.001615);
    expect(
      speechPageRate(
        "<script>Символы — 999 ₽ за 1 млн символов</script><p>Цена 999 ₽ за токены</p>"
      )
    ).toBeNull();
    const base = AUDIO_MODELS.find(
      (model) => model.id === "x-ai/grok-voice-tts-1.0"
    );
    if (!base) {
      throw new Error("Missing voice fixture");
    }
    expect(
      normalizeCatalogModel(
        base,
        { pricing: { prompt: 0.001 }, pricing_units: { prompt: "token" } },
        null
      ).enabled
    ).toBe(false);
    const model = normalizeCatalogModel(
      base,
      {
        _verifiedSpeechPricePerCharacterRub: 0.001615,
        pricing: { prompt: 0.001 },
        pricing_units: { prompt: "token" },
      },
      null
    );
    expect(model.enabled).toBe(true);
    expect(estimate(model, {}, "а".repeat(1000))).toBe("1.62");
  });
  test("admin and VIP roles retain implicit model access", () => {
    const model = normalizeCatalogModel(VIDEO_MODELS[0], undefined, null);
    for (const role of ["admin", "vip"] as const) {
      expect(
        permittedModel(
          {
            permissions: {
              dailyLimitRub: null,
              maxConcurrentJobs: 1,
              modelIds: [],
              sections: [],
            },
            role,
          },
          model
        )
      ).toBe(true);
    }
  });
  test("unsupported capabilities are rejected before a paid request", () => {
    const model = normalizeCatalogModel(
      IMAGE_MODELS[2],
      {
        image_pricing: [{ price: 4, unit: "image", variant: null }],
        max_image_count: 1,
        pricing: { image_output: 4 },
        supported_aspect_ratios: ["1:1"],
        supported_image_sizes: ["1K"],
      },
      null
    );
    expect(() =>
      normalizedSettings({ ...request, settings: { n: 2 } }, model)
    ).toThrow();
    expect(() =>
      normalizedSettings({ ...request, settings: { resolution: "4K" } }, model)
    ).toThrow();
    expect(() =>
      normalizedSettings({ ...request, settings: { seed: 1 } }, model)
    ).toThrow();
  });
  test("remote output downloading rejects local and private addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.1.1",
      "169.254.169.254",
      "172.16.0.1",
      "192.168.1.1",
      "100.64.0.1",
      "::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isPublicAddress(ip)).toBe(false);
    }
    expect(isPublicAddress("8.8.8.8")).toBe(true);
  });
});
