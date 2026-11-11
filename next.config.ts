import path from "node:path";
import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

// MY PAY is a fully static, local-first PWA: `next build` writes plain files
// to ./out (no server, no API). All data lives in the browser (IndexedDB).
// Security headers and clean URLs for hosting are in vercel.json.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  poweredByHeader: false,
  // Pin the workspace root (a stray lockfile in a parent folder must not be picked up).
  outputFileTracingRoot: path.resolve(__dirname),
  turbopack: {
    root: path.resolve(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withSerwist(nextConfig);
