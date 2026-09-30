/**
 * Build-time guard that keeps runtime script-element creation out of the bundle.
 *
 * Obsidian's plugin review rejects bundles that can create script elements at
 * runtime ("Code creates script elements at runtime" check). Two bundled
 * dependencies still ship legacy script-injection fallbacks:
 *
 *  - react-dom: its resource-preloading helpers inject <script> elements when an
 *    app calls ReactDOM.preload/preinit with a script resource, or renders
 *    `<script src>`. This plugin never uses either, so the path is dead code.
 *  - immediate (via jszip → lie): its scheduler probes/creates a <script>
 *    with `onreadystatechange` as a last-resort fallback after
 *    MutationObserver and MessageChannel. Chromium (desktop and mobile
 *    Obsidian) always has both, so the script fallback never runs.
 *
 * The patch rewrites the created tag to an inert <template>: no script element
 * can be created or executed, the schedulers keep their faster paths, and dead
 * react-dom branches stay structurally intact.
 *
 * Every expected pattern must be present — a dependency upgrade that changes the
 * emitted text fails the build instead of silently shipping the fallback again.
 * The `onEnd` hook additionally verifies the final main.js contains no script
 * element creation at all.
 */
import fs from "node:fs";
import path from "node:path";

const SCRIPT_TAG = "script";
const INERT_TAG = "template";
// Both quote styles: react-dom emits double quotes, immediate single quotes.
const SCRIPT_ELEMENT_CALLS = [`createElement("${SCRIPT_TAG}")`, `createElement('${SCRIPT_TAG}')`];
const INERT_ELEMENT_CALL = `createElement("${INERT_TAG}")`;
const BUNDLE_PATTERN = new RegExp(`createElement\\(\\s*["'\`]${SCRIPT_TAG}["'\`]\\s*\\)`);

const PATCH_RULES = [
  {
    name: "react-dom client (resource preloading helpers)",
    file: /react-dom[\\/]cjs[\\/]react-dom-client\.(?:production|development)\.js$/,
    minReplacements: 3,
  },
  {
    name: "immediate scheduler (script fallback probe)",
    file: /immediate[\\/]lib[\\/](?:index|browser)\.js$/,
    minReplacements: 2,
  },
];

export function scriptElementGuard() {
  return {
    name: "quran-life-script-element-guard",
    setup(build) {
      build.onLoad({ filter: /\.js$/ }, (args) => {
        const rule = PATCH_RULES.find((r) => r.file.test(args.path));
        if (!rule) return null;
        let contents = fs.readFileSync(args.path, "utf8");
        let found = 0;
        for (const call of SCRIPT_ELEMENT_CALLS) {
          found += contents.split(call).length - 1;
          contents = contents.split(call).join(INERT_ELEMENT_CALL);
        }
        if (found < rule.minReplacements) {
          throw new Error(
            `[script-element-guard] ${rule.name}: expected at least ${rule.minReplacements} ` +
              `script-element call(s) in ${args.path}, found ${found}. ` +
              `Update scripts/esbuild-script-element-guard.mjs for the new dependency version.`
          );
        }
        if (BUNDLE_PATTERN.test(contents)) {
          throw new Error(`[script-element-guard] ${args.path} still creates script elements after patching.`);
        }
        return { contents, loader: "js" };
      });

      build.onEnd((result) => {
        if (result.errors.length) return;
        const outfile = path.resolve(process.cwd(), "main.js");
        let out = "";
        try {
          out = fs.readFileSync(outfile, "utf8");
        } catch {
          return; // main.js not written yet (watch startup)
        }
        if (BUNDLE_PATTERN.test(out)) {
          throw new Error(
            `[script-element-guard] main.js still contains runtime script element creation. ` +
              `A dependency is injecting script elements — patch it in scripts/esbuild-script-element-guard.mjs.`
          );
        }
      });
    },
  };
}
