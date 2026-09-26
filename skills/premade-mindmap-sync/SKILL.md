---
name: premade-mindmap-sync
description: Sync user backup JSON into public/premade-anki-data.json as default preconfigured mindmaps (surah/part/meta) with docs and splits. Use when user provides a backup or asks to make mindmaps default.
---

# Premade Mindmap Sync

Use this skill whenever the user provides a backup JSON (e.g., `quran-life-anki-backup-*.json`, `quran-life-backup-*.json`) and wants its mindmaps to become default preconfigured mindmaps for all users. Even if the user forgets to say "update premade", apply this workflow proactively when a backup contains mindmaps for `surah-*`, `part-*`, or `meta-*`.

## Trigger Terms

- "premade mindmap", "default mindmap", "preconfigured mindmap"
- "backup json", "quran-life-anki-backup", "make it default"
- "part 7 mindmap", "meta mindmap", "surah mindmap"
- "add to premade", "sync backup to premade"

## Source of Truth

- Default: `public/premade-anki-data.json:1` — `{splits: Record<surahId, AnkiAnchor[]>, mindmaps: Record<key, AnkiMindmap>, mindmapDocs: Record<key, string>}` where `key` is `surah-50`, `part-7`, `meta-0`.
- Runtime: `src/components/AnkiDeckTab.tsx:125` `fetchPremadeForKey` and `src/components/AnkiDeckTab.tsx:492` `handleExport` merge (`{...premade, ...local}` local wins, deleted filtered via `src/lib/anki/mindmapStore.ts:103` `loadDeletedMindmapKeys`).
- Storage: `src/lib/anki/mindmapStore.ts:3` `quran-life:anki:mindmaps:v1`, `src/lib/anki/splitStore.ts:6` `quran-life:anki:splits:v1`, `src/lib/anki/mindmapDocsStore.ts:3` `quran-life:anki:mindmapDocs:v1`.

## Workflow

### 1. Inspect Backup

```bash
python3 -c "
import json, pathlib
p='BACKUP_PATH'  # e.g., quran-life-anki-backup-2026-09-08.json
with open(p) as f: d=json.load(f)
print('mindmaps', sorted(d.get('mindmaps',{}).keys()))
print('splits', list(d.get('splits',{}).keys())[:10], 'total', len(d.get('splits',{})))
print('docs', sorted(d.get('mindmapDocs',{}).keys()))
for k,v in d.get('mindmaps',{}).items():
  snap=v.get('snapshot',{})
  store=snap.get('store',{}) if isinstance(snap,dict) else {}
  print(k, 'shapes', len([kk for kk in store if kk.startswith('shape:')]), 'kind', v.get('kind'))
"
grep -o '"meta-0"\|"part-7"' BACKUP_PATH | head
```

- Backup format is `AnkiDeckTab` export: `{splits, mindmaps, mindmapDocs, deckName, exportedAt}` (legacy top-level) or `version:2` with `anki/daily/theme`. Mindmap entry is `{key, kind: 'surah'|'part'|'meta', surahId/partId, snapshot: {store: { 'page:page', 'shape:...'}}, imageUrl, isComplete}`.

### 2. Compare with Premade

```bash
python3 -c "
import json
with open('public/premade-anki-data.json') as f: pre=json.load(f)
with open('BACKUP_PATH') as f: bak=json.load(f)
print('premade', len(pre['mindmaps']), sorted(pre['mindmaps'].keys())[:5])
print('has part-7?', 'part-7' in pre['mindmaps'], 'meta-0?', 'meta-0' in pre['mindmaps'])
for k in bak.get('mindmaps',{}):
  if k not in pre['mindmaps']: print('NEW', k)
"
```

### 3. Merge (premade base, backup overrides only when meaningful)

Create `scripts/merge-premade.js` or inline python:

