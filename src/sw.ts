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
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    cleanupOutdatedCaches: true,
    navigateFallback: "/offline",
  },
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: [
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "pages-v4",
        networkTimeoutSeconds: 3,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 100,
            maxAgeSeconds: 7 * 24 * 60 * 60,
          }),
        ],
      }),
    },
    {
      matcher: ({ request, url }) =>
        url.origin === self.location.origin &&
        (request.destination === "style" || request.destination === "script"),
      handler: new StaleWhileRevalidate({
        cacheName: "static-code-v4",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 7 * 24 * 60 * 60,
          }),
        ],
      }),
    },
    {
      matcher: ({ request }) =>
        request.destination === "font" ||
        request.destination === "image",
      handler: new StaleWhileRevalidate({
        cacheName: "static-assets-v4",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 300,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          }),
        ],
      }),
    },
    {
      matcher: ({ url }) =>
        url.origin === self.location.origin &&
        (url.pathname === "/qpc-hafs-word-by-word.json" ||
          url.pathname === "/search-index.json" ||
          url.pathname.startsWith("/assets/premade-mindmaps/")),
      handler: new StaleWhileRevalidate({
        cacheName: "offline-content-v1",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 300,
            maxAgeSeconds: 60 * 24 * 60 * 60,
          }),
        ],
      }),
    },
    {
      matcher: ({ url }) =>
        url.origin === self.location.origin && url.pathname.endsWith(".json"),
      handler: new NetworkFirst({
        cacheName: "data-json-v4",
        networkTimeoutSeconds: 3,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 100,
            maxAgeSeconds: 7 * 24 * 60 * 60,
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
});

serwist.setCatchHandler(async ({ request }) => {
  if (request.destination === "document") {
    const rootFallback = await serwist.matchPrecache("/");
    if (rootFallback) return rootFallback;
    const fallback = await serwist.matchPrecache("/offline");
    if (fallback) return fallback;
  }
  return Response.error();
});

serwist.addEventListeners();

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) =>
            [
              "pages-v2",
              "static-assets-v2",
              "data-json-v2",
              "pages-v3",
              "static-code-v3",
              "static-assets-v3",
              "data-json-v3",
            ].includes(key)
          )
          .map((key) => caches.delete(key))
      )
    )
  );
});
