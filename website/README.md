# Quran Life docs site (Docusaurus)

This folder is the documentation website. It lives in the **`website/` subdir on the
long-lived `website` branch** so the default `main` branch stays plugin-only for
Obsidian community review (automated scanner, build verification, release assets).

- Deploy: push to `website` → `.github/workflows/deploy-website.yml` builds
  `website/` and deploys `website/build` to GitHub Pages
  (`https://imed-ghomari.github.io/quran-life/`).
- `website/docs/` — app guides from
  `quran-anki-companion-obsidian-plugin:content/` (`index` + `philosophy/*`).
  Mindmap reference docs (`content/mindmaps/*`, 100+ surah/part files) are
  intentionally excluded.
- `website/blog/` — blog from `origin/prod:content/blog/` (29 published + 3 drafts).
  `_template`, `_article-drafts`, `.obsidian/` excluded. `isPublished: false` → `draft: true`.

## Re-sync content

```bash
# on the website branch, from repo root:
python3 website/scripts/sync-content.py
cd website && npm ci && npm run build
```

## Merge plugin updates

```bash
git checkout website
git merge main   # clean: website/ is isolated, plugin files merge without conflicts
```

## Local dev

```bash
cd website
npm install
npm start
```
