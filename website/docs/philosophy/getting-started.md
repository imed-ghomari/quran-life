---
title: Getting Started
sidebar_position: 1
---

# Welcome to Quran Life

Quran Life helps you memorize the Quran using visual maps and steady daily reading, with reviews in Anki.

The plugin has **2 views** — **Daily Portion** (passive) and **Anki Deck** (active). Reviews live in **Anki**; you control maturity, difficult cards and splits from Anki's browser.

## 0. Install the Plugin in Obsidian

1. In Obsidian, open Settings → Community plugins → turn off Safe mode if needed → Browse → search **Quran Life** → Install → Enable. (If it isn't in the store yet, download the latest release from GitHub and copy `main.js`, `manifest.json` and `styles.css` into a `quran-life` folder inside your vault's plugins folder, then enable it.)
2. Open the plugin from the left ribbon icon.

## 1. Daily Portion (Passive — no Anki yet)

Open **Daily Portion** every day.

- **First launch:** the app downloads the Quran text once (you'll see a progress bar). Leave it until it finishes — after that everything works offline.
- **What you get:** a short set of verses for your current Part (see Active Part in settings). Listen or read to get familiar with sound and flow. The app keeps your daily minutes steady and tells you how many days it takes to finish the Part.
- **Skip:** In Daily Portion Settings, uncheck Surahs you already know under Surahs in Portion. To skip a Surah for reviews, suspend it later in Anki instead — not here.
- **When to move on:** After 2–3 cycles the verses feel familiar, you are ready to create a mindmap for that Surah. You can still memorize by rote, but always create a mindmap afterwards — it's your memory anchor.

## 2. Create Your Mindmap + Splits (Anki Deck tab)

Open **Anki Deck**, choose a Surah from the dropdown. The first time, the app may download the Quran text once — wait for the progress to finish.

- **Draw the mindmap (required for export):** Choose Create Mindmap and draw with the built-in editor (select, pen, text, arrows and shapes; undo is your friend), then Save. Only Surahs **with** a mindmap are exported — splits you define on a Surah without a mindmap are silently skipped, so always start with the map. The official pre-made maps are still being prepared — you don't have to wait for them. Keep groups to 2–4 items per branch (see [Mindmap Strategy](./mindmap-strategy)).
- **Split the Surah** into verse groups that match the map: use the inline Define Splits (plus / remove per verse, then Save Splits). For short Surahs of 10 verses or fewer you get one automatic group covering the whole Surah; your saved splits replace it.
- **Preview:** View shows or hides the mindmap image under the selector (hidden by default to keep the tab fast) — it sits above the splits so you can see the map while you split.
- **Notes:** Write in the Notes for this mindmap box. It saves automatically and is added to your cards. This is where you add the theme, story, or logic for similar verses.
- **Deck name:** the export uses `QuranLife::Review` by default. You can rename it, but every search in these guides assumes the default name — if you rename it, replace `QuranLife` with your name in all searches.

## 2b. Share Mindmaps (Import / Export, optional)

If you want to exchange maps with other users, in **Anki Deck** the MINDMAPS card has **Import** and **Export** buttons. Sharing is optional — you don't have to create or share your own maps while the official collection is being prepared.

- **Import someone's `.zip`:** press **Import**, then **Choose .zip file** and pick the file. Tick what to bring in and press **Import**. Items you already have show as **Have it** and are skipped unless you tick **Replace existing**. You can import several files gradually — for example one per Quran part.
- **Export your own `.zip`:** press **Export**, tick the mindmaps you want to share (mindmap + verse groups + notes travel together), check the file name, then press **Export**. Your browser downloads the `.zip` and a copy is also saved in your vault, so you can find it again on mobile where downloads are often blocked. Send that file to other users — they bring it in with **Import**.
- **Good to know:** exporting only includes what you ticked. If a friend sends you an update for a Surah you already have, re-import that file with **Replace existing** on.

## 3. Export and Import into Anki

In **Anki Deck**, choose Export to Anki and wait for the "Done" message.

- **Where is the file?** On desktop Obsidian your browser downloads `quran-life-deck.apkg`. On mobile the download is often blocked — a copy is always saved inside your vault as well, so you can open or share it from there.
- **Import on desktop:** double-click the `.apkg` file, or in Anki go to File → Import and pick it. Then press Import.
- **Import on mobile:** open the `.apkg` file on your device (for example from the Files app) and choose Anki to open it.
- **On the import screen:** Anki matches the file's cards with cards already in your collection. If you see options about updating existing notes or cards, leave them **enabled** — that is what applies your map and split edits instead of piling up duplicates. If you see anything about overwriting scheduling or progress, leave that **disabled**. The file carries no review history (every card arrives New on first import), so your existing progress is safe either way. Anki reports how many cards were added vs updated.
- **After importing:** your deck appears with verse cards plus mindmap cards, all New on the first import. Re-importing later updates matching cards (new notes, new images) and keeps review dates; brand-new groups arrive as New cards. Outdated groups (splits you changed) are **not** removed automatically — delete those old cards yourself (see [How Reviews Work](./spaced-repetition)).
- **Check your Anki version:** smart scheduling needs Anki 23.10 or newer (desktop or mobile). Update Anki first if your version is older.

## 4. Review and Grade in Anki

- **Card layout:** The front shows the previous verses for context plus the new verses hidden in small blurred chunks. Reveal unveils one chunk at a time. The back shows the full verses, any similar-verse references, and the verse range. Your mindmap notes live on dedicated mindmap cards.
- **Grading:** After all chunks are revealed, press Show Answer, then Again (didn't remember) or Good (remembered) — those two are all you need (Anki also offers Hard and Easy; ignore them). Bury postpones a card to another day. The Space key reveals the next chunk, then grades.
- **Scheduling:** The export already sets up smart scheduling with a 90% retention target and a 3-strike rule for difficult cards. After import, open Deck Options, check that smart scheduling is switched on, then set the leech action to Suspend Card as described in [Fixing Mistakes](./re-learning).
- **Syncing between devices:** sign into AnkiWeb in Anki's preferences and sync — your cards, progress and scheduling carry over to your phone.

## 5. Staying on Track in Anki

You manage maturity, difficult cards and splits in the Anki Browser:

- **Set maturity:** Select verse-group cards, right-click, then Reschedule and pick a due date (for example 7 days for new, 30 for medium, 90 for strong), or reset them to New. You can also use Flag or Suspend to hide cards. See [Settings](./settings).
- **3-strike / difficult cards:** After 3 times pressing Again, Anki suspends the card and tags it for you. In the Browser search for your suspended tagged cards, open the mindmap in Anki Deck, improve the map (add detail, separate similar branches), then re-export. Do **not** just keep pressing Again — fix the map. See [Fixing Mistakes](./re-learning).
- **Similar verses:** Search for cards tagged with similar verses. When you confuse two verses, flag the card red and place the two verses far apart on the mindmap. See [Similar Verses](./mutashabihat).
- **Split changed? Delete the old group:** If you change your splits (for example from verses 1–5 into 1–3 plus 4–5), the old 1–5 card is now outdated. In the Browser search for that Surah's cards, delete the old group card (or suspend it if you want to keep history), then re-import. Anki updates matching cards and keeps review progress for unchanged groups. See [How Reviews Work](./spaced-repetition).

Track daily reading in the app, and review history and maturity in Anki's Stats and Browser. Next: [Mindmap Strategy](./mindmap-strategy) → [How Reviews Work](./spaced-repetition).
