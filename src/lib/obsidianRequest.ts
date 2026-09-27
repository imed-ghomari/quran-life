/**
 * Network access for Quran Life.
 *
 * Obsidian's plugin review requires `requestUrl` instead of `fetch` for network
 * requests: `requestUrl` bypasses CORS from the app:// renderer and behaves the
 * same on desktop and mobile. This module resolves it lazily — the dynamic
 * `import('obsidian')` keeps the web build free of a hard dependency on the
 * Obsidian module — and only falls back to the platform `fetch` outside
 * Obsidian (web build / same-origin assets served next to the app).
 *
 * `requestUrl` has no AbortSignal support, so every helper enforces a timeout by
 * racing the promise: a dead network can never leave a caller hanging forever
 * (the late response is simply discarded).
 */

interface ObsidianRequestResponse {
  status?: number;
  text?: string;
  json?: unknown;
  arrayBuffer?: ArrayBuffer | (() => Promise<ArrayBuffer>) | Uint8Array;
  body?: unknown;
}

interface ObsidianRequestOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  throw?: boolean;
}

type ObsidianRequestFn = (opts: ObsidianRequestOptions) => Promise<ObsidianRequestResponse>;

interface ObsidianRequestModule {
  requestUrl?: ObsidianRequestFn;
}

interface WindowWithRequestUrl extends Window {
  requestUrl?: ObsidianRequestFn;
}

export interface ObsidianRequestInit {
  /** Hard timeout in ms — defaults to 12s. */
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Only used by the non-Obsidian `fetch` fallback. */
  cache?: RequestCache;
}

let resolvedRequestUrl: ObsidianRequestFn | null | undefined;

/** Resolve Obsidian's `requestUrl` once per session (`null` on web builds). */
export async function getObsidianRequestUrl(): Promise<ObsidianRequestFn | null> {
  if (resolvedRequestUrl !== undefined) return resolvedRequestUrl;
  let fn: ObsidianRequestFn | null = null;
  try {
    const mod = (await import('obsidian')) as unknown as ObsidianRequestModule;
    if (typeof mod.requestUrl === 'function') fn = mod.requestUrl;
  } catch { /* not running inside Obsidian (web build) */ }
  if (!fn && typeof window !== 'undefined') {
    const win = window as WindowWithRequestUrl;
    if (typeof win.requestUrl === 'function') fn = win.requestUrl;
  }
  resolvedRequestUrl = fn;
  return fn;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error: unknown) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

async function responseToArrayBuffer(res: ObsidianRequestResponse): Promise<ArrayBuffer | null> {
  const raw: unknown = typeof res.arrayBuffer === 'function' ? await res.arrayBuffer() : res.arrayBuffer;
  if (raw instanceof ArrayBuffer) return raw;
  if (ArrayBuffer.isView(raw)) {
    const view = raw;
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
  }
  return null;
}

/** `fetch` off the global object — the non-Obsidian fallback only. */
function getWindowFetch(): ((input: string, init?: RequestInit) => Promise<Response>) | null {
  if (typeof window === 'undefined') return null;
  const fn: unknown = (window as Window).fetch;
  if (typeof fn !== 'function') return null;
  return fn.bind(window) as (input: string, init?: RequestInit) => Promise<Response>;
}

