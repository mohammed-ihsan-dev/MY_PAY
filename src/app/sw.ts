/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

// MY PAY service worker (built by Serwist).
// - Precaches the app shell: every page, script, style, font and icon, so the
//   app opens and navigates with no connection after the first visit.
// - Financial data is NOT here: it lives in IndexedDB and never touches the
//   network, so no API response or personal data is ever cached.
// - Updates: a new version waits until the user taps "Reload" (see
//   UpdatePrompt), so a running page never loses the files it is using.

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { cleanupOutdatedCaches: true, ignoreURLParametersMatching: [/.*/] },
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [{ url: "/dashboard", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
