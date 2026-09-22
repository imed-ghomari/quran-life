---
name: quran-life-audio-player-stability
description: Maintain and extend the Quran Life Today-page audio player without reintroducing verse-start flicker, cut-off openings, skipped surah-based verses, laggy preview switching, or excessive InstantDB writes. Use when changing `src/components/AudioPlayer.tsx`, `src/lib/audio.ts`, verse preview sync on the dashboard, playback persistence, reciter-type transport behavior, or when adding, removing, or retyping reciters in the allowed reciter list.
---

Use this skill when working on the Today-page audio player, related verse-preview sync, or the reciter list in `src/lib/audio.ts`.

## Primary Files

- `src/components/AudioPlayer.tsx`
- `src/app/(app)/dashboard/page.tsx`
- `src/lib/audio.ts`
- `src/hooks/useInstantData.ts`

## Current Reciter Map

Trust the `type` field, not the id naming.

Every ayah-based reciter also carries `ayahAudioBase`: its per-ayah files are always
`<ayahAudioBase>/<SSS><AAA>.mp3` (3-digit surah + 3-digit ayah). Verified against all
6236 verses of every ayah map in `public/recitations/`. This is what lets the plugin
resolve playback and offline downloads without loading the ~2MB `verses` map
(`buildAyahAudioUrl()` + the `getAudioInfoForVerse()` fallback) — the map is still
preferred when it loads because it carries the word `segments`. When adding or
retyping a reciter, set `ayahAudioBase` from its JSON's common URL prefix.

## Current Player Availability

- The audio player currently uses `getAudioPlayerReciters()` from `src/lib/audio.ts`.
- Player availability is controlled by `NEXT_PUBLIC_AUDIO_PLAYER_RECITER_MODE`.
- Supported values:
  - `ayah-only`
  - `all`
- The current env-backed mode is `ayah-only`.
- This hides surah-based reciters from the Today-page player without deleting them from the master list.
- `getReciters()` still returns the full master list for non-player consumers.

### Surah-based reciters

- Abdul Basit Abdul Samad Mujawwad
- Abdul Rahman Al Sudais Murattal
- Abu Bakr Al Shatri Murattal
- Ahmad Alnufais
- Hady Toure
- Khalid Al Jalil
- Khalifa Al Tunaiji Murattal
- Maher Al Mu Aiqly Murattal
- Mahmoud Khaleel Al Husary
- Mahmoud Husary Muallim
- Mishari Rashid Al Afasy Murattal
- Muhammad Jibreel
- Muhammad Siddiq Al Minshawi Murattal
- Saud Al Shuraim Murattal
- Yasser Al Dosari Murattal

### Ayah-based reciters

- Abdur Rahman As Sudais
- Abdul Basit Abdul Samad Murattal
- Hani Ar Rifai Murattal
- Mahmoud Khalil Al Husary Murattal
- Mohamed Al Tablawi Murattal
- Saad Al Ghamdi Murattal

## Golden Rules

1. Keep transport split by reciter type.
2. Keep InstantDB writes queued, deduped, and off the hot playback path.
3. Prefer primitive effect dependencies and derived values over object dependencies.
4. Do not reintroduce per-verse source resets for surah-based auto-advance.

## Current Transport Model

### Surah-based reciters

- Load the surah file once and keep playback continuous inside the same file.
- Auto-advance the verse preview from current time instead of pausing and reseeking on every verse boundary.
- For normal same-source surah handoffs, switch on the next verse start time.
- When the next verse is the last visible verse or the last verse before a surah boundary, bias the handoff earlier by using the earlier of:
  - the current verse end time
  - the next verse start time
- This keeps most verse openings intact while still protecting the last-verse edge case.
- If the next verse is in a different surah/file, let the current verse finish using the current verse end boundary before swapping files.
- If the next verse is in a different surah/file, or there is no next verse in the daily portion, do not reuse the same-source handoff rule.
- Use the seamless handoff path in `AudioPlayer.tsx`:
  - `seamlessSurahAdvanceKeyRef`
  - `surahAdvanceGuardRef`
  - `maybeAdvanceVerse`
  - requestAnimationFrame boundary checks while playing