async function fetchTextOutsideObsidian(url: string, timeoutMs: number, cache?: RequestCache): Promise<string | null> {
  const doFetch = getWindowFetch();
  if (!doFetch) return null;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? window.setTimeout(() => { try { ctrl.abort(); } catch { /* already settled */ } }, timeoutMs) : null;
  try {
    const res = await doFetch(url, { signal: ctrl?.signal, ...(cache ? { cache } : {}) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

async function fetchArrayBufferOutsideObsidian(url: string, timeoutMs: number): Promise<ArrayBuffer | null> {
  const doFetch = getWindowFetch();
  if (!doFetch) return null;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? window.setTimeout(() => { try { ctrl.abort(); } catch { /* already settled */ } }, timeoutMs) : null;
  try {
    const res = await doFetch(url, { signal: ctrl?.signal });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

export interface RequestTextResult {
  ok: boolean;
  status: number;
  text: string;
}

/** GET a URL as text, preferring Obsidian `requestUrl`. Returns `null` on failure. */
export async function requestText(url: string, init: ObsidianRequestInit = {}): Promise<RequestTextResult | null> {
  const timeoutMs = init.timeoutMs ?? 12000;
  const req = await getObsidianRequestUrl();
  if (req) {
    try {
      const res = await withTimeout(req({ url, method: 'GET', headers: init.headers, throw: false }), timeoutMs, 'requestUrl');
      const status = typeof res.status === 'number' ? res.status : 0;
      if (status !== 0 && (status < 200 || status >= 300)) return { ok: false, status, text: '' };
      if (typeof res.text === 'string') return { ok: true, status: status || 200, text: res.text };
      const buf = await responseToArrayBuffer(res);
      if (buf) {
        const text = new TextDecoder().decode(buf);
        if (text) return { ok: true, status: status || 200, text };
      }
      return { ok: false, status, text: '' };
    } catch {
      return null;
    }
  }
  const text = await fetchTextOutsideObsidian(url, timeoutMs, init.cache);
  return text === null ? null : { ok: true, status: 200, text };
}

/** GET + JSON.parse, preferring Obsidian `requestUrl`. Returns `null` on failure. */
export async function requestJson(url: string, init: ObsidianRequestInit = {}): Promise<unknown> {
  const timeoutMs = init.timeoutMs ?? 12000;
  const headers = { Accept: 'application/json', ...(init.headers ?? {}) };
  const req = await getObsidianRequestUrl();
  if (req) {
    try {
      const res = await withTimeout(req({ url, method: 'GET', headers, throw: false }), timeoutMs, 'requestUrl');
      const status = typeof res.status === 'number' ? res.status : 0;
      if (status !== 0 && (status < 200 || status >= 300)) return null;
      if (res.json !== undefined && res.json !== null) {
        // Obsidian parses JSON responses when the content type says so.
        if (typeof res.json === 'string') {
          try { return JSON.parse(res.json); } catch { return null; }
        }
        return res.json;
      }
      if (typeof res.text === 'string' && res.text.trim()) {
        try { return JSON.parse(res.text); } catch { return null; }
      }
      const buf = await responseToArrayBuffer(res);
      if (buf) {
        const text = new TextDecoder().decode(buf);
        if (text.trim()) {
          try { return JSON.parse(text); } catch { return null; }
        }
      }
      return null;
    } catch {
      return null;
    }
  }
  const text = await fetchTextOutsideObsidian(url, timeoutMs, init.cache);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** GET a URL as an ArrayBuffer, preferring Obsidian `requestUrl`. */
export async function requestArrayBuffer(url: string, init: ObsidianRequestInit = {}): Promise<ArrayBuffer | null> {
  const timeoutMs = init.timeoutMs ?? 60000;
  const req = await getObsidianRequestUrl();
  if (req) {
    try {
      const res = await withTimeout(req({ url, method: 'GET', headers: init.headers, throw: false }), timeoutMs, 'requestUrl');
      const status = typeof res.status === 'number' ? res.status : 0;
      if (status !== 0 && (status < 200 || status >= 300)) return null;
      const buf = await responseToArrayBuffer(res);
      if (buf && buf.byteLength) return buf;
      // Some transports hand binary back as a text response.
      if (typeof res.text === 'string' && res.text.length) {
        const bytes = new Uint8Array(res.text.length);
        for (let i = 0; i < res.text.length; i++) bytes[i] = res.text.charCodeAt(i) & 0xff;
        return bytes.buffer;
      }
      return null;
    } catch {
      return null;
    }
  }
  return fetchArrayBufferOutsideObsidian(url, timeoutMs);
}
