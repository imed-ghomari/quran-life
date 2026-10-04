---
title: Settings & Daily Portion
sidebar_position: 8
---

# Settings & Daily Portion — Where to Set What

Daily reading settings stay in the app (Daily Portion tab). Review settings — maturity, splits, mindmaps — live in Anki (Browser) and the Anki Deck tab.

## Daily Portion (in the app)

You set these in Daily Portion → Settings (gear icon):

- **Active Part:** parts 1–7, or the whole Quran. This decides which Surahs appear in your daily cycle.
- **Daily Target:** 5–180 minutes per day. The app keeps your daily minutes steady and shows how many days it takes to finish the Part.
- **Mode:** Listening vs Reading. Reading style can be whole paragraphs (grouped by Surah) or line by line.
- **Surahs in Portion:** check or uncheck Surahs within the active Part, with Select All / Clear All shortcuts. Unchecking removes them from *daily reading only* — to hide them from reviews, suspend them in Anki instead (see below).

## Skipped Surahs and Maturity for Reviews (in the Anki Browser)

For how to suspend and unsuspend, reschedule, reset, flag, and do bulk operations, see:

**→ [How Reviews Work](./spaced-repetition)**

The same Browser searches from that guide apply here.

## Mindmaps, Splits and Export Order (Anki Deck tab + Obsidian Settings)

Not in Daily Portion Settings. For creating and editing mindmaps, previewing, defining splits, and writing notes, see:

**→ [Anki Deck & Reviews — Preparing](./practice-hub#preparing-in-the-anki-deck-tab)**

Card order inside the exported deck (which Part and Surah comes first) is set in Obsidian Settings → Quran Life → Anki Export.

## What Anki Already Sets for You (First Import)

The exported deck comes with smart scheduling switched on (90% retention target), a 3-strike rule for difficult cards, and interactive card layouts (blurred chunks, context verses that expand for similar verses). After the first import, just verify in Deck Options that smart scheduling is on, and set the leech action to Suspend Card as described in [Fixing Mistakes](./re-learning).

## Backup (Automatic — No Buttons Needed)

There are no Export / Import buttons in the plugin — everything is saved automatically into the plugin's own data folder inside your vault, so it syncs wherever your vault syncs:

- **Autobackup:** leave it on in Obsidian Settings → Quran Life → Storage & sync for instant saves as you work.
- **Old backups:** if you have a legacy JSON backup file, use the Migrate button in the same section to import it.
