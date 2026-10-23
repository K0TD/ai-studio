import assert from "node:assert/strict";
import { test } from "node:test";

import type { ModelMetadata } from "../routerai/types";
import { safeRubSchema, safeSignedRubSchema } from "./client-contracts";
import {
  safeCallbackUrl,
  sectionAllowed,
  modelAllowed,
  validQuote,
  normalizeRubInput,
} from "./client-policy";
import { useK0tdStore } from "./k0td-store";
test("login callback stays on the application origin", () => {
  assert.equal(safeCallbackUrl("/admin?tab=users"), "/admin?tab=users");
  for (const value of [
    undefined,
    "https://evil.invalid",
    "//evil.invalid",
    "/\\evil.invalid",
    "/\n/evil.invalid",
    "/%5cevil.invalid",
    "/%2Fevil.invalid",
  ]) {
    assert.equal(safeCallbackUrl(value), "/");
  }
});
test("VIP and admins have model access, ordinary users retain budget and explicit access", () => {
  const model: ModelMetadata = {
    basePriceRub: 1,
    category: "video",
    id: "m",
    name: "Video model",
    priceUnit: "request",
    provider: "test",
  };
  const user = {
    isApproved: true,
    isBanned: false,
    permissions: { modelIds: [], sections: ["video"] },
    role: "user",
  };
  assert.equal(modelAllowed(user, model), false);
  assert.equal(modelAllowed({ ...user, role: "vip" }, model), true);
  assert.equal(modelAllowed({ ...user, role: "admin" }, model), true);
  assert.equal(
    modelAllowed(
      { ...user, permissions: { ...user.permissions, modelIds: ["m"] } },
      model
    ),
    true
  );
  assert.equal(modelAllowed(user, { ...model, id: "alibaba/wan-2.1" }), true);
  assert.equal(sectionAllowed(user, "image"), false);
  for (const role of ["user", "vip", "admin"]) {
    assert.equal(modelAllowed({ ...user, isBanned: true, role }, model), false);
    assert.equal(
      modelAllowed({ ...user, isApproved: false, role }, model),
      false
    );
  }
  assert.equal(modelAllowed(null, model), false);
  assert.equal(modelAllowed(user), false);
});
test("quote requires valid expiry and enough funds for maximum reserve", () => {
  const now = Date.parse("2026-10-22T00:00:00Z");
  const quote = { expiresAt: "2026-10-22T00:01:00Z", reserveCostRub: "15.00" };
  assert.equal(validQuote(quote, "15.00", now), true);
  assert.equal(validQuote(quote, "14.99", now), false);
  assert.equal(validQuote(quote, "15.00", now + 60_000), false);
  assert.equal(
    validQuote({ ...quote, expiresAt: "invalid" }, "100.00", now),
    false
  );
  assert.equal(
    validQuote({ ...quote, reserveCostRub: "Infinity" }, "100.00", now),
    false
  );
  assert.equal(
    validQuote({ ...quote, reserveCostRub: "0.00" }, "100.00", now),
    false
  );
  assert.equal(validQuote(null, "100.00", now), false);
});
test("money input preserves exact decimal strings for credits and withdrawals", () => {
  assert.equal(safeRubSchema.parse(12.5), "12.50");
  assert.equal(safeRubSchema.parse("12"), "12.00");
  assert.equal(safeSignedRubSchema.parse("-12.5"), "-12.50");
  assert.equal(safeRubSchema.safeParse("-1.00").success, false);
  for (const invalid of [Number.NaN, Infinity, "1.001", "01.00", {}, null]) {
    assert.equal(safeRubSchema.safeParse(invalid).success, false);
    assert.equal(safeSignedRubSchema.safeParse(invalid).success, false);
  }
  assert.equal(normalizeRubInput("1000"), "1000.00");
  assert.equal(normalizeRubInput("-500.5"), "-500.50");
  assert.equal(normalizeRubInput("0001.01"), "1.01");
  for (const value of ["Infinity", "1e3", "1.001", "--5", "", "99999999999"]) {
    assert.throws(() => normalizeRubInput(value));
  }
});

const originalStore = useK0tdStore.getState();
const chatId = "630ef7d8-d7fe-4255-986a-c0b9de0ceeed";
const createdAt = "2026-10-23T00:00:00.000Z";
const fixtureModel = {
  available: true,
  basePriceRub: 1,
  category: "video" as const,
  enabled: true,
  id: "video-model",
  name: "Видео",
  priceUnit: "second" as const,
  provider: "test",
  supportedDurations: [5],
  supportedResolutions: ["720p"],
};
const fixtureAccount = {
  availableRub: "100.00",
  balanceRub: "100.00",
  email: "admin@example.invalid",
  id: "account",
  isApproved: true,
  isBanned: false,
  name: "Admin",
  permissions: {
    dailyLimitRub: null,
    maxConcurrentJobs: 3,
    modelIds: [],
    sections: ["video", "image", "audio"],
  },
  reservedRub: "0.00",
  role: "admin",
};
const fixtureChat = {
  createdAt,
  id: chatId,
  tab: "video" as const,
  title: "Видео",
};
const fixtureJob = {
  chatId,
  costRub: 1,
  createdAt,
  id: "fa34bc64-ee58-4102-9977-063b9f349e7b",
  modelId: fixtureModel.id,
  outputUrls: [],
  prompt: "Сохраненный промпт",
  stage: "running" as const,
  status: "pending" as const,
  tab: "video" as const,
  updatedAt: createdAt,
};
const nativeFetch = globalThis.fetch;
const mockFetch = (
  handler: (input: Parameters<typeof fetch>[0]) => Promise<Response>
): typeof fetch =>
  Object.assign(handler, { preconnect: nativeFetch.preconnect });
