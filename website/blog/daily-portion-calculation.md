---
title: "How Quran Life calculates your daily portion"
description: "A short explanation of how Quran Life turns your active part and daily time target into a sustainable daily portion."
date: 2026-03-31
last_update:
  date: 2026-04-06
authors: quran-life
tags: [feature-deep-dive]
slug: daily-portion-calculation
---

# How Quran Life calculates your daily portion

Quran Life does not treat daily portion as a random reading target. It first decides which surahs are still eligible for passive exposure, then it uses your chosen daily time target to size the portion and snaps that target to a meaningful stopping point.

Eligibility comes first. The app looks at your active part, removes any surah you explicitly skipped, and also removes any surah that currently has at least one verse group already reviewed in the smart review system. In other words, daily portion is for surahs that are still in the passive-familiarity stage, not surahs that have already entered review.

That rule is reversible. If you manually reset a surah's verse-group memory nodes back to a fresh state in Settings, that surah becomes eligible for daily portion again.

Once the eligible surahs are selected, Quran Life starts from your active part and your daily minutes target, estimates how much content fits that time in your current mode, and then snaps that target to a meaningful stopping point. The cycle length is derived afterward from the remaining eligible material, not forced in advance.

That snapping matters. The app prefers to stop at a surah ending when possible. If that does not fit, it looks for a rub boundary. If that does not fit either, it looks for a ruku boundary. If none of those fall within the target window, it falls back to the nearest ayah boundary.

So the daily portion is based on ruku and other structural logic, not only raw word count. The goal is not just to keep you busy today. The goal is to keep your current territory moving in chunks that feel finishable and repeatable.

This matters because many students either choose too little and drift, or choose too much and quietly stop being consistent. A good daily portion is not the largest amount you can survive for one day. It is the amount you can repeat long enough for the sound and flow of the surah to become familiar.

