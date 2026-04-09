import { withBotId } from "botid/next/config";
import type { NextConfig } from "next";

const basePath = process.env.IS_DEMO === "1" ? "/demo" : "";

const nextConfig: NextConfig = {
  ...(basePath
    ? {
        basePath,
        assetPrefix: "/demo-assets",
        redirects: async () => [
          {
            source: "/",
            destination: basePath,
            permanent: false,
            basePath: false,
          },
        ],
      }
    : {}),
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  cacheComponents: true,
  devIndicators: false,
  poweredByHeader: false,
  reactCompiler: true,
  logging: {
    fetches: {
      fullUrl: false,
    },
    incomingRequests: false,
  },
  images: {
    remotePatterns: [
      {
        hostname: "avatar.vercel.sh",
      },
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
  experimental: {
    prefetchInlining: true,
    cachedNavigations: true,
    appNewScrollHandler: true,
    inlineCss: true,
    turbopackFileSystemCacheForDev: true,
  },
  async headers() {
    // NEXT_PUBLIC_ALLOWED_ORIGINS: comma-separated list of portal origins, e.g. "https://portal.com,https://staging.portal.com"
    // Use * to allow all origins.
    const rawOrigins = process.env.NEXT_PUBLIC_ALLOWED_ORIGINS ?? "*";
    const frameAncestors =
      rawOrigins === "*"
        ? "frame-ancestors *"
        : `frame-ancestors 'self' ${rawOrigins.split(",").map((o) => o.trim()).join(" ")}`;
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: frameAncestors },
        ],
      },
      // NOTE: Access-Control-Allow-Origin is handled dynamically in middleware
      // because it must reflect a single origin per response (multi-origin support).
    ];
  },
};

export default withBotId(nextConfig);
