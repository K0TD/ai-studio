import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";

import { auth } from "../lib/auth";
import { db, pool } from "../lib/db";
import { account, user } from "../lib/db/schema";
import type { GenerationRequest } from "../lib/generation/contracts";
import { generatePost, mediaGet, fileGet } from "../lib/generation/routes";
import {
  createQuote,
  submitGeneration,
  getJob,
} from "../lib/generation/service";
import { settleJob, reconcileJob } from "../lib/generation/settlement";
import { workerTick } from "../lib/generation/worker";
import { routerai, RouterAIError } from "../lib/routerai/client";
import type { AuthUser } from "../lib/security/http";

const testUrl = process.env.TEST_DATABASE_URL;
if (
  testUrl &&
  (testUrl !== process.env.DATABASE_URL ||
    !new URL(testUrl).pathname.endsWith("_test"))
) {
  throw new Error("Dedicated *_test database required");
}
const databaseTests = testUrl ? describe : describe.skip;
const modelId = "black-forest-labs/flux-3-video";
const rawModel = {
  generate_audio: false,
  id: modelId,
  pricing: { seconds: 1 },
  pricing_units: { seconds: "second" },
  supported_aspect_ratios: ["16:9"],
  supported_durations: [5],
  supported_resolutions: ["720p"],
};
const password = "generation-test-password-927";
let admin: AuthUser;
let mediaRootBefore: string | undefined;
const originals = {
  generateVideo: routerai.generateVideo,
  getModels: routerai.getModels,
  getVideoContent: routerai.getVideoContent,
  getVideoStatus: routerai.getVideoStatus,
};

const fixture = async (
  balance = "100.00",
  limit: string | null = null,
  concurrent = 10,
  role: "user" | "admin" = "user"
) => {
  const id = crypto.randomUUID();
  const [owner] = await db
    .insert(user)
    .values({
      activatedAt: new Date(),
      balanceRub: balance,
      email: `${id}@example.invalid`,
      id,
      name: "Generation integration",
      permissions: {
        dailyLimitRub: limit,
        maxConcurrentJobs: concurrent,
        modelIds: [modelId],
        sections: ["video"],
      },
      role,
    })
    .returning();
  await pool.query(
    "INSERT INTO transactions (id,user_id,amount_rub,type,reason,balance_before_rub,balance_after_rub,idempotency_key) VALUES ($1,$2,$3,'test_opening','Тестовый баланс',0,$3,$4)",
    [crypto.randomUUID(), id, balance, `opening:${id}`]
  );
  const chatId = crypto.randomUUID();
  await pool.query(
    "INSERT INTO syntx_chats (id,user_id,title,tab) VALUES ($1,$2,'Тест','video')",
    [chatId, id]
  );
  const request: GenerationRequest = {
    chatId,
    modelId,
    prompt: "Тестовое видео",
    settings: {
      aspectRatio: "16:9",
      duration: 5,
      generateAudio: false,
      resolution: "720p",
    },
    tab: "video",
  };
  return { owner, request };
};
const queued = async (balance = "100.00") => {
  const fixtureData = await fixture(balance);
  const quote = await createQuote(fixtureData.owner, fixtureData.request);
  const item = await submitGeneration(
    fixtureData.owner,
    fixtureData.request,
    quote.id,
    crypto.randomUUID()
  );
  return { ...fixtureData, item, quote };
};
const wallet = async (id: string) => {
  const queryResult1 = await db.select().from(user).where(eq(user.id, id));
  return queryResult1[0];
};
const cookieFor = async (owner: AuthUser) => {
  await db.insert(account).values({
    accountId: owner.id,
    id: crypto.randomUUID(),
    password: await hashPassword(password),
    providerId: "credential",
    userId: owner.id,
  });
  const response = await auth.api.signInEmail({
    asResponse: true,
    body: { email: owner.email, password },
  });
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
};

