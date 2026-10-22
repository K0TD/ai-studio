// Demo StudioConfig: guest billing, open
// moderation, one SFW Krea 2 image model (with style loras + identity-edit
// reference support) and an LTX 2.3 image-to-video model, OpenAI-backed
// prompt enhancement and titling, no watermark spec, no notify hook.
//
// No "server-only" import guard, matching the package's own handlers.ts: the
// same config module is imported by both Next route handlers and
// trigger/studio.ts, and Trigger.dev's esbuild bundler doesn't set the
// "react-server" condition server-only relies on.

import { openai } from "@ai-sdk/openai";
import { allowAllModeration, r2Storage } from "@two-71/studio";
import type {
  AuthAdapter,
  BillingProvider,
  DbClient,
  StudioConfig,
  StudioModel,
  VideoModelSpec,
} from "@two-71/studio";
import { and, count, eq, gte } from "drizzle-orm";

import { db, studioDb } from "@/lib/db";
import { generation } from "@/lib/db/schema";
import {
  ensureGuestUser,
  GUEST_DAILY_LIMIT,
  guestFromHeaders,
} from "@/lib/guest";

import krea2Graph from "./workflows/krea2.json";
import ltx23Graph from "./workflows/ltx2-3.json";

// Account mode (uncomment to restore better-auth logins — see the matching
// commented blocks in app/studio/page.tsx and app/studio/studio-client.tsx;
// also swap `billing` back to the package's `freeBilling`):
// import { freeBilling } from "@two-71/studio";
// import { auth } from "@/lib/auth";

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
};

// Account mode: AuthAdapter wraps better-auth's session lookup (the package
// never bundles better-auth itself). `req.headers` carries the
// session cookie the same way a Server Component's `headers()` would.
// const authAdapter: AuthAdapter = {
//   async getSession(req) {
//     const session = await auth.api.getSession({ headers: req.headers });
//     return session ? { userId: session.user.id } : null;
//   },
// };

// Guest mode: no session — every request resolves to the salted-IP guest
// identity (lib/guest.ts), so the studio is usable with zero signup.
const guestAuthAdapter: AuthAdapter = {
  async getSession(req) {
    const guest = guestFromHeaders(req.headers);
    await ensureGuestUser(guest);
    return { userId: guest.id };
  },
};

// Guest rate limit, expressed as billing (1 coin per generation, balance =
// what's left of today's quota): staying on the package's billing seam means
// over-quota requests get the native insufficient-funds error and the header
// pill shows generations remaining — no custom middleware. `charge` is a
// no-op because the generation rows themselves are the ledger; that also
// means failed generations count against the quota, which is fine here.
const guestBilling: BillingProvider = {
  charge: () => Promise.resolve("ok" as const),
  coinName: "generations",
  costFor: () => 1,
  async getBalance(userId) {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const [row] = await db
      .select({ used: count() })
      .from(generation)
      .where(
        and(
          eq(generation.userId, userId),
          gte(generation.createdAt, startOfToday)
        )
      );
    return Math.max(0, GUEST_DAILY_LIMIT - (row?.used ?? 0));
  },
  refund: () => Promise.resolve(),
  videoCost: () => 1,
};

// Official Krea 2 (turbo fp8) text-to-image with two SFW style loras,
// identity-edit reference support, and depth-map pose control (preset depth
// maps in public/poses). See the endpoint's Dockerfile for the exact model
// files.
const krea2: StudioModel = {
  description: "Latest image generation model.",
  id: "krea-2",
  loras: [
    {
      file: "lenovo_krea2.safetensors",
      id: "ultrareal",
      name: "UltraReal",
      triggerWords: "photo, amateur photography",
    },
    {
      file: "phone_photography_2025_krea2.safetensors",
      id: "phone-photography",
      name: "Phone Photography",
      triggerWords: "phone photo",
    },
  ],
  name: "Krea 2",
  poses: [
    {
      controlImageUrl: "/poses/crossed-legs-on-floor.png",
      id: "crossed-legs-on-floor",
      name: "Crossed Legs on Floor",
    },
    {
      controlImageUrl: "/poses/sitting-on-stairs.png",
      id: "sitting-on-stairs",
      name: "Sitting on Stairs",
    },
  ],
  ratios: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"],
  resolutions: ["Standard"],
  workflow: {
    graph: krea2Graph,
    nodes: {
      aspectRatio: { input: "aspect_ratio", node: "40" },
      loraLoader: { node: "9" },
      poseImage: { input: "image", node: "11" },
      poseToggle: { input: "value", node: "1" },
      prompt: { input: "value", node: "4" },
      referenceImage: { input: "image", node: "19" },
      // Identity-edit lora rides in the same power-loader; enabled only
      // when a reference image is attached. Selected LoRAs are appended to
      // the loader as extra slots at request build time.
      referenceLoraToggle: { input: "lora_1", node: "9" },
      referenceToggle: { input: "value", node: "2" },
      seed: { input: "seed", node: "5" },
    },
  },
};

// LTX 2.3 (distilled, split files) image-to-video, single pass, silent.
// The mxSlider frame-count node feeds a +1 math node so the sampler sees
// the 8n+1 frame count LTX expects.
const ltx23: VideoModelSpec = {
  durations: [3, 5],
  fps: 24,
  id: "ltx-2-3",
  workflow: {
    graph: ltx23Graph,
    nodes: {
      framesNode: { input: "Xi", node: "796" },
      prompt: { input: "text", node: "536" },
      seed: { input: "seed", node: "524" },
      sourceImage: { input: "image", node: "837" },
    },
  },
};

// Prompt enhancement and gallery titles run inside the package: it only needs
// a Vercel AI SDK model (the provider carries the API key) and, optionally, a
// system prompt overriding the package default. Both features are gated on
// OPENAI_API_KEY so the demo still runs without an OpenAI account — without
// it the enhance toggle stays hidden and titles fall back to a prompt excerpt.
const promptModel = process.env.OPENAI_API_KEY
  ? openai("gpt-5-mini")
  : undefined;
const prompts = promptModel
  ? { enhance: { model: promptModel }, title: { model: promptModel } }
  : undefined;

export const studioConfig: StudioConfig = {
  // Account mode: authAdapter
  auth: guestAuthAdapter,
  // Account mode: freeBilling
  billing: guestBilling,
  branding: {
    siteName: "2.71",
  },
  db: studioDb as unknown as DbClient,
  models: [krea2],
  moderation: allowAllModeration,
  prompts,
  runpod: {
    apiKey: requireEnv("RUNPOD_API_KEY"),
    endpoints: {
      "krea-2": requireEnv("RUNPOD_ENDPOINT_ID"),
      "ltx-2-3": requireEnv("RUNPOD_VIDEO_ENDPOINT_ID"),
    },
  },
  storage: r2Storage({
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    accountId: requireEnv("R2_ACCOUNT_ID"),
    bucket: requireEnv("R2_BUCKET"),
    publicUrl: requireEnv("R2_PUBLIC_URL"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
  }),
  video: ltx23,
};
