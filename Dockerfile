# Pin runtime and OS versions; update these together through tested dependency PRs.
FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS dependencies
WORKDIR /app
COPY package.json bunfig.toml bun.lock ./
COPY packages/studio/package.json packages/studio/package.json
COPY apps/demo/package.json apps/demo/package.json
RUN bun install --frozen-lockfile

FROM dependencies AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production
RUN bun --bun run --filter=demo build && rm -rf apps/demo/.next/cache apps/demo/.next/dev

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 MEDIA_ROOT=/app/storage/generation BUN_RUNTIME_TRANSPILER_CACHE_PATH=/tmp/bun-transpiler-cache
RUN addgroup -S -g 1001 studio && adduser -S -u 1001 -G studio studio
RUN mkdir -p /app/storage/database /app/storage/logs /app/storage/generation/video /app/storage/generation/image /app/storage/generation/audio && chown -R 1001:1001 /app/storage
# Worker/migrations execute TypeScript; resvg loads a native package at runtime.
COPY --from=builder --chown=1001:1001 /app /app
USER 1001:1001
WORKDIR /app/apps/demo
EXPOSE 3000
# Auto-migrate database schema & synchronize administrator on boot
CMD ["sh", "-c", "bun scripts/auto-migrate.ts && exec bun --bun run start"]