const fixtureCatalog = { audio: [], image: [], video: [fixtureModel] };
const fixtureFetch = (catalog = fixtureCatalog): typeof fetch =>
  mockFetch((input) => {
    const path = String(input).split("?")[0].split("/").at(-1) ?? "";
    switch (path) {
      case "me": {
        return Promise.resolve(Response.json({ user: fixtureAccount }));
      }
      case "models": {
        return Promise.resolve(Response.json(catalog));
      }
      case "chats": {
        return Promise.resolve(Response.json({ chats: [fixtureChat] }));
      }
      case "jobs": {
        return Promise.resolve(
          Response.json({ items: [fixtureJob], nextCursor: null })
        );
      }
      default: {
        return Promise.reject(new Error(`Unexpected request: ${path}`));
      }
    }
  });

test("temporary refresh failures preserve history, chat, balance and draft, then recover", async () => {
  const previousFetch = globalThis.fetch;
  try {
    useK0tdStore.setState(originalStore, true);
    globalThis.fetch = fixtureFetch();
    await useK0tdStore.getState().refreshServer();
    useK0tdStore.getState().setPrompt("Черновик");
    const failures = [
      mockFetch(() => Promise.reject(new Error("network unavailable"))),
      mockFetch(() =>
        Promise.resolve(
          Response.json({ error: "Temporary failure" }, { status: 500 })
        )
      ),
    ];
    for (const failedFetch of failures) {
      globalThis.fetch = failedFetch;
      await useK0tdStore.getState().refreshServer();
      const state = useK0tdStore.getState();
      assert.equal(state.serverReady, true);
      assert.ok(state.serverError);
      assert.equal(state.prompt, "Черновик");
      assert.equal(state.history[0]?.id, fixtureJob.id);
      assert.equal(state.activeChatId, chatId);
      assert.equal(state.balanceRub, 100);
    }
    globalThis.fetch = fixtureFetch();
    await useK0tdStore.getState().refreshServer();
    assert.equal(useK0tdStore.getState().serverError, null);
    assert.equal(useK0tdStore.getState().prompt, "Черновик");
  } finally {
    globalThis.fetch = previousFetch;
    useK0tdStore.setState(originalStore, true);
  }
});

test("catalog refresh does not replace a selected model that becomes unavailable", async () => {
  const previousFetch = globalThis.fetch;
  try {
    useK0tdStore.setState(originalStore, true);
    globalThis.fetch = fixtureFetch();
    await useK0tdStore.getState().refreshServer();
    globalThis.fetch = fixtureFetch({
      audio: [],
      image: [],
      video: [
        { ...fixtureModel, enabled: false },
        { ...fixtureModel, id: "another-model" },
      ],
    });
    await useK0tdStore.getState().refreshServer();
    const state = useK0tdStore.getState();
    assert.equal(state.videoSettings.modelId, fixtureModel.id);
    assert.equal(
      state.models.some((model) => model.id === fixtureModel.id),
      false
    );
    assert.equal(
      state.unavailableModels.some((model) => model.id === fixtureModel.id),
      true
    );
  } finally {
    globalThis.fetch = previousFetch;
    useK0tdStore.setState(originalStore, true);
  }
});

test("deleting an active chat selects a chat in the same modality and restores its draft", async () => {
  const previousFetch = globalThis.fetch;
  try {
    useK0tdStore.setState(originalStore, true);
    globalThis.fetch = mockFetch(() =>
      Promise.resolve(Response.json({ ok: true }))
    );
    const nextId = "827cf8c1-afeb-41ef-b34f-cee1e2740c08";
    useK0tdStore.setState({
      activeChatId: chatId,
      activeTab: "video",
      chats: [
        fixtureChat,
        {
          ...fixtureChat,
          id: "412fe8a8-e8b6-4e3e-8e01-fbe168175b38",
          tab: "image",
        },
        { ...fixtureChat, draftPrompt: "Продолжение", id: nextId },
      ],
    });
    await useK0tdStore.getState().deleteChat(chatId);
    assert.equal(useK0tdStore.getState().activeChatId, nextId);
    assert.equal(useK0tdStore.getState().activeTab, "video");
    assert.equal(useK0tdStore.getState().prompt, "Продолжение");
  } finally {
    globalThis.fetch = previousFetch;
    useK0tdStore.setState(originalStore, true);
  }
});

test("confirmed session loss clears private client state", async () => {
  const previousFetch = globalThis.fetch;
  try {
    useK0tdStore.setState(originalStore, true);
    globalThis.fetch = fixtureFetch();
    await useK0tdStore.getState().refreshServer();
    useK0tdStore.getState().setPrompt("Private draft");
    globalThis.fetch = mockFetch(() =>
      Promise.resolve(
        Response.json({ error: "Необходима авторизация" }, { status: 401 })
      )
    );
    await useK0tdStore.getState().refreshServer();
    const state = useK0tdStore.getState();
    assert.equal(state.serverReady, false);
    assert.equal(state.user, null);
    assert.equal(state.prompt, "");
    assert.equal(state.activeChatId, "");
    assert.deepEqual(state.history, []);
    assert.deepEqual(state.chats, []);
  } finally {
    globalThis.fetch = previousFetch;
    useK0tdStore.setState(originalStore, true);
  }
});
