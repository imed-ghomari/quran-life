---
title: "How surah mindmaps and verse groups work together, and what happens when you edit the verse groups"
description: "Why Quran Life treats verse groups as the practical breakdown of a surah mindmap, and what happens to your Anki progress when those groups change."
date: 2026-04-02
last_update:
  date: 2026-10-04
authors: quran-life
tags: [feature-deep-dive, philosophy]
slug: relationship-between-surah-mindmap-and-verse-groups
---

# How surah mindmaps and verse groups work together, and what happens when you edit the verse groups

In Quran Life, the surah mindmap and the verse groups are closely connected. The mindmap gives the structure of the surah, and the verse groups turn that structure into pieces you can actually review in Anki.

So when you choose where the surah should be split, you are also deciding how that surah will be carried in review.

That is why re-importing treats those edits carefully. When you export again and re-import into Anki, matching groups are updated in place and keep their review progress, while genuinely new groups arrive as New cards.

When you edit only the mindmap, nothing resets — your notes and images update but all dates stay. When you change the splits themselves, the old group card becomes outdated: delete it in the Anki Browser, since re-importing never removes cards by itself.

So the practical idea is simple: the surah mindmap gives the route, the verse groups break that route into reviewable pieces, and re-importing preserves what is still valid while you manually clear what no longer matches.
