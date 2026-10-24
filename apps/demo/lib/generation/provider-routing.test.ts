import { afterEach, describe, expect, test } from "bun:test";

import { routerai } from "@/lib/routerai/client";
import { IMAGE_MODELS, VIDEO_MODELS } from "@/lib/routerai/models-catalog";
import { providerEndpointSchema } from "@/lib/routerai/responses";
import type { ProviderEndpoint } from "@/lib/routerai/responses";

import { normalizeCatalogModel } from "./catalog";
import { selectProvider } from "./provider-routing";

const originalGetEndpoints = routerai.getModelEndpoints;
afterEach(() => {
  routerai.getModelEndpoints = originalGetEndpoints;
});

const videoModelBase = VIDEO_MODELS.find(
  (candidate) => candidate.id === "black-forest-labs/flux-3-video"
);
if (!videoModelBase) {
  throw new Error("Missing FLUX video fixture");
}
const model = normalizeCatalogModel(
  videoModelBase,
  {
    architecture: { input_modalities: ["text", "image"] },
    id: "black-forest-labs/flux-3-video",
    pricing: { seconds: 1 },
    pricing_units: { seconds: "second" },
    supported_frame_images: ["first_frame", "last_frame"],
    supported_parameters: ["input_references", "frame_images"],
    supports_reference_images: true,
  },
  new Date().toISOString()
);
const endpoint = (value: ProviderEndpoint) =>
  providerEndpointSchema.parse(value);

describe("RouterAI provider selection", () => {
  test("image input modality alone does not advertise reference attachment support", () => {
    const base = VIDEO_MODELS.find(
      (candidate) => candidate.id === "black-forest-labs/flux-3-video"
    );
    if (!base) {
      throw new Error("Missing model fixture");
    }
    const imageInputOnly = normalizeCatalogModel(
      base,
      {
        architecture: { input_modalities: ["text", "image"] },
        id: base.id,
        pricing: { seconds: 1 },
        pricing_units: { seconds: "second" },
      },
      new Date().toISOString()
    );
    expect(imageInputOnly.supportsReferences).toBe(false);
  });
  test("uses the live image_pricing variant when quoting image tiers", async () => {
    const base = IMAGE_MODELS.find(
      (candidate) => candidate.id === "black-forest-labs/flux-3-image"
    );
    if (!base) {
      throw new Error("Missing image model fixture");
    }
    const imageModel = normalizeCatalogModel(
      base,
      {
        id: base.id,
        image_pricing: [{ price: 0.16, unit: "image", variant: "4k" }],
      },
      new Date().toISOString()
    );
    routerai.getModelEndpoints = () =>
      Promise.resolve([
        endpoint({
          pricing: { image_output: 0.01 },
          pricing_units: { image_output: "megapixel" },
          status: 0,
          supported_apis: ["/images"],
          tag: "megapixel",
        }),
      ]);
    const quote = await selectProvider(
      imageModel,
      { resolution: "4K" },
      "test"
    );
    expect(quote.estimatedCostRub).toBe("0.16");
  });
  test("quotes the cheapest active compatible endpoint and supports choosing an alternative", async () => {
    routerai.getModelEndpoints = () =>
      Promise.resolve([
        endpoint({
          name: "Expensive",
          pricing: { seconds: 2 },
          pricing_units: { seconds: "second" },
          provider_name: "Expensive",
          status: 0,
          supported_apis: ["POST /api/v1/videos"],
          supported_parameters: ["input_references"],
          tag: "expensive",
        }),
        endpoint({
          name: "Cheapest",
          pricing: { seconds: 0.5 },
          pricing_units: { seconds: "second" },
          provider_name: "Cheapest",
          status: 0,
          supported_apis: ["/videos"],
          supported_parameters: ["input_references"],
          tag: "cheapest",
        }),
        endpoint({
          pricing: { seconds: 0.01 },
          pricing_units: { seconds: "second" },
          status: -1,
          supported_apis: ["/videos"],
          tag: "offline",
        }),
      ]);

    const settings = { duration: 5 };
    const cheapest = await selectProvider(model, settings, "test");
    expect(cheapest.endpoint.tag).toBe("cheapest");
    expect(cheapest.estimatedCostRub).toBe("2.50");
    expect(cheapest.options.map((option) => option.tag)).toEqual([
      "cheapest",
      "expensive",
    ]);

    const alternative = await selectProvider(
      model,
      settings,
      "test",
      "expensive"
    );
    expect(alternative.endpoint.tag).toBe("expensive");
    expect(alternative.estimatedCostRub).toBe("10.00");
  });

  test("rejects an endpoint that does not accept the requested reference mode", async () => {
    routerai.getModelEndpoints = () =>
      Promise.resolve([
        endpoint({
          pricing: { seconds: 1 },
          pricing_units: { seconds: "second" },
          status: 1,
          supported_apis: ["/videos"],
          supported_parameters: ["seed"],
          tag: "no-references",
        }),
      ]);

    await expect(
      selectProvider(
        model,
        {
          duration: 5,
          inputReferences: [
            { file: { file_id: crypto.randomUUID() }, type: "file" },
          ],
        },
        "test"
      )
    ).rejects.toMatchObject({ code: "NO_COMPATIBLE_PROVIDER" });
  });
});