databaseTests("PostgreSQL generation queue and reservations", () => {
  beforeAll(async () => {
    mediaRootBefore = process.env.MEDIA_ROOT;
    process.env.MEDIA_ROOT = await mkdtemp(
      join(tmpdir(), "studio-generation-")
    );
    const queryResult2 = await fixture("0.00", null, 10, "admin");
    admin = queryResult2.owner;
    await pool.query(
      "INSERT INTO syntx_catalog (id,data,verified_at) VALUES ($1,$2,now()) ON CONFLICT(id) DO UPDATE SET data=excluded.data,verified_at=now()",
      [modelId, JSON.stringify(rawModel)]
    );
    routerai.getModels = () => Promise.resolve([rawModel]);
  });
  afterAll(() => {
    Object.assign(routerai, originals);
    if (mediaRootBefore === undefined) {
      delete process.env.MEDIA_ROOT;
    } else {
      process.env.MEDIA_ROOT = mediaRootBefore;
    }
  });
  test("concurrent duplicate submissions create exactly one job and reserve", async () => {
    const { owner, request } = await fixture();
    const quote = await createQuote(owner, request);
    const key = crypto.randomUUID();
    const items = await Promise.all([
      submitGeneration(owner, request, quote.id, key),
      submitGeneration(owner, request, quote.id, key),
    ]);
    expect(items[0].id).toBe(items[1].id);
    const queryResult3 = await wallet(owner.id);
    expect(queryResult3.reservedRub).toBe("6.00");
    await expect(
      submitGeneration(
        owner,
        { ...request, prompt: "Другое видео" },
        quote.id,
        key
      )
    ).rejects.toMatchObject({ status: 409 });
    await settleJob({ jobId: items[0].id, status: "failed" });
  });
  test("two simultaneous expenses cannot reserve beyond available funds", async () => {
    const { owner, request } = await fixture("10.00");
    const quotes = await Promise.all([
      createQuote(owner, request),
      createQuote(owner, request),
    ]);
    const results = await Promise.allSettled(
      quotes.map((quote) =>
        submitGeneration(owner, request, quote.id, crypto.randomUUID())
      )
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const queryResult4 = await wallet(owner.id);
    expect(queryResult4.reservedRub).toBe("6.00");
    for (const r of results) {
      if (r.status === "fulfilled") {
        await settleJob({ jobId: r.value.id, status: "failed" });
      }
    }
  });
  test("settlement is exactly once and cap variance is paid by the service", async () => {
    const { owner, item } = await queued();
    await Promise.all([
      settleJob({ jobId: item.id, providerCost: "8.00", status: "completed" }),
      settleJob({ jobId: item.id, providerCost: "8.00", status: "completed" }),
    ]);
    const queryResult5 = await wallet(owner.id);
    expect(queryResult5.balanceRub).toBe("94.00");
    const queryResult6 = await wallet(owner.id);
    expect(queryResult6.reservedRub).toBe("0.00");
    const queryResult7 = await pool.query(
      "SELECT * FROM syntx_jobs WHERE id=$1",
      [item.id]
    );
    const [row] = queryResult7.rows;
    expect(row.variance_rub).toBe("2.00");
    const queryResult8 = await pool.query(
      "SELECT count(*)::int AS count FROM transactions WHERE job_id=$1 AND type='generation_cost'",
      [item.id]
    );
    expect(queryResult8.rows[0].count).toBe(1);
  });
  test("zero is actual; missing cost is explicitly estimated; failed provider cost is service expense", async () => {
    const a = await queued();
    await settleJob({ jobId: a.item.id, providerCost: 0, status: "completed" });
    const queryResult9 = await getJob(a.owner.id, a.item.id);
    expect(queryResult9.chargedCostRub).toBe("0.00");
    const queryResult10 = await getJob(a.owner.id, a.item.id);
    expect(queryResult10.pricingSource).toBe("actual");
    const b = await queued();
    await settleJob({ jobId: b.item.id, status: "completed" });
    const queryResult11 = await getJob(b.owner.id, b.item.id);
    expect(queryResult11.chargedCostRub).toBe("5.00");
    const queryResult12 = await getJob(b.owner.id, b.item.id);
    expect(queryResult12.pricingSource).toBe("estimated");
    const c = await queued();
    await settleJob({
      jobId: c.item.id,
      providerCost: "3.00",
      status: "failed",
    });
    const queryResult13 = await wallet(c.owner.id);
    expect(queryResult13.balanceRub).toBe("100.00");
    const queryResult14 = await wallet(c.owner.id);
    expect(queryResult14.reservedRub).toBe("0.00");
    const queryResult15 = await pool.query(
      "SELECT variance_rub FROM syntx_jobs WHERE id=$1",
      [c.item.id]
    );
    expect(queryResult15.rows[0].variance_rub).toBe("3.00");
  });
  test("permissions, bans, quote ownership, expiry and daily limit are checked on submit", async () => {
    const a = await fixture();
    const quote = await createQuote(a.owner, a.request);
    const other = await fixture();
    await expect(
      submitGeneration(
        other.owner,
        { ...a.request, chatId: other.request.chatId },
        quote.id,
        crypto.randomUUID()
      )
    ).rejects.toMatchObject({ status: 409 });
    await db
      .update(user)
      .set({ isBanned: true })
      .where(eq(user.id, a.owner.id));
    await expect(
      submitGeneration(a.owner, a.request, quote.id, crypto.randomUUID())
    ).rejects.toMatchObject({ status: 403 });
    const exp = await fixture();
    const old = await createQuote(exp.owner, exp.request);
    await pool.query(
      "UPDATE syntx_quotes SET expires_at=now()-interval '1 second' WHERE id=$1",
      [old.id]
    );
    await expect(
      submitGeneration(exp.owner, exp.request, old.id, crypto.randomUUID())
    ).rejects.toMatchObject({ status: 409 });
    const limited = await fixture("100.00", "5.00");
    const q = await createQuote(limited.owner, limited.request);
    await expect(
      submitGeneration(
        limited.owner,
        limited.request,
        q.id,
        crypto.randomUUID()
      )
    ).rejects.toMatchObject({ code: "DAILY_LIMIT" });
  });
  test("worker persists provider result and private artifact before final settlement", async () => {
    const { owner, item } = await queued();
    let submitted = 0;
    routerai.generateVideo = () => {
      submitted += 1;
      return Promise.resolve({ id: "provider-test", status: "pending" });
    };
    routerai.getVideoStatus = () =>
      Promise.resolve({
        id: "provider-test",
        status: "completed",
        unsigned_urls: ["protected"],
        usage: { cost: 4 },
      });
    routerai.getVideoContent = () =>
      Promise.resolve(
        new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), {
          headers: { "Content-Type": "video/mp4" },
        })
      );
    await workerTick();
    const done = await getJob(owner.id, item.id);
    expect(submitted).toBe(1);
    expect(done.status).toBe("completed");
    expect(done.outputUrls).toHaveLength(1);
    const queryResult16 = await wallet(owner.id);
    expect(queryResult16.balanceRub).toBe("96.00");
    const stranger = await fixture();
    const cookie = await cookieFor(stranger.owner);
    const artifactId = done.outputUrls[0].split("/").at(-1);
    if (!artifactId) {
      throw new Error("Missing artifact identifier");
    }
    const queryResult17 = await mediaGet(
      new Request(`http://localhost:3000/api/k0td-ai/media/${artifactId}`, {
        headers: { Cookie: cookie },
      }),
      { params: Promise.resolve({ id: artifactId }) }
    );
    expect(queryResult17.status).toBe(404);
    const ownCookie = await cookieFor(owner);
    const response = await mediaGet(
      new Request(`http://localhost:3000/api/k0td-ai/media/${artifactId}`, {
        headers: { Cookie: ownCookie, Range: "bytes=0-3" },
      }),
      { params: Promise.resolve({ id: artifactId }) }
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("content-length")).toBe("4");
    const queryResult18 = await response.arrayBuffer();
    expect(queryResult18.byteLength).toBe(4);
    await expect(getJob(stranger.owner.id, item.id)).rejects.toMatchObject({
      status: 404,
    });
  });
  test("uncertain submissions hold their reserve, are never resubmitted and can only be released by a current admin", async () => {
    const { owner, item } = await queued();
    let submitted = 0;
    routerai.generateVideo = () => {
      submitted += 1;
      return Promise.reject(new RouterAIError("timeout", 502, undefined, true));
    };
    await workerTick();
    await workerTick();
    expect(submitted).toBe(1);
    const queryResult19 = await getJob(owner.id, item.id);
    expect(queryResult19.status).toBe("reconciling");
    const queryResult20 = await wallet(owner.id);
    expect(queryResult20.reservedRub).toBe("6.00");
    await expect(
      reconcileJob({
        action: "release",
        actorId: owner.id,
        jobId: item.id,
        reason: "Проверено в личном кабинете",
      })
    ).rejects.toMatchObject({ status: 403 });
    await reconcileJob({
      action: "release",
      actorId: admin.id,
      jobId: item.id,
      reason: "Провайдер подтвердил отсутствие расхода",
    });
    const queryResult21 = await wallet(owner.id);
    expect(queryResult21.reservedRub).toBe("0.00");
    const queryResult22 = await wallet(owner.id);
    expect(queryResult22.balanceRub).toBe("100.00");
  });
  test("fake cookies cannot call generation or private file endpoints", async () => {
    const request = new Request("http://localhost:3000/api/k0td-ai/generate", {
      headers: {
        Cookie: "better-auth.session_token=fake",
        Origin: "http://localhost:3000",
      },
      method: "POST",
    });
    const queryResult23 = await generatePost(request);
    expect(queryResult23.status).toBe(401);
    const queryResult24 = await fileGet(
      new Request("http://localhost:3000/api/k0td-ai/files/x/content"),
      { params: Promise.resolve({ id: crypto.randomUUID() }) }
    );
    expect(queryResult24.status).toBe(401);
  });
});
