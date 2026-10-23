import { describe, expect, test } from "bun:test";

import { z } from "zod";

import {
  assertSameOrigin,
  idempotencyKey,
  readJson,
  readRequestText,
} from "./request";
describe("входные HTTP границы", () => {
  test("проверяет Origin независимо от cookie", () => {
    const { origin } = new URL(
      process.env.BETTER_AUTH_URL ?? "http://localhost:3000"
    );
    expect(() =>
      assertSameOrigin(new Request(origin, { headers: { Origin: origin } }))
    ).not.toThrow();
    for (const source of [undefined, "https://evil.invalid", "null"]) {
      const headers = new Headers();
      if (source) {
        headers.set("Origin", source);
      }
      expect(() =>
        assertSameOrigin(new Request(origin, { headers }))
      ).toThrow();
    }
  });
  test("не доверяет сторонним приватным адресам и поддельным proxy-заголовкам", () => {
    const trusted = new URL(
      process.env.BETTER_AUTH_URL ?? "http://localhost:3000"
    ).origin;
    for (const origin of [
      "https://evil.invalid",
      "http://10.1.2.3",
      "http://192.168.1.5",
      "http://127.0.0.1:9999",
    ]) {
      expect(() =>
        assertSameOrigin(
          new Request(`${trusted}/api/syntx/generate`, {
            headers: {
              Host: new URL(origin).host,
              Origin: origin,
              "X-Forwarded-Host": new URL(origin).host,
              "X-Forwarded-Proto": new URL(origin).protocol.slice(0, -1),
            },
          })
        )
      ).toThrow();
    }
  });
  test("ограничивает исходное тело авторизации до создания копий", async () => {
    const request = new Request("http://localhost/api/auth/sign-in/email", {
      body: "я".repeat(40_000),
      method: "POST",
    });
    await expect(readRequestText(request)).rejects.toMatchObject({
      status: 413,
    });
    expect(
      await readRequestText(
        new Request("http://localhost", { body: "{}", method: "POST" })
      )
    ).toBe("{}");
  });
  test("проверяет размер реального потока, а не только Content-Length", async () => {
    const request = new Request("http://localhost", {
      body: JSON.stringify({ text: "a".repeat(100) }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    await expect(
      readJson(request, z.strictObject({ text: z.string().max(200) }), 20)
    ).rejects.toMatchObject({ status: 413 });
  });
  test("закрытая схема отсекает mass assignment и пустое имя", async () => {
    const schema = z.strictObject({ name: z.string().trim().min(1).max(100) });
    for (const body of [{ name: "user", role: "admin" }, { name: "   " }]) {
      const request = new Request("http://localhost", {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await expect(readJson(request, schema)).rejects.toMatchObject({
        status: 400,
      });
    }
  });
  test("операция требует ограниченный ключ идемпотентности", () => {
    expect(() => idempotencyKey(new Request("http://localhost"))).toThrow();
    const key = crypto.randomUUID();
    expect(
      idempotencyKey(
        new Request("http://localhost", { headers: { "Idempotency-Key": key } })
      )
    ).toBe(key);
  });
});
