import { describe, expect, test } from "bun:test";

import {
  MAX_REFERENCE_TOTAL_BYTES,
  MAX_UPLOAD_BYTES,
  validateUpload,
} from "./storage";

const fileFor = (bytes: Buffer, name: string, type: string) =>
  new File([new Uint8Array(bytes)], name, { type });

describe("generation attachment validation", () => {
  test("detects media by file signature and enforces the approved limits", () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const mp4 = Buffer.alloc(12);
    mp4.write("ftyp", 4, "ascii");
    const mp3 = Buffer.from("ID3\u0004\u0000\u0000", "binary");

    expect(validateUpload(fileFor(png, "image.png", "image/png"), png)).toBe(
      "image/png"
    );
    expect(validateUpload(fileFor(mp4, "video.mp4", "video/mp4"), mp4)).toBe(
      "video/mp4"
    );
    expect(validateUpload(fileFor(mp3, "audio.mp3", "audio/mpeg"), mp3)).toBe(
      "audio/mpeg"
    );
    expect(MAX_UPLOAD_BYTES).toBe(20 * 1024 * 1024);
    expect(MAX_REFERENCE_TOTAL_BYTES).toBe(24 * 1024 * 1024);
  });

  test("rejects a declared MIME that disagrees with the file signature", () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(() =>
      validateUpload(fileFor(png, "image.png", "image/jpeg"), png)
    ).toThrow("Поддерживаются");
  });
});
