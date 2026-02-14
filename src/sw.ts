/// <reference lib="webworker" />

const swSelf = self as unknown as ServiceWorkerGlobalScope & {
  __SW_MANIFEST?: Array<string | { url: string; revision?: string | null }>;
};
// @ts-expect-error __SW_MANIFEST is injected by @serwist/next at build time.
const injectedManifest = self.__SW_MANIFEST as
  | Array<string | { url: string; revision?: string | null }>
  | undefined;

const CACHE_VERSION = "v7";
const PRECACHE_NAME = `precache-${CACHE_VERSION}`;
const PAGES_CACHE = `pages-${CACHE_VERSION}`;
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DATA_CACHE = `data-${CACHE_VERSION}`;
const OFFLINE_CONTENT_CACHE = `offline-content-${CACHE_VERSION}`;

const PRECACHE_REQUIRED = ["/", "/auth", "/dashboard", "/offline-app", "/offline", "/manifest.json"];

const OLD_CACHE_PREFIXES = [
  "pages-v2",
  "static-assets-v2",
  "data-json-v2",
  "pages-v3",
  "static-code-v3",
  "static-assets-v3",
  "data-json-v3",
  "pages-v4",
  "static-code-v4",
  "static-assets-v4",
  "data-json-v4",
  "offline-content-v1",
  "pages-v5",
  "static-v5",
  "data-v5",
  "offline-content-v5",
  "pages-v6",
  "static-v6",
  "data-v6",
  "offline-content-v6",
];

const toManifestUrl = (entry: string | { url: string }) =>
  typeof entry === "string" ? entry : entry.url;

const normalizeUrl = (path: string) => new URL(path, swSelf.location.origin).toString();

const isSameOrigin = (url: URL) => url.origin === self.location.origin;
const isAudioRequest = (request: Request, url: URL) =>
  request.destination === "audio" || url.pathname.endsWith(".mp3");
const isStaticRequest = (request: Request, url: URL) =>
  request.destination === "style" ||
  request.destination === "script" ||
  request.destination === "font" ||
  request.destination === "image" ||
  url.pathname.startsWith("/_next/static/");
const isCoreOfflineData = (url: URL) =>
  url.pathname === "/qpc-hafs-word-by-word.json" ||
  url.pathname === "/search-index.json" ||
  url.pathname.startsWith("/assets/premade-mindmaps/");
const isJsonRequest = (url: URL) => url.pathname.endsWith(".json");

async function safePrecache(urls: string[]) {
  const cache = await caches.open(PRECACHE_NAME);
  await Promise.all(
    urls.map(async (rawUrl) => {
      const absoluteUrl = normalizeUrl(rawUrl);
      try {
        const response = await fetch(absoluteUrl, { cache: "no-cache" });
        if (!response.ok) return;
        await cache.put(absoluteUrl, response.clone());
      } catch {
        // Keep install resilient if one resource is temporarily unavailable.
      }
    })
  );
}

async function staleWhileRevalidate(request: Request, cacheName: string) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: false });
  const networkPromise = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    void networkPromise;
    return cached;
  }
  return (await networkPromise) ?? Response.error();
}

async function networkFirst(
  request: Request,
  cacheName: string,
  timeoutMs = 3000,
  canCache: (response: Response) => boolean = (response) => response.ok
) {
  const cache = await caches.open(cacheName);
  const networkPromise = fetch(request)
    .then(async (response) => {
      if (canCache(response)) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  const timeoutPromise = new Promise<undefined>((resolve) =>
    setTimeout(() => resolve(undefined), timeoutMs)
  );
  const networkResponse = await Promise.race([networkPromise, timeoutPromise]);
  if (networkResponse) return networkResponse;

  const cached = await cache.match(request);
  if (cached) return cached;
  return (await networkPromise) ?? Response.error();
}

async function cacheFirst(request: Request, cacheName: string) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}

swSelf.addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const manifestUrls = (injectedManifest ?? []).map(toManifestUrl);
      const uniqueUrls = [...new Set([...manifestUrls, ...PRECACHE_REQUIRED])];
      await safePrecache(uniqueUrls);
      await swSelf.skipWaiting();
    })()
  );
});

swSelf.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              key !== PRECACHE_NAME &&
              key !== PAGES_CACHE &&
              key !== STATIC_CACHE &&
              key !== DATA_CACHE &&
              key !== OFFLINE_CONTENT_CACHE &&
              OLD_CACHE_PREFIXES.includes(key)
          )
          .map((key) => caches.delete(key))
      );
      await swSelf.clients.claim();
    })()
  );
});

swSelf.addEventListener("fetch", (event: FetchEvent) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!isSameOrigin(url)) return;

  if (isAudioRequest(request, url)) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    const requestPath = url.pathname;
    event.respondWith(
      (async () => {
        const response = await networkFirst(
          request,
          PAGES_CACHE,
          3000,
          (networkResponse) => {
            if (!networkResponse.ok) return false;
            if (networkResponse.redirected) return false;
            const responsePath = new URL(networkResponse.url).pathname;
            return responsePath === requestPath;
          }
        );
        if (response && response.type !== "error") return response;

        const precache = await caches.open(PRECACHE_NAME);
        const offlineRequestedRoute = await precache.match(normalizeUrl(requestPath));
        if (offlineRequestedRoute) return offlineRequestedRoute;
        const offlineHome = await precache.match(normalizeUrl("/"));
        if (offlineHome) return offlineHome;
        const offlinePage = await precache.match(normalizeUrl("/offline"));
        if (offlinePage) return offlinePage;
        return Response.error();
      })()
    );
    return;
  }

  if (isStaticRequest(request, url)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  if (isCoreOfflineData(url)) {
    event.respondWith(staleWhileRevalidate(request, OFFLINE_CONTENT_CACHE));
    return;
  }

  if (isJsonRequest(url)) {
    event.respondWith(networkFirst(request, DATA_CACHE, 3000));
    return;
  }
});
