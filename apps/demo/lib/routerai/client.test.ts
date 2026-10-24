import { describe, expect, test } from "bun:test";

import { z } from "zod";

import { RouterAIClient, RouterAIError } from "./client";

const fixtureRequestSchema = z.object({
  image_config: z
    .object({
      aspect_ratio: z.string().optional(),
      image_size: z.string().optional(),
    })
    .optional(),
  modalities: z.array(z.string()).optional(),
  provider: z
    .object({
      allow_fallbacks: z.boolean().optional(),
      only: z.array(z.string()).optional(),
    })
    .optional(),
});
class FixtureClient extends RouterAIClient {
  requests: { path: string; body?: z.infer<typeof fixtureRequestSchema> }[] =
    [];
  private response: () => Response;
  constructor(response: () => Response) {
    super("fixture-key");
    this.response = response;
  }
  override request(path: string, init: RequestInit = {}): Promise<Response> {
    this.requests.push({
      body: init.body
        ? fixtureRequestSchema.parse(JSON.parse(String(init.body)))
        : undefined,
      path,
    });
    return Promise.resolve(this.response());
  }
}

const image = "iVBORw0KGgo=";
const dataUrl = `data:image/png;base64,${image}`;

describe("RouterAI image and speech response contracts", () => {
  test("video lifecycle errors reach the normal failed-status response parser", async () => {
    const client = new FixtureClient(() =>
      Response.json({
        error: { message: "Provider could not render this video" },
        id: "video-failed",
        status: "failed",
      })
    );
    await expect(client.getVideoStatus("video-failed")).resolves.toMatchObject({
      error: { message: "Provider could not render this video" },
      id: "video-failed",
      status: "failed",
    });
  });
  test("reads actual billing for binary endpoints by generation ID", async () => {
    const client = new FixtureClient(() =>
      Response.json({ total_cost: "105.46" })
    );
    await expect(client.getGenerationCost("speech-result")).resolves.toBe(
      105.46
    );
    expect(client.requests[0].path).toBe("/generation?id=speech-result");
  });
  test("native images return bytes, exact cost and generation ID from headers", async () => {
    const client = new FixtureClient(() =>
      Response.json(
        {
          data: [{ b64_json: image }],
          usage: { cost: "3.40" },
        },
        { headers: { "X-Generation-Id": "gen-native" } }
      )
    );
    const result = await client.generateImage({
      model: "openai/gpt-image-1",
      prompt: "test",
    });
    expect(client.requests[0].path).toBe("/images");
    expect(result).toEqual({
      cost: 3.4,
      generationId: "gen-native",
      urls: [dataUrl],
    });
  });
  test("confirms a valid synchronous image response with no outputs as a final failure", async () => {
    const client = new FixtureClient(() =>
      Response.json({
        data: [],
        id: "gen-empty",
        usage: { cost: 3.4 },
      })
    );
    await expect(
      client.generateImage({
        model: "black-forest-labs/flux-3-image",
        prompt: "test",
      })
    ).rejects.toMatchObject({
      context: {
        confirmedFailure: true,
        cost: 3.4,
        diagnostic: { endpoint: "/images", outputCount: 0, status: 200 },
        generationId: "gen-empty",
      },
      uncertain: false,
    });
  });
  test("treats a 2xx provider error envelope with a 4xx code as a confirmed rejection", async () => {
    const client = new FixtureClient(() =>
      Response.json(
        {
          error: {
            code: 400,
            message:
              "Black Forest Labs FLUX 3 Image does not support: output_format, quality, background.",
          },
        },
        { headers: { "X-Generation-Id": "gen-rejected" } }
      )
    );
    await expect(
      client.generateImage({
        model: "black-forest-labs/flux-3-image",
        prompt: "test",
      })
    ).rejects.toMatchObject({
      context: { confirmedFailure: true, generationId: "gen-rejected" },
      details:
        "Black Forest Labs FLUX 3 Image does not support: output_format, quality, background.",
      message:
        "Модель не поддерживает один или несколько выбранных параметров. Обновите настройки и повторите запрос.",
      status: 400,
      uncertain: false,
    });
  });
  test("treats a 2xx provider error envelope with code 408 as an uncertain timeout", async () => {
    const client = new FixtureClient(() =>
      Response.json({
        error: { code: 408, message: "Provider request timed out" },
      })
    );
    await expect(
      client.generateImage({
        model: "black-forest-labs/flux-3-image",
        prompt: "test",
      })
    ).rejects.toMatchObject({
      context: { confirmedFailure: false },
      status: 408,
      uncertain: true,
    });
  });
  test("does not confirm a 2xx image error envelope with a 5xx or missing code", async () => {
    const responses = [
      {
        data: null,
        error: { code: 500, message: "Provider image backend failed" },
      },
      {
        error: { code: 500, message: "Provider image backend failed" },
        status: 500,
      },
      {
        data: [],
        error: { code: 500, message: "Provider image backend failed" },
        id: "gen-error-empty",
        usage: { cost: 3.4 },
      },
      { error: { message: "Provider image backend failed" } },
    ];
    for (const providerResponse of responses) {
      const client = new FixtureClient(() =>
        Response.json(providerResponse)
      );
      await expect(
        client.generateImage({
          model: "black-forest-labs/flux-3-image",
          prompt: "test",
        })
      ).rejects.toMatchObject({
        context: { confirmedFailure: false },
        status: 502,
        uncertain: true,
      });
    }
  });
  test("Gemini accepts nullable text alongside images and sends references as multimodal content", async () => {
    const client = new FixtureClient(() =>
      Response.json({
        choices: [
          {
            message: {
              content: null,
              images: [{ image_url: { url: dataUrl } }],
            },
          },
        ],
        id: "gen-gemini",
        usage: { cost: 0 },
      })
    );
    const result = await client.generateImage({
      aspect_ratio: "16:9",
      input_references: [{ image_url: { url: dataUrl }, type: "image_url" }],
      model: "google/gemini-3.1-flash-image-preview",
      prompt: "test",
      provider: { allow_fallbacks: false, only: ["routerai-fixture"] },
      resolution: "2K",
    });
    expect(client.requests[0].path).toBe("/chat/completions");
    expect(client.requests[0].body?.modalities).toEqual(["image", "text"]);
    expect(client.requests[0].body?.provider).toEqual({
      allow_fallbacks: false,
      only: ["routerai-fixture"],
    });
    expect(client.requests[0].body?.image_config).toEqual({
      aspect_ratio: "16:9",
      image_size: "2K",
    });
    expect(result).toEqual({
      cost: 0,
      generationId: "gen-gemini",
      urls: [dataUrl],
    });
  });
  test("structured image parts are supported and duplicate outputs are removed", async () => {
    const client = new FixtureClient(() =>
      Response.json({
        choices: [
          {
            message: {
              content: [
                { text: "done", type: "text" },
                { image_url: { url: dataUrl }, type: "image_url" },
                { inline_data: { data: "YWJj", mime_type: "image/webp" } },
              ],
              images: [dataUrl],
            },
          },
        ],
      })
    );
    const result = await client.generateImage({
      model: "google/gemini-3.1-flash-image",
      prompt: "test",
    });
    expect(result.urls).toEqual([dataUrl, "data:image/webp;base64,YWJj"]);
  });
  test("text-only results retain confirmed failure details without private text", async () => {
    const client = new FixtureClient(() =>
      Response.json({
        choices: [
          {
            finish_reason: "content_filter",
            message: { content: "PRIVATE PROMPT AND TOKEN" },
          },
        ],
        id: "gen-empty",
        usage: { cost: 7.25 },
      })
    );
    try {
      await client.generateImage({
        model: "google/gemini-3.1-flash-image",
        prompt: "test",
      });
      throw new Error("Expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(RouterAIError);
      if (!(error instanceof RouterAIError)) {
        throw error;
      }
      const providerError = error;
      expect(providerError.uncertain).toBe(false);
      expect(providerError.context).toMatchObject({
        confirmedFailure: true,
        cost: 7.25,
        diagnostic: { finishReasons: ["content_filter"] },
        generationId: "gen-empty",
      });
      expect(JSON.stringify(providerError)).not.toContain("PRIVATE PROMPT");
    }
  });
  test("invalid schemas retain safe ID and response structure without data URLs", async () => {
    const client = new FixtureClient(() =>
      Response.json({
        choices: [{ message: { images: { secret: dataUrl } } }],
        id: "gen-invalid",
        usage: { cost: 1.5 },
      })
    );
    await expect(
      client.generateImage({
        model: "google/gemini-3.1-flash-image",
        prompt: "test",
      })
    ).rejects.toMatchObject({
      context: { cost: 1.5, generationId: "gen-invalid" },
      uncertain: true,
    });
    try {
      await client.generateImage({
        model: "google/gemini-3.1-flash-image",
        prompt: "test",
      });
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      expect(error.message).not.toContain(dataUrl);
    }
  });
  test("SVG native output uses the MIME accepted by artifact storage", async () => {
    const client = new FixtureClient(() =>
      Response.json({ data: [{ b64_json: "PHN2Zy8+" }] })
    );
    const result = await client.generateImage({
      model: "recraft/recraft-v3",
      output_format: "svg",
      prompt: "test",
    });
    expect(result.urls).toEqual(["data:image/svg+xml;base64,PHN2Zy8+"]);
  });
  test("speech empty and malformed results retain generation ID for reconciliation", async () => {
    const client = new FixtureClient(
      () =>
        new Response("", {
          headers: {
            "Content-Type": "audio/mpeg",
            "X-Generation-Id": "gen-speech",
          },
        })
    );
    await expect(
      client.generateSpeech({
        input: "test",
        model: "elevenlabs/eleven-multilingual-v2",
        voice: "george",
      })
    ).rejects.toMatchObject({
      context: { generationId: "gen-speech" },
      uncertain: true,
    });
  });
});
