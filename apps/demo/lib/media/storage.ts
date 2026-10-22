import { randomUUID } from "node:crypto";
import { promises as fs, createReadStream } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

import { ApiError } from "@/lib/security/http";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;

export const ensureMediaStorage = async (): Promise<void> => {
  const root = process.env.MEDIA_ROOT;
  if (!root || !isAbsolute(root)) {
    throw new Error("MEDIA_ROOT must be an absolute private directory");
  }
  await fs.mkdir(root, { mode: 0o700, recursive: true });
  const probe = resolve(root, `.storage-probe-${randomUUID()}`);
  const handle = await fs.open(probe, "wx", 0o600);
  try {
    await handle.writeFile("ready");
    await handle.sync();
  } finally {
    await handle.close();
    await fs.unlink(probe);
  }
};

export const ensureMediaCapacity = async (): Promise<void> => {
  const root = process.env.MEDIA_ROOT;
  if (!root || !isAbsolute(root)) {
    throw new Error("MEDIA_ROOT must be an absolute private directory");
  }
  const stats = await fs.statfs(root);
  if (Number(stats.bavail) * Number(stats.bsize) < MAX_ARTIFACT_BYTES * 2) {
    throw new ApiError(
      503,
      "Недостаточно места для результата. Попробуйте позже.",
      "STORAGE_UNAVAILABLE"
    );
  }
};

const storagePath = (key: string): string => {
  const root = process.env.MEDIA_ROOT;
  if (!root || !isAbsolute(root)) {
    throw new Error("MEDIA_ROOT must be an absolute private directory");
  }
  if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/u.test(key)) {
    throw new Error("Invalid media storage key");
  }
  const path = resolve(root, key);
  if (!path.startsWith(resolve(root) + sep)) {
    throw new Error("Invalid media storage path");
  }
  return path;
};

export const imageMime = (bytes: Buffer): string | null => {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return "image/png";
  }
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return "image/jpeg";
  }
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
};

export const saveMedia = async (
  bytes: Buffer,
  folder: string,
  fixedId?: string
): Promise<string> => {
  if (!bytes.length || bytes.length > MAX_ARTIFACT_BYTES) {
    throw new Error("Invalid media size");
  }
  const key = `${folder}/${fixedId ?? randomUUID()}.bin`;
  const path = storagePath(key);
  const directory = resolve(path, "..");
  await fs.mkdir(directory, { mode: 0o700, recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const handle = await fs.open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(temporary, path);
  const directoryHandle = await fs.open(directory, "r");
  try {
    await directoryHandle.sync();
  } finally {
    await directoryHandle.close();
  }
  return key;
};

export const readMedia = (key: string): Promise<Buffer> =>
  fs.readFile(storagePath(key));
export const removeMedia = async (key: string): Promise<void> => {
  await fs.unlink(storagePath(key)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
  });
};

export const mediaResponse = async (
  request: Request,
  key: string,
  mime: string,
  filename = "result"
): Promise<Response> => {
  const path = storagePath(key);
  const stat = await fs.stat(path);
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Type": mime,
    "X-Content-Type-Options": "nosniff",
  });
  const safeName =
    filename.replaceAll(/[^a-zA-Z0-9_.-]/gu, "_").slice(0, 100) || "result";
  if (
    new URL(request.url).searchParams.has("download") ||
    mime === "image/svg+xml"
  ) {
    headers.set("Content-Disposition", `attachment; filename="${safeName}"`);
  }
  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/u.exec(range);
    if (!match || (!match[1] && !match[2])) {
      return new Response(null, {
        headers: { "Content-Range": `bytes */${stat.size}` },
        status: 416,
      });
    }
    if (match[1]) {
      start = Number(match[1]);
      if (match[2]) {
        end = Math.min(Number(match[2]), end);
      }
    } else {
      start = Math.max(0, stat.size - Number(match[2]));
    }
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start >= stat.size
    ) {
      return new Response(null, {
        headers: { "Content-Range": `bytes */${stat.size}` },
        status: 416,
      });
    }
    status = 206;
    headers.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
  }
  headers.set("Content-Length", String(end - start + 1));
  const input = createReadStream(path, { end, start });
  const iterator = input[Symbol.asyncIterator]();
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      input.destroy();
    },
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) {
          controller.close();
          return;
        }
        if (!Buffer.isBuffer(next.value)) {
          throw new TypeError("Unexpected file stream chunk");
        }
        controller.enqueue(next.value);
      } catch (error) {
        controller.error(error);
        input.destroy();
      }
    },
  });
  return new Response(body, { headers, status });
};

export const validateUpload = (file: File, bytes: Buffer): string => {
  if (file.size > MAX_UPLOAD_BYTES || !bytes.length) {
    throw new ApiError(413, "Изображение должно быть не больше 10 МБ");
  }
  const mime = imageMime(bytes);
  if (!mime || (file.type && file.type !== mime)) {
    throw new ApiError(
      415,
      "Допустимы изображения PNG, JPEG и WebP с корректным содержимым"
    );
  }
  return mime;
};
