---
title: Tracking Progress
sidebar_position: 8
---

# Tracking Your Progress — Two Places

Your progress is now split: **daily reading** in the app, **reviews** in `Anki`.

## Understanding Memory Strength (Anki FSRS)

Anki's `FSRS` maps to the old `New/Medium/Strong/Mastered`:

- **New** (red): `Again` recently or `Forget` — `Due` = `New #`, `Ivl` = `0`.
- **Learning / Medium** (orange/green): `Ivl` `14–30` days — `prop:ivl>14 prop:ivl<30` in `Browse`.
- **Strong** (blue): `Ivl` `30–90` days.
- **Mastered** (deep): `Ivl` `>90` days, eventually months.

Check `Anki → Stats` (click deck → `Stats`) for `Retention`, `Due`, `Retention` vs `Desired Retention 0.90`.

## What You Can Track

- **Daily Portion (in-app):** `Anki Deck → Deck Statistics` `src/components/AnkiDeckTab.tsx:781` — see [Anki Deck & Reviews](./practice-hub) for the breakdown.
- **Reviews (in Anki):** For `is:due`, `tag:leech` (3-strike), `tag:mutashabihat`, `flag:1`, and per-Surah filters, see:
  - **[Fixing Mistakes](./re-learning)** for `leech`/`flag`
  - **[Similar Verses](./mutashabihat)** for `mutashabihat` checks
  - **[How Reviews Work](./spaced-repetition)** for `is:due`/`prop:ivl` and maturity

  In `Anki → Stats` you get `Retention`, `Due`, and `Calendar` heatmap (replaces old in-app heatmap).

## Filters (Daily Portion)

Your daily progress still respects `Active Part` and `Skipped Surahs` checked in `Daily Portion → Settings`. Changing `Active Part` does **not** affect Anki `Due`; Anki is global. Use `Suspend`/`Unsuspend` in `Browse` to hide/show Surahs for reviews.

## When to Reset

- **Daily reading:** `Daily Portion → Settings → Reset This Part / Reset All`.
- **Reviews:** `Browse → Select cards → Forget` (makes `New`) or `Reschedule` (sets new `Due`). Do this after you `Delete` obsolete `Range` cards when you changed splits (see [How Reviews Work](./spaced-repetition)).

