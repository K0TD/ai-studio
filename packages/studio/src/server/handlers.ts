// createStudioHandlers: the four route bodies from
// app/api/{generate/run,generate/video,generations,balance}/route.ts,
// rewritten as closures over `config` and mounted by the host behind one
// catch-all (app/api/studio/[...studio]/route.ts). Response shapes are
// byte-identical to the routes they replace.
//
// No "server-only" import guard here (unlike the rest of this file's peers,
// which is what spec/task language would otherwise suggest): this package's
// "./server" entry point is also reached by trigger tasks today (the host
// app's post-process module imports applyWatermarks/embedPngText from it),
// and Trigger.dev's esbuild bundler doesn't set the "react-server" condition
// server-only's guard relies on — it resolves to the unconditionally-throwing
// branch there and would crash task bundling. studio.config.ts documents the
// same tradeoff for the same reason.

import { tasks } from "@trigger.dev/sdk";
import { z } from "zod";

import {
  defaultLoraStrength,
  encodeLoraSelection,
  resolveLoraStrength,
} from "../config/lora-selection";
import { RATIO_KEYS } from "../config/types";
import type { StudioConfig } from "../config/types";
import { GenerationRepository } from "./generations";
import type { CreateGenerationInput } from "./generations";

// Generic bookkeeping constants, not model/workflow data — kept as package
// literals rather than a config surface.
const MAX_SEED = 1_125_899_906_842_624;
const MAX_CONTROL_IMAGE_BYTES = 7 * 1024 * 1024;
// The shared byte cap compared against base64 length (4 chars per 3 bytes).
const MAX_CONTROL_IMAGE_BASE64_CHARS =
  Math.ceil(MAX_CONTROL_IMAGE_BYTES / 3) * 4;
const RESOLUTION_TIERS = ["Standard", "High", "Ultra"] as const;

export interface StudioRouteHandlers {
  GET: (req: Request) => Promise<Response>;
  POST: (req: Request) => Promise<Response>;
  DELETE: (req: Request) => Promise<Response>;
}

const routePath = (req: Request): string => {
  const { pathname } = new URL(req.url);
  const marker = "/api/studio/";
  const idx = pathname.indexOf(marker);
  return idx === -1 ? pathname : pathname.slice(idx + marker.length);
};

// --- POST generate/run -------------------------------------------------------

const buildGenerateRunSchema = (config: StudioConfig) => {
  const modelIds = new Set(config.models.map((model) => model.id));
  // posePreset stores the pose's controlImageUrl (today a /public path —
  // the client sends the same value it renders as the thumbnail/control
  // image, not the PoseSpec id).
  const posePaths = new Set(
    config.models
      .flatMap((model) => model.poses ?? [])
      .map((pose) => pose.controlImageUrl)
  );
  return z.object({
    enhance: z.boolean().default(false),
    loras: z
      .array(z.object({ id: z.string(), strength: z.number().optional() }))
      .default([]),
    modelIds: z
      .array(
        z
          .string()
          .refine((id) => modelIds.has(id), { message: "unknown model" })
      )
      .min(1),
    poseImage: z.string().min(1).optional(),
    posePreset: z
      .string()
      .refine((path) => posePaths.has(path), { message: "unknown pose preset" })
      .optional(),
    prompt: z.string().min(1),
    ratio: z.enum(RATIO_KEYS).default("1:1"),
    referenceImage: z.string().min(1).optional(),
    resolutionTier: z.enum(RESOLUTION_TIERS).default("Standard"),
    seed: z.number().int().min(-1).max(MAX_SEED).optional(),
  });
};

// Persists a control input image (already validated base64) to storage
// inside the control generation's folder — alongside where its outputs will
// land. The "generate-request" task fetches the bytes by key (too large to
// carry through a Trigger.dev payload), and the same object later serves as
// the row's display copy.
const uploadControlImage = async (
  config: StudioConfig,
  generationId: string,
  name: "reference" | "pose",
  base64: string
): Promise<string> => {
  const key = `${generationId}/${name}.png`;
  await config.storage.upload(key, Buffer.from(base64, "base64"), "image/png");
  return key;
};

