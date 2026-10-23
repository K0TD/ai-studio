import assert from "node:assert/strict";
import { mkdir, rmdir } from "node:fs/promises";
import { join } from "node:path";

import { eq } from "drizzle-orm";

import { synchronizeAdmin } from "../../lib/admin/bootstrap";
import { auth } from "../../lib/auth";
import { db, pool } from "../../lib/db";
import { user } from "../../lib/db/active-schema";
import { ensureDatabase } from "../../lib/db/auto-migrate";
import { migrateSchema } from "../../lib/db/migrations";
import type { GenerationRequest } from "../../lib/generation/contracts";
import { adminJobsGet } from "../../lib/generation/routes";
import type { JobRow } from "../../lib/generation/rows";
import {
  createQuote,
  getJob,
  listJobs,
  submitGeneration,
} from "../../lib/generation/service";
import { settleJob } from "../../lib/generation/settlement";
import {
  releaseConfirmedImageFailures,
  releaseExpiredUnconfirmedSubmissions,
  workerTick,
} from "../../lib/generation/worker";
import { routerai, RouterAIError } from "../../lib/routerai/client";
import type { ProviderModel } from "../../lib/routerai/responses";
import { adminRowsResponseSchema } from "../../lib/store/admin-contracts";

const imageModel = "black-forest-labs/flux-3-image";
const videoModel = "black-forest-labs/flux-3-video";
const speechModel = "elevenlabs/eleven-turbo-v2.5";
const imageData =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5ioAAAAASUVORK5CYII=";
const models: ProviderModel[] = [
  {
    id: imageModel,
    image_pricing: [{ price: 4, unit: "image", variant: null }],
    max_image_count: 1,
    pricing: {},
    pricing_units: {},
    supported_aspect_ratios: ["1:1"],
    supported_image_sizes: ["1K"],
  },
  {
    id: videoModel,
    pricing: { seconds: 1 },
    pricing_units: { seconds: "second" },
    supported_aspect_ratios: ["16:9"],
    supported_durations: [5],
    supported_resolutions: ["720p"],
  },
  {
    id: speechModel,
    pricing: { prompt: 0.1 },
    pricing_units: { prompt: "character" },
  },
];
routerai.getModels = () => Promise.resolve(models);
let posts = 0;
let responseMode:
  | "success"
  | "empty"
  | "timeout"
  | "video"
  | "video-uncertain" = "success";
const providerResponse = (path: string, init: RequestInit = {}) => {
  if (path === "/generation?id=gen-speech") {
    return Response.json({ total_cost: 0.12 });
  }
  if (path.endsWith("/endpoints")) {
    let model = imageModel;
    if (path.includes("elevenlabs")) {
      model = speechModel;
    } else if (path.includes("flux-3-video")) {
      model = videoModel;
    }
    let supportedApi = "/images";
    if (model === speechModel) {
      supportedApi = "/audio/speech";
    } else if (model === videoModel) {
      supportedApi = "/videos";
    }
    return Response.json({
      data: {
        endpoints: [
          {
            name: "Fixture endpoint",
            pricing: { image: 4, prompt: 0.1, seconds: 8.8 },
            pricing_units: {
              image: "image",
              prompt: "character",
              seconds: "second",
            },
            provider_name: "Fixture provider",
            status: 1,
            supported_apis: [supportedApi],
            supported_parameters: [],
            tag: "fixture-provider",
          },
        ],
        id: model,
      },
    });
  }
  if (init.method === "POST") {
    posts += 1;
    if (process.argv[2] === "resume") {
      throw new Error("Paid POST repeated after restart");
    }
    if (responseMode === "video-uncertain") {
      throw new RouterAIError(
        "Fixture lost response after provider accepted video",
        502,
        undefined,
        true,
        { generationId: "video-fixture" }
      );
    }
    if (responseMode === "timeout") {
      throw new RouterAIError("Fixture lost response", 502, undefined, true);
    }
    if (path === "/audio/speech") {
      return new Response("fixture mp3 bytes", {
        headers: {
          "Content-Type": "audio/mpeg",
          "X-Generation-Id": "gen-speech",
        },
      });
    }
    if (responseMode === "video") {
      return Response.json({ id: "video-fixture", status: "in_progress" });
    }
    return Response.json(
      responseMode === "empty"
        ? { data: [], id: "gen-empty", usage: { cost: 3.4 } }
        : {
            data: [{ b64_json: imageData }],
            id: "gen-image",
            usage: { cost: 3.4 },
          }
    );
  }
  if (path === "/videos/video-fixture") {
    return Response.json({
      id: "video-fixture",
      status: "completed",
      usage: { cost: 105.46 },
    });
  }
  if (path.startsWith("/videos/video-fixture/content")) {
    return new Response("fixture mp4 bytes", {
      headers: { "Content-Type": "video/mp4" },
    });
  }
  throw new Error(`Unexpected provider request: ${path}`);
};

