---
name: ui-redesign-guardrails
description: UI design/redesign workflow with deployment parity checks for this app. Use when creating or changing layouts/components, refining responsive behavior, or fixing differences between localhost and deployed devices (desktop/mobile), especially CSS cascade conflicts, stale assets, or service-worker cache mismatches.
---

# UI Redesign Guardrails

Build UI changes that stay consistent across localhost and deployed devices.

## 1) Scope and Baseline

- Identify the exact surface changed: route, component, and breakpoint.
- Capture baseline screenshots for desktop and mobile before editing.
- Keep one source of truth per styling concern; avoid duplicate class definitions in multiple global locations when possible.

## 2) Implement with Stable Selectors

- Prefer component-local styles or uniquely scoped classes for critical labels and controls.
- Avoid fragile dependencies on broad global selectors for essential text visibility.
- Avoid adding new `!important` rules unless there is no safer option.
- When using segmented/toggle controls, set explicit column behavior for each target breakpoint.

## 3) Deploy-Parity Safety Checks

- Verify both localhost and deployed URL for the exact changed screens.
- Test at least: one desktop viewport and one mobile viewport.
- If behavior differs by device, suspect stale assets/service-worker cache before assuming logic bugs.

## 4) Cache and Version Discipline

- Keep JS/CSS fetch strategy biased toward fresh code (network-first or equivalent) when using a service worker.
- Version cache names when changing runtime caching behavior.
- Add a one-time migration key only when needed to force affected clients to refresh cached assets.
- Remove temporary migration code after the issue is confirmed resolved.

## 5) Regression Checklist Before Merge

- Confirm critical labels are visible at all intended breakpoints.
- Confirm segmented/radio/toggle controls preserve intended width split and alignment.
- Confirm no duplicate/competing class names were introduced across global styles.
- Confirm deployed behavior matches localhost on at least two device types.

## 6) If Mismatch Persists on One Device

- Treat as environment/device-specific until proven otherwise.
- Inspect computed styles for the exact hidden/misaligned element.
- Check active service worker registrations and cache entries for stale bundles.
- Apply the minimal targeted fix first; avoid broad CSS overrides.