const handleGenerateRun = async (
  config: StudioConfig,
  queries: GenerationRepository,
  req: Request
): Promise<Response> => {
  const session = await config.auth.getSession(req);
  if (!session) {
    return new Response("unauthorized", { status: 401 });
  }
  const { userId } = session;

  const parsed = buildGenerateRunSchema(config).safeParse(await req.json());
  if (!parsed.success) {
    return new Response("bad request", { status: 400 });
  }
  const input = parsed.data;

  // Reject oversized control images before persisting anything — they'd be
  // refused by RunPod's body-size limit anyway.
  const oversized = [input.referenceImage, input.poseImage].some(
    (image) =>
      image !== undefined && image.length > MAX_CONTROL_IMAGE_BASE64_CHARS
  );
  if (oversized) {
    return Response.json({ error: "image_too_large" }, { status: 413 });
  }

  const totalCost = input.modelIds.reduce(
    (sum, modelId) => sum + config.billing.costFor(modelId),
    0
  );

  // Affordability gate before creating pollable rows. The authoritative charge
  // happens per row (keyed by its RunPod job id) so a refund can target it.
  // A null balance means unlimited (free-mode config) — skip the check.
  const balance = await config.billing.getBalance(userId);
  if (balance !== null && balance < totalCost) {
    return Response.json(
      { error: "insufficient_funds", topUpUrl: config.billing.topUpUrl },
      { status: 402 }
    );
  }

  // Selections resolve against the configured catalog here, once: unknown ids
  // are dropped, slider strengths clamped, and the result encoded to the
  // "id@strength" strings the DB column and task payloads carry (plain id
  // when the strength is the LoRA's default).
  const loraCatalog = config.models.flatMap((model) => model.loras ?? []);
  const loras = input.loras.flatMap((selection) => {
    const spec = loraCatalog.find((lora) => lora.id === selection.id);
    if (!spec) {
      return [];
    }
    const strength = resolveLoraStrength(spec, selection.strength);
    return [
      encodeLoraSelection({
        id: spec.id,
        strength: strength === defaultLoraStrength(spec) ? undefined : strength,
      }),
    ];
  });

  // Resolve seeds before insert so the exact value sent to the workflow is the
  // one persisted — a run is always reproducible from its row. A pinned seed
  // applies to every model; otherwise each row gets its own.
  const pinnedSeed =
    input.seed === undefined || input.seed === -1 ? undefined : input.seed;
  const requestId = crypto.randomUUID();

  // One row per model, created (in a single insert) before any slow work so
  // the response can return the ids immediately. Every model accepts
  // loras/pose; workflows without the matching nodes ignore them at build
  // time (buildWorkflow only touches nodes the node map declares).
  const inputs: CreateGenerationInput[] = input.modelIds.map((modelId) => ({
    loras,
    modelId,
    pose: input.posePreset,
    priceCoins: config.billing.costFor(modelId),
    prompt: input.prompt,
    ratio: input.ratio,
    requestId,
    resolution: input.resolutionTier,
    seed: pinnedSeed ?? Math.floor(Math.random() * MAX_SEED),
    userId,
  }));
  const rows = await queries.create(inputs);
  const generations = inputs.map((row, index) => ({
    createdAt: rows[index]?.createdAt.toISOString() ?? "",
    generationId: rows[index]?.id ?? "",
    modelId: row.modelId,
    priceCoins: row.priceCoins,
    seed: row.seed,
  }));

  // Control images are staged once into the first generation's folder so
  // inputs and outputs share a prefix; every model's task reads them from
  // the same keys.
  //
  // Preset poses stage to storage too: the tasks only ever read pose bytes
  // through poseImageKey, so skipping the upload would leave the workflow's
  // pose branch switched off. posePreset still rides along so the row
  // displays the preset's /public path instead of the staged copy.
  const controlId = generations[0]?.generationId;
  const [poseImageKey, referenceImageKey] = await Promise.all([
    controlId && input.poseImage
      ? uploadControlImage(config, controlId, "pose", input.poseImage)
      : undefined,
    controlId && input.referenceImage
      ? uploadControlImage(config, controlId, "reference", input.referenceImage)
      : undefined,
  ]);

  const tag = `req_${requestId}`;
  const payload = {
    enhance: input.enhance,
    generations,
    loras,
    poseImageKey,
    posePreset: input.posePreset,
    prompt: input.prompt,
    ratio: input.ratio,
    referenceImageKey,
    requestId,
    traceHeaders: {},
    userId,
  };

  // Triggered by task id string, not a task import — avoids a handler↔task
  // import cycle and keeps this package's "./server" entry free of
  // "./tasks" imports.
  await tasks.trigger("generate-request", payload, { tags: [tag] });

  // No realtime token here — the client gets one from GET .../generations,
  // which mints a fresh token scoped to every still-pending request. That
  // makes reloads and multiple in-flight batches work the same as the happy
  // path.
  return Response.json({
    generations: generations.map((row) => row.generationId),
    requestId,
  });
};