routerai.request = (path, init) =>
  Promise.resolve(providerResponse(path, init));
const mediaRoot = process.env.MEDIA_ROOT;
if (!mediaRoot) {
  throw new Error("Missing fixture media root");
}

const fixture = async (tab: "image" | "video" | "audio" = "image") => {
  const id = crypto.randomUUID();
  const [owner] = await db
    .insert(user)
    .values({
      activatedAt: new Date(),
      balanceRub: "100.00",
      email: `${id}@example.invalid`,
      id,
      name: "Worker fixture",
      permissions: {
        dailyLimitRub: null,
        maxConcurrentJobs: 10,
        modelIds: [],
        sections: ["video", "image", "audio"],
      },
      role: "admin",
    })
    .returning();
  await pool.query(
    "INSERT INTO transactions (id,user_id,amount_rub,type,reason,balance_before_rub,balance_after_rub,idempotency_key) VALUES ($1,$2,'100.00','topup','fixture','0.00','100.00',$3)",
    [crypto.randomUUID(), id, `opening:${id}`]
  );
  const chatId = crypto.randomUUID();
  await pool.query(
    "INSERT INTO syntx_chats (id,user_id,title,tab) VALUES ($1,$2,'fixture',$3)",
    [chatId, id, tab]
  );
  const request: GenerationRequest = {
    chatId,
    modelId: { audio: speechModel, image: imageModel, video: videoModel }[tab],
    prompt: "Fixture",
    settings: {},
    tab,
  };
  const quote = await createQuote(owner, request);
  const key = crypto.randomUUID();
  const [item, duplicate] = await Promise.all([
    submitGeneration(owner, request, quote.id, key),
    submitGeneration(owner, request, quote.id, key),
  ]);
  assert.equal(item.id, duplicate.id);
  return { item, owner };
};
const assertWallet = async (id: string, balance: string, reserve: string) => {
  const [account] = await db.select().from(user).where(eq(user.id, id));
  assert.equal(account.balanceRub, balance);
  assert.equal(account.reservedRub, reserve);
};
const assertJobStatus = async (
  ownerId: string,
  jobId: string,
  status: string
) => {
  const item = await getJob(ownerId, jobId);
  assert.equal(item.status, status);
};
const jobRow = async (id: string) => {
  const { rows } = await pool.query<JobRow>(
    "SELECT * FROM syntx_jobs WHERE id=$1",
    [id]
  );
  const [job] = rows;
  return job;
};

const assertAdminJobResponse = async (
  completedId: string,
  uncertainId: string
) => {
  const password = "worker-admin-fixture-password-725";
  const username = "worker_fixture_admin";
  await synchronizeAdmin({
    email: "worker-admin@example.invalid",
    login: username,
    password,
  });
  const login = await auth.api.signInUsername({
    asResponse: true,
    body: { password, username },
  });
  assert.equal(login.status, 200);
  const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  assert.ok(cookie);
  const response = await adminJobsGet(
    new Request("http://localhost:3000/api/k0td-ai/admin/jobs", {
      headers: { Cookie: cookie },
    })
  );
  assert.equal(response.status, 200);
  const data = adminRowsResponseSchema.parse(await response.json());
  const completed = data.items?.find((item) => item.id === completedId);
  const uncertain = data.items?.find((item) => item.id === uncertainId);
  assert.ok(completed);
  assert.ok(uncertain);
  assert.ok(completed.submittedAt);
  assert.ok(completed.settledAt);
  assert.equal(completed.status, "completed");
  assert.equal(completed.varianceRub, "0.00");
  assert.ok(uncertain.submittedAt);
  assert.equal(uncertain.settledAt, null);
  assert.equal(uncertain.varianceRub, null);
  assert.equal(uncertain.status, "reconciling");
};

