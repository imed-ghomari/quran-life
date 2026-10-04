---
title: Fixing Mistakes
sidebar_position: 6
---

# Fixing Memory Gaps — 3-Strike / Leech

Even with a perfect mindmap, some verse groups will be harder. Anki can **automatically suspend** cards after 3× `Again` (Leech) so you can fix the *mindmap*, not just the verses. The recommended setup below uses auto-suspend.

## User Guide: How to Auto-Suspend and Find Quran Error Cards

### Step 1: Set Up Automatic Suspension (Do this once)

1. Open **Anki** and click the gear icon next to your **Quran Deck**.
2. Select **Options**.
3. Scroll down to the **Lapses** section:
	- **Leech threshold:** Set to `3` lapses.
	- **Leech action:** Set to `Suspend Card`.
4. Click **Save**.

> **How it works:** Whenever you hit "Again" 3 times on any verse, Anki will automatically suspend the card and tag it as `leech`.

### Step 2: Find Your Error Cards for Mindmap Revision

When you are ready to work on your weak verses in Obsidian:

1. Open Anki and press **`B`** (or click **Browse** at the top).
2. In the search bar at the top, paste this search: `deck:"YourQuranDeckName" is:suspended tag:leech`
3. Copy the list of verse numbers shown in the browser.
4. Open **Obsidian**, locate those verses in your mindmaps, and update your visual connections.

Tip: in Quran Life the deck is `QuranLife`, so you can search `deck:QuranLife is:suspended tag:leech` (or `deck:QuranLife tag:leech` to include non-suspended leeches).

### Step 3: Re-export & Unsuspend

1. Re-export your deck from the Obsidian plugin to update the cards in Anki.
2. In the Anki Browser (`B`), search `deck:"YourQuranDeckName" tag:leech is:suspended`.
3. Select all cards (`Ctrl + A` or `Cmd + A`), right-click, and select **Toggle Suspend** (`Ctrl + Shift + S` or `Cmd + Shift + S`) to put them back into rotation.
4. _(Optional)_ Remove the `leech` tag if you want a clean slate.

## How it Works (Anki-native details)

1. **Deck Options — export default vs recommended** `src/lib/anki/apkgExport.ts:534`:
   - Export sets `Leech threshold: 3` `Leech action: Tag Only` by default. After 3× `Again` on the same card, Anki adds `tag:leech`.
   - Recommended (see User Guide above): change `Leech action` to `Suspend Card` in `Deck Options → Lapses`, so error cards are auto-suspended (`is:suspended tag:leech`) until you fix the map.
   - You can also manually `Flag Red` (`Flag:1`) when you *feel* stuck, even before 3.

2. **Find leeches:**
   - If using auto-suspend (recommended): `deck:QuranLife is:suspended tag:leech`.
   - Otherwise: `Browse` → Left sidebar `Tags → leech` or search `tag:leech` or `flag:1`.
   - Filter further: `tag:leech tag:surah::67` or `deck:QuranLife tag:leech`.
   - Sort by `Card Created` or `Due` to see most urgent.

3. **Do NOT just `Again` again — mend the mindmap:**
   - Open `Anki Deck` tab → select that Surah (e.g., `67. Al-Mulk`).
   - `View` to see the map *above* splits, `Edit Mindmap` — ask: *Why did I confuse `15-24`?* Add a visual landmark, separate the branch, add a story for that chunk. Keep groups to 2–4 items per branch `src/lib/anki/cardBuilder.ts:105`.
   - If the group is too long, `Define Splits` → `+` to split `15-24` into `15-18` + `19-24` → `Save Splits`.

4. **Re-export the fix:**
   - `Export Full Deck to Anki` → re-import `.apkg` into Anki. Because `note guid` is stable `ql-{surah}-{start}-{end}` `src/lib/anki/apkgExport.ts:199`, Anki **updates** the existing note (keeps `Due`/`Ivl` for unchanged groups) and adds the new split groups as `New` cards. The old `15-24` card (now obsolete) stays as `leech`; you can `Delete` it or `Suspend` it manually.
   - For the `leech` card itself: after you fixed the map, in `Browse` select it → `Cards → Forget` (resets to `New`) or `Reschedule → 7 days` to give it a short interval, and remove `tag:leech` (`Right-click → Remove Tag`).

## Why “Mend Map, Not Just Repeat”

Blindly pressing `Again` on the same verse group builds a weak trace. Moving the similar verses far apart on the map and adding a logic bridge (thematic cause→effect) creates a distinct retrieval cue — the next recall uses the *map*, not rote sound.

## Quick Filters to Use Weekly

- `deck:QuranLife is:suspended tag:leech` — your auto-suspended 3-strike list (recommended)
- `deck:QuranLife tag:leech` — all 3-strike cards (including non-suspended)
- `deck:QuranLife flag:1` — your manual red flags (similarity errors)
- `deck:QuranLife tag:mutashabihat is:due` — due similar verses to prioritize
- `deck:QuranLife tag:surah::67` — all cards for a Surah you just edited

Tip: After fixing 2–3 leeches in one Surah, do a 5-min “teach method” — explain the map `Big Picture → Concept → Big Picture` out loud before the next Anki session.

