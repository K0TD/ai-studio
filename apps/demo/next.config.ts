import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow next/image to serve generated media from the storage bucket.
  images: {
    // The package's gallery thumbnails request quality 60.
    qualities: [60, 75],
    remotePatterns: process.env.R2_PUBLIC_URL
      ? [{ hostname: new URL(process.env.R2_PUBLIC_URL).hostname }]
      : [],
  },
  // Proxies Trigger.dev's realtime long-polls through this app's own domain
  // instead of the browser talking to api.trigger.dev directly. Required
  // because <Studio />'s generation-status components (@two-71/studio/client)
  // read live progress via @trigger.dev/react-hooks against the realtime
  // token @two-71/studio/server's routes issue.
  rewrites() {
    return [
      {
        destination: "https://api.trigger.dev/realtime/:path*",
        source: "/api/realtime/:path*",
      },
    ];
  },
  // @resvg/resvg-js (used internally by the package's watermark step) is a
  // native module — it must load from node_modules at runtime, not be
  // bundled into the server output.
  serverExternalPackages: ["@resvg/resvg-js"],
  // The package ships TypeScript source (no build step) — Next transpiles it
  // like the rest of the app instead of consuming a prebuilt dist.
  transpilePackages: ["@two-71/studio"],
};

export default nextConfig;