- Keep a short surah-only settle guard after seamless verse switches so React/UI catch-up does not chain-skip the next verse.
- Keep the verse-preview switch prompt for surah-based reciters. Do not add end grace there unless a verified dataset requires it.
- Manual previous/next, restart, reciter changes, and resume can still seek.

### Ayah-based reciters

- Keep the guarded per-verse loading path.
- It is acceptable to preload only the next file.
- Do not “optimize” ayah-based behavior by copying the surah-based continuous path unless you retest all startup/transition cases.

## Persistence + InstantDB Rules

- Playback persistence must not happen on every verse transition.
- Use queued + deduped writes before calling `saveSettings`.
- Persist on:
  - play -> pause
  - restart/manual verse jumps when needed
  - visibility hidden / unload
  - reciter change
  - speed change
- Do not put `saveSettings` inside high-frequency callbacks like `timeupdate`, animation frames, or word-highlight updates.

## Performance Rules

- Keep effect dependencies primitive when possible:
  - reciter id/type/path
  - surah id / ayah id / verse key
- Memoize derived verse-word arrays and per-verse audio info lookups when reused.
- Use refs for hot-path mutable state:
  - pending transport
  - seamless advance markers
  - queued persistence state
  - preload audio
- Word highlighting and preview scrolling should stay non-urgent where possible.

## Obsidian (plugin) transport notes

- `AudioPlayerLocal.tsx` is the plugin player; `AudioPlayer.tsx` is the web player.
  Both share `SPEED_OPTIONS` semantics (`0.75 … 2, 2.5, 3`).
- Never resolve the Obsidian `App` from `window.app` alone: mobile does not expose it.
  Use `getObsidianApp()` from `src/lib/obsidianApp.ts` (registered in `main.ts`).
- Keep audio on CORS-friendly hosts streaming directly (`resolveAudioUrl`); only fall
  back to the `requestUrl` → Blob proxy (`resolveAudioUrlProxied`) on playback error.
- Do not pause/reseek inside `onWaiting`/`onStalled`: that was the silent gap between
  per-ayah files on mobile. The stall watcher owns recovery.

## Regression Patterns To Avoid

- Pausing + reseeking at every surah-based verse boundary.
- Allowing seamless surah-based auto-advance to trigger twice before the next verse UI state settles.
- Using a next-surah start time from a different file as if it were a boundary inside the current surah file.
- Using the “earlier of current end and next start” rule for every same-source surah handoff. Keep that bias only for handoffs into a last verse.
- Triggering duplicate verse setup for the same verse/audio target.
- Showing a visible loader during every same-file surah-based auto-switch.
- Resetting highlighted word state during seamless surah-based handoff unless necessary.
- Adding new InstantDB writes from `timeupdate`, `requestAnimationFrame`, or stall polling.

## Fast Checks

Run:

```bash
rg -n "seamlessSurahAdvanceKeyRef|maybeAdvanceVerse|queueAudioSettingsPersist|preloadAudioRef|pendingTrackRef" src/components/AudioPlayer.tsx
npx eslint src/components/AudioPlayer.tsx
npx tsc --noEmit
```

Then manually verify:

1. Surah-based reciter: no start flicker on next verse.
2. Surah-based reciter: verse preview switches on time.
3. Ayah-based reciter: no regression in next-verse loading.
4. Pause/resume and reciter/speed changes still persist correctly.

## When Updating This Skill

- If the golden transport model changes, update this skill in the same task.
- If a bug fix depends on a dataset exception for specific reciters, document that here immediately.
- If you add/remove/retype a reciter in `src/lib/audio.ts`, update the frontmatter description if needed and keep the reciter map above in sync in the same change.
- If you change `NEXT_PUBLIC_AUDIO_PLAYER_RECITER_MODE` or `getAudioPlayerReciters()`, update the availability section above in the same task.
