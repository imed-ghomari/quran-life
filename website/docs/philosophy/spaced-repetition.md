---
title: How Reviews Work
sidebar_position: 4
---

# How Reviews Work

Reviews happen **entirely in Anki**. The app prepares your cards; Anki schedules them with smart scheduling. Each verse-group card is **interactive** — you don't just flip it and read.

## What a Verse-Group Card Looks Like

When a card appears, you see:

- **Top — context:** the 2 verses before your group, so you know where you are. For the very first verse (which has no previous verses) it shows the Surah name instead. For groups with similar verses elsewhere, extra context verses appear after you reveal everything, so you can verify which similar verse you recalled.
- **Middle — hidden verse chunks:** your verses, split into small meaningful pieces. Each piece starts blurred; the next one to recall is highlighted with a dashed outline.
- **Bottom — controls:** a Reveal next button, a counter (for example 3 / 7 chunks), and a done hint once everything is revealed. On long cards you can scroll; the next chunk stays centered.

## How to Go Through a Card — Step by Step

**Do not press Show Answer immediately.** The front is interactive:

1. **Read the context, recall the next chunk:** Look at the context verses and the highlighted chunk. Try to say the whole chunk from memory *before* revealing it.
2. **Reveal one chunk:** Click Reveal next or press Space. The highlighted chunk becomes clear, the following one gets highlighted, and the counter updates. Repeat until all chunks are revealed.
3. **All chunks revealed:** The Reveal button hides, the done hint appears, and for similar-verse groups extra context verses show up. Now check the full group plus its surroundings.
4. **Grade yourself — now press Show Answer:** Press Space again to show the answer. Anki's grading bar appears: Again (didn't remember), Good (remembered), Bury (postpone to another day). Be honest — Anki uses this to decide when to show you the card again (days, then weeks, then months).
5. **Back side:** You see the full verses, any similar-verse references (for example 2:23 and 11:45), your mindmap notes, and the verse range with the Surah name.

**Keyboard:** Space reveals the next chunk (until done), then shows the answer. 1 means Again, 2 means Good, B means postpone. On mobile, tap Reveal next.

## What the Export Sets Up (First Import)

The downloaded deck already comes with:

- One review deck with stable cards, so re-importing later keeps your review progress on unchanged groups.
- Smart scheduling switched on with a 90% retention target, and a 3-strike rule for difficult cards.

After the first import, open Anki → Deck Options and check that smart scheduling is enabled. Then set the leech action to **Suspend Card** as described in [Fixing Mistakes](./re-learning), so difficult cards pause automatically until you fix the map.

## Setting Surah Maturity in the Anki Browser

There is no maturity slider in the app — you do this in Anki's Browser:

- **Already know a Surah (make it more mature):** In the Browser, search for that Surah's cards, select them, right-click, then Reschedule and pick a due date — 30 days (or 90 for very strong Surahs). They will come back later.
- **Start a Surah over (make it New again):** Search for its cards, then choose Forget. They become New cards again.
- **Hide a Surah for now:** Search for its cards, then Suspend. To bring them back, select them and choose Unsuspend. (Hiding Surahs for daily reading is separate — that stays in Daily Portion Settings.)
- **Many Surahs at once:** Select several Surahs in one search and apply the same action.

Tip: in the Browser you can filter with searches like `is:due` (due now) or `tag:leech` (difficult cards).

## Why Reviews Sometimes Reset (and How to Delete Old Groups)

Reviews reset when the underlying verse grouping changes — this is intentional, not a bug:

1. **You changed the splits:** For example you split verses 1–5 into 1–3 plus 4–5, then exported again. Anki updates matching groups (keeping progress) and adds the new groups as New cards. But the old 1–5 card is now outdated — **delete it manually**: in the Browser search for that Surah's cards, sort by creation date, select the old group, and Delete it (or Suspend it if you want to keep history). Re-importing does not delete outdated groups by itself.

2. **You edited only the mindmap:** Nothing resets — re-importing updates your notes and images but keeps all review dates.

3. **3 times Again (difficult card):** Not a reset — the card is suspended and tagged so you can fix the map (see [Fixing Mistakes](./re-learning)).

**Rule:** if changing splits alters a group's verse range, treat the old group card as outdated — find it in the Browser and delete it, then study the new groups as New cards.

## Keyboard Shortcuts (Anki Desktop)

- Space → reveal next chunk; once all are revealed, Space → Show Answer → Good.
- 1 → Again (didn't remember)
- 2 or Enter → Good (remembered)
- B → postpone the card

**Mindmap cards** are separate: the front shows the title ("tap Show Answer to reveal"), the back shows your mindmap image plus your notes — grade them like any Anki card.
