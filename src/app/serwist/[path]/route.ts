import { randomUUID } from "node:crypto";
import { createSerwistRoute } from "@serwist/turbopack";

// Builds the service worker at build time (a static file in the export).
// Every page is precached so the installed app works fully offline.
const revision = randomUUID(); // new on every build → updated pages are re-fetched
const PAGES = ["/dashboard", "/salary", "/debts", "/history", "/settings", "/"];

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "src/app/sw.ts",
  useNativeEsbuild: true,
  additionalPrecacheEntries: [...PAGES.map((url) => ({ url, revision })), { url: "/manifest.webmanifest", revision }],
});
