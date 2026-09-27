---
title: Similar Verses
sidebar_position: 5
---

# Similar Verses (Mutashabihat) — Manual Check

Similar verses (mutashabihat) are verses that look/sound almost identical — the #1 source of “I knew it but said the other one.”

## How the App Marks Them (Export-time)

- For each verse in a group, `src/lib/anki/cardBuilder.ts:43` calls `getMutashabihatForAbsolute(abs)` `src/lib/mutashabihat.ts:172`. If any verse has a match, `relatedGroups: ["2:23 ~ 11:45", ...]` (cap 8) `src/lib/anki/cardBuilder.ts:68` and `tags.push('mutashabihat')` `src/lib/anki/cardBuilder.ts:73`.
- `ContextFront` is baked with **5** verses before `startVerse` `src/lib/anki/cardBuilder.ts:60`, but the template shows **2** normally and **5** (`2` + `3 extra` `class="extra"` `src/lib/anki/apkgExport.ts:214`) only when `hasMutashabihat` and all chunks are revealed `src/lib/anki/apkgExport.ts:284`. That extra context is the disambiguator.
- Back shows `RelatedGroups` field. Front neverauto-hints until you’ve revealed the group.

## How to Check — In Anki Browser (no Settings list)

- **All with similarities:** `Browse → tag:mutashabihat` or search `tag:mutashabihat` → `≈ 30%` of your deck.
- **Due + similar (priority):** `tag:mutashabihat is:due` or `tag:mutashabihat prop:due<7`
- **By Surah:** `tag:mutashabihat tag:surah::2` — see which groups in `2. Al-Baqarah` are confusable.
- **On the card:** Back field `RelatedGroups` lists `2:23 ~ 11:45` etc. Clicking it does not navigate — use `Browse` search `2:23` to open the other group.

## How to Deal — Logic, Not Tricks

1. **Reactive (when you fail):** You pressed `Again` because you said `11:45` instead of `2:23`. Immediately `Flag Red` (`Flag:1` or `Ctrl+1`) or `Add Tag → error::similar`. Do **not** just bury — flag so you can filter later `flag:1` or `tag:error::similar`.

2. **Fix the map (visual separation):**
   - Open `Anki Deck → Surah 2` → `View` (now inline above notes) → `Edit Mindmap`.
   - Place `2:23` and `11:45` on **different main branches**, far apart. Add a thematic cue: e.g., `2:23` is in “Challenge to produce a surah” (Makkan challenge), `11:45` is in “Nuh’s son” story — draw that distinction.
   - `Save` → `Export Full Deck` → re-import. The `leech`/`flag` card keeps its `Due` until you `Forget`/`Reschedule`.

3. **Proactive (weekly):** Pick one `tag:mutashabihat` Surah, explain its groups aloud using the map, and for each `RelatedGroups` entry, recite *both* verses and state the thematic difference.

## Why This Matters

Tricks (`first letter Alif before Ya`) fade. Thematic flow + spatial separation on the mindmap gives a **retrieval cue** that survives spaced repetition. The app’s `5`-verse context (`2` → `5` when `mutashabihat`) is your verification tool after recall, not a hint before.

**Filters to keep:** `tag:mutashabihat`, `tag:leech`, `flag:1`, `deck:QuranLife is:due`

