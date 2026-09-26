/**
 * Validate the Obsidian plugin release files.
 *
 * The GitHub Release must contain EXACTLY manifest.json, main.js and
 * styles.css — anything else triggers an "extra unsupported files" review
 * note and is ignored by Obsidian anyway. Runtime data is handled inside the
 * plugin: the Quran corpus downloads once on first launch (then cached in the
 * vault) and the sqlite wasm is inlined into main.js.
 *
 * Usage: npm run plugin:release  (runs the production build first)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf-8"));
const version = manifest.version;
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Refusing to release: manifest.json version is missing or not semver (${version})`);
  process.exit(1);
}

const required = ["manifest.json", "main.js", "styles.css"];
const missing = required.filter((f) => !fs.existsSync(path.join(root, f)));
if (missing.length) {
  console.error(`Refusing to release: missing files: ${missing.join(", ")}\nRun "npm run build" first.`);
  process.exit(1);
}

for (const f of required) {
  const st = fs.statSync(path.join(root, f));
  console.log(`  ${f} (${(st.size / 1024 / 1024).toFixed(2)} MB)`);
}
console.log(`✓ quran-life ${version} release files ready — tag ${version} (no 'v' prefix) and push so the release workflow publishes them.`);
