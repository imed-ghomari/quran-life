---
name: quran-life-audio-player-stability
description: Maintain and extend the Quran Life Today-page audio player without reintroducing verse-start flicker, cut-off openings, laggy preview switching, or excessive InstantDB writes. Use when changing `src/components/AudioPlayer.tsx`, verse preview sync on the dashboard, reciter loading, playback persistence, or reciter-type transport behavior.
---

Use this skill when working on the Today-page audio player or related verse-preview sync.

## Primary Files

- `src/components/AudioPlayer.tsx`
- `src/app/(app)/dashboard/page.tsx`
- `src/lib/audio.ts`
- `src/hooks/useInstantData.ts`

## Golden Rules

1. Keep transport split by reciter type.
2. Keep InstantDB writes queued, deduped, and off the hot playback path.
3. Prefer primitive effect dependencies and derived values over object dependencies.
4. Do not reintroduce per-verse source resets for surah-based auto-advance.

## Current Transport Model

### Surah-based reciters

- Load the surah file once and keep playback continuous inside the same file.
- Auto-advance the verse preview from current time instead of pausing and reseeking on every verse boundary.
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

## Regression Patterns To Avoid

- Pausing + reseeking at every surah-based verse boundary.
- Allowing seamless surah-based auto-advance to trigger twice before the next verse UI state settles.
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
