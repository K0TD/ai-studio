import { describe, expect, test } from "bun:test";

import { mergeUncertainProviderResult } from "./provider-result";

describe("uncertain provider result persistence", () => {
  test("keeps an existing output and cost when adding the uncertainty marker", () => {
    expect(
      mergeUncertainProviderResult(
        {
          cost: 4.25,
          generationId: "provider-job",
          urls: ["https://media.example/result.png"],
        },
        { confirmedFailure: false, generationId: "replacement-id" }
      )
    ).toMatchObject({
      confirmedFailure: false,
      cost: 4.25,
      generationId: "provider-job",
      urls: ["https://media.example/result.png"],
    });
  });
});
