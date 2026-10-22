import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  headers() {
    return Promise.resolve([
      {
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
            : []),
        ],
        source: "/:path*",
      },
    ]);
  },
  // Allow next/image to serve generated media from the storage bucket.
  images: {
    // The package's gallery thumbnails request quality 60.
    qualities: [60, 75],
    remotePatterns: process.env.R2_PUBLIC_URL
      ? [{ hostname: new URL(process.env.R2_PUBLIC_URL).hostname }]
      : [],
  },
  poweredByHeader: false,
  // @resvg/resvg-js (used internally by the package's watermark step) is a
  // native module — it must load from node_modules at runtime, not be
  // bundled into the server output.
  serverExternalPackages: ["@resvg/resvg-js"],
  // The package ships TypeScript source (no build step) — Next transpiles it
  // like the rest of the app instead of consuming a prebuilt dist.
  transpilePackages: ["@two-71/studio"],
};

export default nextConfig;