try {
  if (process.argv[2] === "resume") {
    await workerTick();
    const result = await pool.query(
      "SELECT status FROM syntx_jobs WHERE id=$1",
      [process.argv[3]]
    );
    assert.equal(result.rows[0].status, "completed");
    assert.equal(posts, 0);
    console.info("generation.resume_success");
  } else {
    await migrateSchema();
    await mkdir(mediaRoot, { recursive: true });
    const successful = await fixture();
    await workerTick();
    assert.equal(posts, 1);
    const completed = await getJob(successful.owner.id, successful.item.id);
    assert.equal(completed.status, "completed");
    assert.equal(completed.chargedCostRub, "3.40");
    assert.equal(completed.outputUrls.length, 1);
    const history = await listJobs(successful.owner.id, {
      chatId: successful.item.chatId,
    });
    const visibleResult = history.items.find(
      (item) => item.id === successful.item.id
    );
    assert.equal(visibleResult?.status, "completed");
    assert.equal(visibleResult?.stage, "completed");
    assert.ok(visibleResult?.updatedAt);
    assert.equal(visibleResult?.outputUrls.length, 1);
    await assertWallet(successful.owner.id, "96.60", "0.00");
    await settleJob({
      jobId: successful.item.id,
      providerCost: 3.4,
      status: "completed",
    });
    await assertWallet(successful.owner.id, "96.60", "0.00");

    responseMode = "empty";
    const empty = await fixture();
    await workerTick();
    const emptyRow = await jobRow(empty.item.id);
    assert.equal(emptyRow.status, "failed");
    assert.equal(emptyRow.provider_cost_rub, "3.40");
    assert.equal(emptyRow.charged_cost_rub, "0.00");
    await assertWallet(empty.owner.id, "100.00", "0.00");
    await ensureDatabase();
    assert.equal(posts, 2);

    const legacyEmpty = await fixture();
    await pool.query(
      "UPDATE syntx_jobs SET status='reconciling',provider_id='gen-legacy-empty',provider_result=$2 WHERE id=$1",
      [
        legacyEmpty.item.id,
        JSON.stringify({
          diagnostic: { endpoint: "/images", status: 200 },
          generationId: "gen-legacy-empty",
        }),
      ]
    );
    await releaseConfirmedImageFailures();
    const releasedLegacyRow = await jobRow(legacyEmpty.item.id);
    assert.equal(releasedLegacyRow.status, "failed");
    await assertWallet(legacyEmpty.owner.id, "100.00", "0.00");
    assert.equal(posts, 2);

    const abandoned = await fixture();
    await pool.query(
      "UPDATE syntx_jobs SET status='submitting',submitted_at=now()-interval '10 minutes',leased_until=now()-interval '1 second',lease_token='expired' WHERE id=$1",
      [abandoned.item.id]
    );
    await workerTick();
    await assertJobStatus(abandoned.owner.id, abandoned.item.id, "reconciling");
    await assertWallet(abandoned.owner.id, "100.00", "4.80");
    assert.equal(posts, 2);

    responseMode = "timeout";
    const uncertain = await fixture();
    await workerTick();
    await assertJobStatus(uncertain.owner.id, uncertain.item.id, "reconciling");
    await assertWallet(uncertain.owner.id, "100.00", "4.80");
    assert.equal(posts, 3);
    await assertAdminJobResponse(successful.item.id, uncertain.item.id);
    await releaseExpiredUnconfirmedSubmissions();
    const recentUncertainRow = await jobRow(uncertain.item.id);
    assert.equal(recentUncertainRow.status, "reconciling");
    await assertWallet(uncertain.owner.id, "100.00", "4.80");
    await pool.query(
      "UPDATE syntx_jobs SET updated_at=now()-interval '20 minutes' WHERE id=$1",
      [uncertain.item.id]
    );
    await releaseExpiredUnconfirmedSubmissions();
    const expiredUncertainRow = await jobRow(uncertain.item.id);
    assert.equal(expiredUncertainRow.status, "failed");
    await assertWallet(uncertain.owner.id, "100.00", "0.00");

    const uncertainImageWithId = await fixture();
    await pool.query(
      "UPDATE syntx_jobs SET status='reconciling',provider_id='image-no-result',provider_result=$2,updated_at=now()-interval '20 minutes' WHERE id=$1",
      [
        uncertainImageWithId.item.id,
        JSON.stringify({
          diagnostic: { endpoint: "/images", outputCount: 0, status: 502 },
          generationId: "image-no-result",
        }),
      ]
    );
    await releaseExpiredUnconfirmedSubmissions();
    await assertJobStatus(
      uncertainImageWithId.owner.id,
      uncertainImageWithId.item.id,
      "failed"
    );
    await assertWallet(uncertainImageWithId.owner.id, "100.00", "0.00");

    responseMode = "success";
    const speech = await fixture("audio");
    await workerTick();
    await assertJobStatus(speech.owner.id, speech.item.id, "completed");
    await assertWallet(speech.owner.id, "99.88", "0.00");
    const speechItem = await getJob(speech.owner.id, speech.item.id);
    assert.equal(speechItem.chargedCostRub, "0.12");
    assert.equal(speechItem.pricingSource, "actual");
    assert.equal(posts, 4);

    responseMode = "video";
    const video = await fixture("video");
    assert.equal(video.item.estimatedCostRub, "44.00");
    assert.equal(video.item.reserveCostRub, "52.80");
    await workerTick();
    await assertJobStatus(video.owner.id, video.item.id, "completed");
    await assertWallet(video.owner.id, "-5.46", "0.00");
    const billedVideo = await getJob(video.owner.id, video.item.id);
    assert.equal(billedVideo.chargedCostRub, "105.46");
    assert.equal(billedVideo.pricingSource, "actual");
    assert.equal(posts, 5);

    responseMode = "video-uncertain";
    const uncertainVideo = await fixture("video");
    await workerTick();
    const uncertainVideoJob = await jobRow(uncertainVideo.item.id);
    assert.equal(uncertainVideoJob.status, "reconciling");
    assert.equal(uncertainVideoJob.provider_id, "video-fixture");
    const activeJobs = await listJobs(uncertainVideo.owner.id, {
      activeOnly: true,
    });
    assert.ok(
      activeJobs.items.some((item) => item.id === uncertainVideo.item.id)
    );
    await workerTick();
    await assertJobStatus(
      uncertainVideo.owner.id,
      uncertainVideo.item.id,
      "completed"
    );
    await assertWallet(uncertainVideo.owner.id, "-5.46", "0.00");
    assert.equal(posts, 6);

    responseMode = "success";
    const retry = await fixture();
    const blocked = join(mediaRoot, "image", retry.item.id, "0.bin");
    await mkdir(blocked, { recursive: true });
    await workerTick();
    const retryRow = await jobRow(retry.item.id);
    assert.equal(retryRow.status, "persisting");
    assert.equal(posts, 7);
    await rmdir(blocked);
    await pool.query("UPDATE syntx_jobs SET poll_at=now() WHERE id=$1", [
      retry.item.id,
    ]);
    await pool.end();
    const child = Bun.spawn(
      [process.execPath, import.meta.path, "resume", retry.item.id],
      { stderr: "pipe", stdout: "pipe" }
    );
    const [code, output, errors] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    assert.equal(code, 0, `${output}\n${errors}`);
    assert.ok(output.includes("generation.resume_success"));
    await assertWallet(retry.owner.id, "96.60", "0.00");
    console.info("generation.sqlite_success");
  }
} finally {
  await pool.end();
}
