import { lookup } from "node:dns/promises";
import type { IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

import { MAX_ARTIFACT_BYTES } from "./storage";

export const isPublicAddress = (address: string): boolean => {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224 ||
      (a === 198 && [18, 19].includes(b))
    );
  }
  // Pin public IPv4 records only; reject IPv6 transition and local ranges.
  return false;
};

const dataMedia = (source: string) => {
  const match =
    /^data:(image\/(?:png|jpeg|webp|svg\+xml)|audio\/(?:mpeg|mp3|wav|x-wav));base64,([A-Za-z0-9+/=\r\n]+)$/u.exec(
      source
    );
  if (!match || match[2].length > MAX_ARTIFACT_BYTES * 1.4) {
    throw new Error("Unsupported provider media data");
  }
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_ARTIFACT_BYTES) {
    throw new Error("Invalid provider media size");
  }
  return { bytes, mime: match[1] === "audio/mp3" ? "audio/mpeg" : match[1] };
};

export const downloadMedia = async (
  source: string
): Promise<{ bytes: Buffer; mime: string }> => {
  if (source.startsWith("data:")) {
    return dataMedia(source);
  }
  const url = new URL(source);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new Error("Unsupported media URL");
  }
  const defaultHosts =
    "routerai.ru,yandexcloud.net,timeweb.cloud,amazonaws.com,cloudflarestorage.com,windows.net,blob.core.windows.net,fal.media,replicate.delivery,googleusercontent.com,storage.googleapis.com,openai.com,b-cdn.net";
  const permitted = (process.env.ROUTERAI_MEDIA_HOSTS ?? defaultHosts)
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  if (
    !permitted.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`)
    )
  ) {
    throw new Error(`Provider media host is not allowed: ${url.hostname}`);
  }
  const records = await lookup(url.hostname, { all: true, family: 4 });
  if (
    !records.length ||
    records.some((record) => !isPublicAddress(record.address))
  ) {
    throw new Error("Private provider media address rejected");
  }
  const [pinned] = records;
  const responsePending = Promise.withResolvers<IncomingMessage>();
  const request = httpsRequest(url, {
    family: 4,
    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Node HTTPS exposes its DNS pinning contract exclusively through this callback.
    lookup: (_hostname, _options, callback) => {
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- HTTPS requires its DNS lookup callback to pin the checked address.
      callback(null, pinned.address, 4);
    },
  });
  request.on("response", responsePending.resolve);
  request.on("error", responsePending.reject);
  request.setTimeout(60_000, () =>
    request.destroy(new Error("Media download timeout"))
  );
  request.end();
  const response = await responsePending.promise;
  if (response.statusCode !== 200) {
    response.destroy();
    throw new Error(`Provider media download rejected: status ${response.statusCode}`);
  }
  let [mime] = (response.headers["content-type"] ?? "").split(";");
  mime = mime.trim().toLowerCase();
  if (mime === "image/jpg") mime = "image/jpeg";
  if (mime === "audio/mp3") mime = "audio/mpeg";
  if (mime === "audio/x-wav") mime = "audio/wav";
  if (
    !/^(image\/(png|jpeg|webp|svg\+xml)|audio\/(mpeg|wav)|video\/mp4|application\/octet-stream)$/u.test(
      mime
    )
  ) {
    response.destroy();
    throw new Error(`Unsupported provider content type: ${mime}`);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response) {
    // SAFETY: IncomingMessage uses binary mode because no encoding was configured.
    const bytes = Buffer.from(chunk as Uint8Array);
    size += bytes.length;
    if (size > MAX_ARTIFACT_BYTES) {
      response.destroy();
      throw new Error("Provider media too large");
    }
    chunks.push(bytes);
  }
  if (!size) {
    throw new Error("Empty provider media");
  }
  return { bytes: Buffer.concat(chunks), mime };
};
