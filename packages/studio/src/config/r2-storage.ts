// Default StorageAdapter for any S3-compatible store, extracted
// from lib/r2.ts's logic. Takes credentials as arguments instead of reading
// process.env directly, so it stays host-agnostic; lib/r2.ts itself is left
// untouched for A1 — the host app keeps calling it directly until a later
// phase swaps callers over to this factory.

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import type { StorageAdapter } from "./types";

export interface R2Env {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
}

export const r2Storage = (env: R2Env): StorageAdapter => {
  const client = new S3Client({
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
    endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
    region: "auto",
  });

  return {
    async getBase64(key) {
      const res = await client.send(
        new GetObjectCommand({ Bucket: env.bucket, Key: key })
      );
      const bytes = await res.Body?.transformToByteArray();
      if (!bytes) {
        throw new Error(`r2 object not found: ${key}`);
      }
      return Buffer.from(bytes).toString("base64");
    },

    keyFromPublicUrl(url) {
      const prefix = `${env.publicUrl}/`;
      return url.startsWith(prefix) ? url.slice(prefix.length) : null;
    },

    publicUrl(key) {
      return `${env.publicUrl}/${key}`;
    },

    async upload(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Body: body,
          Bucket: env.bucket,
          ContentType: contentType,
          Key: key,
        })
      );
    },
  };
};
