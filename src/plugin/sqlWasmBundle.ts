/**
 * Plugin-only module: inlines sql-wasm.wasm into main.js as a base64 data URL
 * (esbuild `.wasm: dataurl` loader) and hands it to the shared Anki exporter.
 *
 * Why: Obsidian only installs main.js/manifest.json/styles.css from a release,
 * so the wasm cannot ship as a separate file. Inlining (~860KB) makes Anki
 * export work fully offline with zero downloads. This module must stay
 * plugin-only (imported from main.ts) so the Next.js web build never sees the
 * .wasm import.
 */
import wasmDataUrl from 'quranlife-sql-wasm.wasm';
import { setBundledWasmDataUrl } from '@/lib/anki/apkgExport';

setBundledWasmDataUrl(typeof wasmDataUrl === 'string' ? wasmDataUrl : null);
