/// <reference lib="webworker" />

import {
  Serwist,
  NetworkFirst,
  StaleWhileRevalidate,
  CacheFirst,
  ExpirationPlugin,
  RangeRequestsPlugin,
} from "serwist";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: Array<string | { url: string; revision?: string | null }>;
};

const serwist = new Serwist({
  // Bump when runtime cache semantics change to avoid serving stale app shell/data.
  // Precache is already revisioned separately by Serwist.
  runtimeCaching: [
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "pages-v2",
        networkTimeoutSeconds: 3,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 50,
            maxAgeSeconds: 24 * 60 * 60,
          }),
        ],
      }),
    },
    {
      matcher: ({ request }) =>
        request.destination === "style" ||
        request.destination === "script" ||
        request.destination === "font" ||
        request.destination === "image",
      handler: new StaleWhileRevalidate({
        cacheName: "static-assets-v2",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 7 * 24 * 60 * 60,
          }),
        ],
      }),
    },
    {
      matcher: ({ url }) =>
        url.origin === self.location.origin && url.pathname.endsWith(".json"),
      handler: new NetworkFirst({
        cacheName: "data-json-v2",
        networkTimeoutSeconds: 3,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 50,
            maxAgeSeconds: 24 * 60 * 60,
          }),
        ],
      }),
    },
    {
      matcher: ({ request, url }) =>
        request.destination === "audio" ||
        (url.origin === self.location.origin && url.pathname.endsWith(".mp3")),
      handler: new CacheFirst({
        cacheName: "audio-runtime",
        plugins: [
          new RangeRequestsPlugin(),
          new ExpirationPlugin({
            maxEntries: 120,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          }),
        ],
      }),
    },
  ],
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    cleanupOutdatedCaches: true,
    navigateFallback: "/offline",
  },
  skipWaiting: true,
  clientsClaim: true,
});

serwist.setCatchHandler(async ({ request }) => {
  if (request.destination === "document") {
    const fallback = await serwist.matchPrecache("/offline");
    if (fallback) return fallback;
  }
  return Response.error();
});

serwist.addEventListeners();