// --- POST generate/video -----------------------------------------------------

const PNG_SUFFIX = /\.png$/u;

// Turns the source row's public result URL back into its storage keys: the
// clean (unwatermarked) copy first, then the public copy for legacy rows that
// predate the clean sibling.
const sourceImageKeys = (
  config: StudioConfig,
  resultUrl: string
): string[] | undefined => {
  const key = config.storage.keyFromPublicUrl(resultUrl);
  if (!key?.endsWith(".png")) {
    return;
  }
  return [key.replace(PNG_SUFFIX, ".clean.png"), key];
};

const buildGenerateVideoSchema = (durations: number[]) => {
  const allowed = new Set(durations);
  return z.object({
    duration: z
      .number()
      .int()
      .refine((d) => allowed.has(d)),
    // The completed image generation the video animates.
    generationId: z.uuid(),
    // Motion prompt, moderated by the video task before RunPod submit.
    prompt: z.string().min(1),
  });
};

// Starts one image-to-video run from a completed image row.
const handleGenerateVideo = async (
  config: StudioConfig,
  queries: GenerationRepository,
  req: Request
): Promise<Response> => {
  const { video } = config;
  if (!video) {
    return Response.json({ error: "video_not_configured" }, { status: 404 });
  }

  const session = await config.auth.getSession(req);
  if (!session) {
    return new Response("unauthorized", { status: 401 });
  }
  const { userId } = session;

  const parsed = buildGenerateVideoSchema(video.durations).safeParse(
    await req.json()
  );
  if (!parsed.success) {
    return new Response("bad request", { status: 400 });
  }
  const input = parsed.data;

  const source = await queries.getOwned(userId, input.generationId);
  const resultUrl = source?.resultUrls[0];
  if (
    !(source && resultUrl) ||
    source.deletedAt ||
    source.status !== "completed" ||
    source.mediaType !== "image"
  ) {
    return Response.json({ error: "invalid_source" }, { status: 400 });
  }
  const keys = sourceImageKeys(config, resultUrl);
  if (!keys) {
    return Response.json({ error: "invalid_source" }, { status: 400 });
  }

  const priceCoins = config.billing.videoCost(input.duration);
  // A null balance means unlimited (free-mode config) — skip the check.
  const balance = await config.billing.getBalance(userId);
  if (balance !== null && balance < priceCoins) {
    return Response.json(
      { error: "insufficient_funds", topUpUrl: config.billing.topUpUrl },
      { status: 402 }
    );
  }

  const requestId = crypto.randomUUID();
  const [row] = await queries.create([
    {
      durationSeconds: input.duration,
      loras: [],
      mediaType: "video",
      modelId: video.id,
      priceCoins,
      prompt: input.prompt,
      queuedAt: new Date(),
      ratio: source.ratio,
      requestId,
      resolution: "Standard",
      seed: Math.floor(Math.random() * MAX_SEED),
      sourceGenerationId: source.id,
      status: "queued",
      title: source.title ? `${source.title} (Video)` : "Video",
      userId,
    },
  ]);
  if (!row) {
    return new Response("insert failed", { status: 500 });
  }

  const payload = {
    createdAt: row.createdAt.toISOString(),
    durationSeconds: input.duration,
    generationId: row.id,
    modelId: video.id,
    priceCoins,
    prompt: input.prompt,
    requestId,
    seed: row.seed ?? -1,
    sourceImageKeys: keys,
    userId,
  };

  await tasks.trigger(
    "generation-run",
    { ...payload, kind: "video" },
    {
      tags: [`req_${requestId}`, `gen_${row.id}`],
    }
  );
  try {
    await tasks.trigger("generate-title", {
      generationIds: [row.id],
      prompt: input.prompt,
      traceHeaders: {},
      userId,
    });
  } catch (error) {
    // Title generation is a best-effort sidecar and must never fail an
    // otherwise-started video generation.
    console.error("generate-title trigger failed", {
      error,
      generationId: row.id,
    });
  }

  return Response.json({ generationId: row.id, requestId });
};

