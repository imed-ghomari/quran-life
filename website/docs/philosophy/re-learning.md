---
title: Fixing Mistakes
sidebar_position: 7
---

# Fixing Memory Gaps — 3-Strike Rule

Even with a perfect mindmap, some verse groups will be harder. Anki can **automatically suspend** cards after 3 times pressing Again, so you can fix the *mindmap*, not just repeat the verses. The recommended setup below uses auto-suspend.

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

Tip: in Quran Life the deck is called `QuranLife::Review` by default, and `deck:QuranLife` searches cover it (along with any sub-decks). If you renamed the deck on export, use your name instead in all searches below.

### Step 3: Re-export & Unsuspend

1. Re-export your deck from the Obsidian plugin to update the cards in Anki.
2. In the Anki Browser (`B`), search `deck:"YourQuranDeckName" tag:leech is:suspended`.
3. Select all cards (`Ctrl + A` or `Cmd + A`), right-click, and select **Toggle Suspend** (`Ctrl + Shift + S` or `Cmd + Shift + S`) to put them back into rotation.
4. _(Optional)_ Remove the `leech` tag if you want a clean slate.

## More Detail — How Difficult Cards Work

1. **Deck options — what the export sets vs what we recommend:**
   - The export sets a 3-strike threshold by default, tagging difficult cards after 3 times pressing Again.
   - Recommended (see the guide above): change the leech action to Suspend Card in Deck Options, so error cards pause automatically (`is:suspended`) until you fix the map.
   - You can also flag a card red yourself whenever you *feel* stuck, even before reaching 3 strikes.

2. **Find difficult cards:**
   - If using auto-suspend (recommended): search `deck:QuranLife is:suspended tag:leech`.
   - Otherwise: open Browse and look under Tags for leech, or search `tag:leech` or your red flags.
   - Narrow it down per Surah, for example difficult cards in one Surah, and sort by creation or due date to see the most urgent first.

3. **Do NOT just press Again again — fix the mindmap:**
   - Open the Anki Deck tab and pick that Surah.
   - View the map, then edit it — ask: *why did I confuse these verses?* Add a visual landmark, separate the branch, add a small story for that chunk. Keep groups to 2–4 items per branch.
   - If the group is too long, split it into two smaller groups in Define Splits and save.

4. **Re-export the fix:**
   - Export the full deck and re-import it into Anki. Matching cards are updated (keeping your review dates) and new split groups arrive as New cards. An outdated group card stays as it was — you can delete it or suspend it yourself.
   - For the difficult card itself: after fixing the map, select it in the Browser and choose Forget (starts over as New) or reschedule it a week ahead for a short interval, then remove the leech tag.

## Why “Fix the Map, Not Just Repeat”

Pressing Again on the same verse group builds a weak trace. Moving similar verses far apart on the map and adding a logic bridge (thematic cause and effect) creates a distinct retrieval cue — next time you recall using the *map*, not rote sound.

## Searches to Use Weekly

- `deck:QuranLife is:suspended tag:leech` — your auto-suspended difficult cards (recommended)
- `deck:QuranLife tag:leech` — all difficult cards (including ones that aren't suspended)
- `deck:QuranLife flag:1` — your manual red flags (similarity errors)
- `deck:QuranLife tag:mutashabihat is:due` — due similar verses to prioritize
- `deck:QuranLife tag:surah::67` — all cards for one Surah you just edited

Tip: After fixing 2–3 difficult cards in one Surah, do a 5-minute “teach back” — explain the map (big picture, then concept, then big picture again) out loud before the next Anki session.
