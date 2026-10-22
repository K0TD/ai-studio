import { describe, expect, test } from "bun:test";

import { z } from "zod";

import { assertSameOrigin, idempotencyKey, readJson } from "./request";
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