// --- GET/DELETE generations ---------------------------------------------------

const deleteGenerationsSchema = z.object({
  ids: z.array(z.uuid()).min(1),
});

// The current user's generation history, newest first. Hydrates the Studio
// gallery on load. When rows are still pending, the response also carries a
// realtime token scoped to their `req_<requestId>` tags so the client can
// (re)subscribe — including after a page reload.
const handleListGenerations = async (
  config: StudioConfig,
  queries: GenerationRepository,
  req: Request
): Promise<Response> => {
  const session = await config.auth.getSession(req);
  if (!session) {
    return new Response("unauthorized", { status: 401 });
  }
  const generations = await queries.list(session.userId);
  const realtime = await queries.realtimeInfo(generations);
  return Response.json({ generations, realtime });
};

// Soft-deletes the given generations. Still-pending rows are cancelled first
// (run killed, charge refunded, row marked failed) so the soft-delete's
// pending-status guard then lets them through. Ownership guards live in the
// queries themselves, so ids belonging to other users are silently ignored.
const handleDeleteGenerations = async (
  config: StudioConfig,
  queries: GenerationRepository,
  req: Request
): Promise<Response> => {
  const session = await config.auth.getSession(req);
  if (!session) {
    return new Response("unauthorized", { status: 401 });
  }
  const parsed = deleteGenerationsSchema.safeParse(await req.json());
  if (!parsed.success) {
    return new Response("bad request", { status: 400 });
  }
  await queries.cancel(session.userId, parsed.data.ids);
  const deletedIds = await queries.softDelete(session.userId, parsed.data.ids);
  return Response.json({ deletedIds });
};

// --- GET balance --------------------------------------------------------------

const handleGetBalance = async (
  config: StudioConfig,
  req: Request
): Promise<Response> => {
  const session = await config.auth.getSession(req);
  if (!session) {
    return new Response("unauthorized", { status: 401 });
  }
  const balance = await config.billing.getBalance(session.userId);
  return Response.json({ balance });
};

// --- route table ----------------------------------------------------------

export const createStudioHandlers = (
  config: StudioConfig
): StudioRouteHandlers => {
  const queries = new GenerationRepository(config);

  return {
    DELETE: async (req) => {
      const path = routePath(req);
      if (path === "generations") {
        return await handleDeleteGenerations(config, queries, req);
      }
      return new Response("not found", { status: 404 });
    },
    GET: async (req) => {
      const path = routePath(req);
      if (path === "generations") {
        return await handleListGenerations(config, queries, req);
      }
      if (path === "balance") {
        return await handleGetBalance(config, req);
      }
      return new Response("not found", { status: 404 });
    },
    POST: async (req) => {
      const path = routePath(req);
      if (path === "generate/run") {
        return await handleGenerateRun(config, queries, req);
      }
      if (path === "generate/video") {
        return await handleGenerateVideo(config, queries, req);
      }
      return new Response("not found", { status: 404 });
    },
  };
};
