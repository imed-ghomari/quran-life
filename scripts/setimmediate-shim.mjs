// Minimal setImmediate stand-in for jszip: jszip only calls the global
// `setImmediate(fn)` to yield to the event loop during (de)compression.
// A setTimeout-based global is equivalent here (it is what the polyfill
// itself falls back to in Chromium) and avoids bundling the polyfill's
// `new Function` string-eval path, which static review flags.
if (typeof globalThis.setImmediate !== "function") {
  globalThis.setImmediate = (fn, ...args) => globalThis.setTimeout(() => fn(...args), 0);
}
if (typeof globalThis.clearImmediate !== "function") {
  globalThis.clearImmediate = (id) => globalThis.clearTimeout(id);
}
export default {};