```python
import json
pre=json.load(open('public/premade-anki-data.json'))
bak=json.load(open('BACKUP_PATH'))
merged_mindmaps=dict(pre.get('mindmaps',{}))
added, updated=[], []
for k,v in bak.get('mindmaps',{}).items():
  snap=v.get('snapshot') if isinstance(v,dict) else None
  if not snap or not isinstance(snap,dict): continue
  store=snap.get('store',{})
  bak_shapes=len([kk for kk in store if kk.startswith('shape:')]) if isinstance(store,dict) else 0
  pre_v=merged_mindmaps.get(k)
  if not pre_v or not pre_v.get('snapshot'):
    merged_mindmaps[k]=v; added.append(k); continue
  pre_store=pre_v.get('snapshot',{}).get('store',{})
  pre_shapes=len([kk for kk in pre_store if kk.startswith('shape:')]) if isinstance(pre_store,dict) else 0
  if bak_shapes>0 and pre_shapes==0: merged_mindmaps[k]=v; updated.append(f"{k} {pre_shapes}->{bak_shapes}")
  elif bak_shapes > pre_shapes*1.2: merged_mindmaps[k]=v; updated.append(f"{k} {pre_shapes}->{bak_shapes}")
# docs: only add if missing or premade is placeholder "_Not added yet._"
merged_docs=dict(pre.get('mindmapDocs',{}))
for k,v in bak.get('mindmapDocs',{}).items():
  if not isinstance(v,str) or not v.strip(): continue
  pre_v=merged_docs.get(k,'')
  if not pre_v: merged_docs[k]=v
  elif '_Not added yet._' in pre_v and '_Not added yet._' not in v: merged_docs[k]=v
# splits: backup usually {} — only add if premade missing and array non-empty
merged_splits=dict(pre.get('splits',{}))
for k,arr in bak.get('splits',{}).items():
  if k not in merged_splits and isinstance(arr,list) and len(arr)>0:
    merged_splits[k]=arr
pre['mindmaps']=merged_mindmaps; pre['mindmapDocs']=merged_docs; pre['splits']=merged_splits
open('public/premade-anki-data.json','w').write(json.dumps(pre, separators=(',',':')))
print(f"added {added} updated {updated} total {len(merged_mindmaps)}")
```

- Keep `public/premade-anki-data.json` minified (`separators=(',',':')`) to avoid huge diff; original is single line.
- Do **not** overwrite `surah` mindmaps that already have similar shape count — keep premade unless backup is clearly richer (empty→non-empty or >20% larger).

### 4. Validate

```bash
python3 -c "
import json
with open('public/premade-anki-data.json') as f: d=json.load(f)
print('mindmaps', len(d['mindmaps']), sorted(d['mindmaps'].keys()))
for k in ['part-7','meta-0','surah-50','surah-99']:
  v=d['mindmaps'].get(k)
  print(k, bool(v and v.get('snapshot')), len(v['snapshot']['store']) if v and v.get('snapshot') else 0)
print('file', __import__('pathlib').Path('public/premade-anki-data.json').stat().st_size//1024, 'KB')
"
npx tsc --noEmit --skipLibCheck
```

- Ensure total stays < ~15MB (quota is 5-10MB for `localStorage`; export merges at runtime so bulk persist is avoided, but file itself can be larger).
- Ensure `src/lib/anki/cardBuilder.ts:105` `buildMindmapCards` will include new `kind` (`surah|part|meta`).

### 5. Commit & Push (one command)

```bash
git add public/premade-anki-data.json && git commit -m "chore: sync premade mindmaps from backup (added part-7/meta-0, docs)" && git push origin daily-portion-only
```

- Always on `daily-portion-only` per `AGENT.md:15`.
- Push immediately after finish — use one long command.

## Edge Cases

- Backup contains `surah-50..74` duplicates that already exist in premade — skip unless significantly larger; log `added`/`updated`.
- Backup `part-1..3` with 0 shapes — skip (premade `part-4` has 5 shapes, keep it).
- Backup missing `meta-0` but user said it should be there — tell user which keys were actually added and ask for missing `meta-0` file.
- `splits` for `54-76` are `[]` in current premade — treat as missing (auto single group), don't copy empty arrays from backup.
- If backup is `version:2` global (with `daily`/`theme`), extract `anki` sub-object for premade; `daily`/`theme` are **not** part of `premade-anki-data.json` (they are for global backup in `src/components/AppTabs.tsx:30`).

## Verification Checklist

- [ ] `public/premade-anki-data.json` has new `part-*`/`meta-*` with `snapshot.store` containing `shape:` entries.
- [ ] `npx tsc --noEmit --skipLibCheck` passes.
- [ ] `AnkiDeckTab` export preview shows new mindmap via `fetchPremadeForKey` and `handleExport` merge.
- [ ] Pushed to `daily-portion-only` in one command.

## Example Prompt Handling

If user says: "here is a backup it contains additionally mindmap for meta and part 7" and provides `quran-life-anki-backup-2026-09-08 (1).json`:

1. Run inspect (step 1) — you will see `part-7` 799 shapes, no `meta-0`.
2. Merge `part-7` only, report `meta-0 missing` and ask for second file.
3. Validate and push.
