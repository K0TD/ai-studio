import { describe, expect, test } from "bun:test";

import { confirmedImageFailure } from "./confirmed-image-failure";

describe("confirmed image rejection policy", () => {
  test("accepts confirmed rejections and safe legacy records but rejects uncertain responses", () => {
    const context = {
      confirmedFailure: true,
      cost: 0,
      diagnostic: {
        endpoint: "/images",
        outputCount: 0,
        status: 200,
      },
    };
    expect(confirmedImageFailure(context)).toMatchObject(context);
    expect(
      confirmedImageFailure({ ...context, confirmedFailure: false })
    ).toBeUndefined();
    expect(
      confirmedImageFailure({
        cost: 0,
        diagnostic: context.diagnostic,
        generationId: "legacy-empty",
      })
    ).toMatchObject({ diagnostic: context.diagnostic });
    expect(
      confirmedImageFailure({
        cost: 0,
        diagnostic: { ...context.diagnostic, responseKeys: ["error"] },
      })
    ).toBeUndefined();
    expect(
      confirmedImageFailure({
        diagnostic: {
          endpoint: "/images",
          responseKeys: ["data"],
          status: 200,
        },
        generationId: "legacy-parse-error",
      })
    ).toBeUndefined();
    expect(
      confirmedImageFailure(
        JSON.stringify({
          diagnostic: context.diagnostic,
          error: { message: "legacy uncertain result" },
        })
      )
    ).toBeUndefined();
    expect(confirmedImageFailure(JSON.stringify(context))).toMatchObject(
      context
    );
  });
});
