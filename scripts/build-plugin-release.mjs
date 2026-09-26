/**
 * Build the Obsidian plugin release zip.
 *
 * The community store / BRAT install from a GitHub Release asset. The zip
 * contains the standard files (manifest.json, main.js, styles.css) PLUS the
 * offline data the plugin needs on first run (Quran text + sql.js wasm), so a
 * fresh install works fully offline — audio stays stream-on-demand and is
 * downloaded only via the user-triggered Settings action.
 *
 * Usage: npm run plugin:release  (runs the production build first)
 */
import { execSync } from "child_process";
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

const required = [
  "manifest.json",
  "main.js",
  "styles.css",
  // Offline-first-run data (see README "Obsidian plugin" section)
  "qpc-hafs-word-by-word.json",
  "sql-wasm.wasm",
];
const missing = required.filter((f) => !fs.existsSync(path.join(root, f)));
if (missing.length) {
  console.error(`Refusing to release: missing files: ${missing.join(", ")}\nRun "npm run build" first.`);
  process.exit(1);
}

const sizes = required.map((f) => {
  const st = fs.statSync(path.join(root, f));
  return `  ${f} (${(st.size / 1024 / 1024).toFixed(2)} MB)`;
});
console.log(`Packaging quran-life ${version}:\n${sizes.join("\n")}`);

const distDir = path.join(root, "dist");
fs.mkdirSync(distDir, { recursive: true });
const zipName = `quran-life-${version}.zip`;
const zipPath = path.join(distDir, zipName);
try {
  fs.unlinkSync(zipPath);
} catch {}
execSync(`zip -j "${zipPath}" ${required.map((f) => `"${path.join(root, f)}"`).join(" ")}`, { stdio: "inherit" });

// Sanity-check the archive contents: exactly the files above, nothing else.
const listed = execSync(`unzip -l "${zipPath}"`, { encoding: "utf-8" });
console.log(listed);
for (const f of required) {
  if (!listed.includes(f)) {
    console.error(`Release zip is missing ${f}`);
    process.exit(1);
  }
}
console.log(`✓ dist/${zipName} ready — tag ${version} (no 'v' prefix) and push so the release workflow publishes it.`);
