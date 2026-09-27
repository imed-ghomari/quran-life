---
title: Anki Deck & Reviews
sidebar_position: 2
---

# Anki Deck & Reviews

This app does not have a review queue inside it. Your reviews happen in **Anki**.

## Where Everything Lives

- **Daily Portion tab** — daily reading or listening. Passive, stays in the app.
- **Anki Deck tab** — prepare. Choose a Surah, create/edit its mindmap, adjust splits, preview, then export.
- **Anki app** — review. After import, Anki shows you cards when they are due.

## Preparing in the Anki Deck Tab

For each Surah:

1. **Mindmap:** `Create Mindmap` or `Edit Mindmap` (`tldraw` `src/components/MindmapEditor.tsx`) → `Save`. `View` toggles an inline preview *under* the selector (hidden by default).
2. **Splits:** `Define Splits` → `+` / `×` per verse, `Save Splits` (`btn btn-primary`). For `≤10` verses you get 1 auto-group `1–N`; your saved splits replace it.
3. **Notes:** `Notes for this mindmap` textarea is saved on `blur` or tab switch and exported as `MindmapDocs`.
4. **Export:** `Export Full Deck to Anki` → import `.apkg` into Anki. Re-importing same deck **updates** existing notes (stable `guid` `ql-{surah}-{start}-{end}`) and keeps `Due` for unchanged groups.

A Surah is ready when it has a mindmap (optional but recommended) and its verses are split.

## Reviewing — See Detailed Walkthrough

The verse-group card has custom reveal logic (context, blurred chunks, `Reveal next`, `doneHint`). For the full step-by-step — what the front looks like, how to reveal with `Space`, when extra context appears, and how to grade (`Again`/`Good`/`Bury`) — see:

**→ [How Reviews Work](./spaced-repetition) — Card Walkthrough + FSRS + Shortcuts**

## After Review — Manual Fixes (Links)

- **Leech (3× `Again`):** See [Fixing Mistakes](./re-learning) (`tag:leech` → fix map → `Forget`).
- **Similar confusion:** See [Similar Verses](./mutashabihat) (`Flag Red` → `flag:1` → spread on map).
- **Split changed:** See [How Reviews Work](./spaced-repetition) (`deck:QuranLife tag:surah::67` → delete old `Range`).

## Deck Statistics

`Anki Deck → Deck Statistics` `src/components/AnkiDeckTab.tsx:781` shows `Surahs/Parts with mindmap`, `Verse groups`, `Docs` using merged `premadeForStats`. See [Tracking Progress](./statistics) for `Anki Stats` vs daily.

