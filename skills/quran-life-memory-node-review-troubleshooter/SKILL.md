---
name: quran-life-memory-node-review-troubleshooter
description: Diagnose and fix Quran Life regressions related to memory node structure, review queue behavior, and InstantDB permission errors. Use when users report `InstantAPIError: Permission denied: not perms-pass?`, review queue count mismatch, cards not leaving/entering review after kanban moves, undo/redo issues after review logic changes, advanced option behavior drift (mindmap only vs mindmap + verses), review sorting conflicts, skip/suspended/similarity regressions, or FSRS optimization side effects.
---

Use this skill to quickly recover from cross-feature regressions caused by memory-node and review-queue changes.

## Work In This Order

1. Reproduce the failing flow exactly before editing.
2. Trace the write path (what mutation runs when the action happens).
3. Validate ID, ownership, and permission assumptions on each write.
4. Apply the smallest safe fix.
5. Verify queue behavior, counters, ordering, and undo/redo.
6. Run build and report residual risks.

## Primary Files To Inspect

- `src/hooks/useInstantData.ts`
- `src/app/(app)/todo/page.tsx`
- `src/components/todo/TodoKanban.tsx`
- `src/app/(app)/dashboard/page.tsx`
- `src/app/(app)/settings/page.tsx`
- `src/app/(app)/statistics/page.tsx`
- `src/components/OnboardingModal.tsx`

## Fast Diagnostic Checks

Run:

```bash
rg -n "saveNode|deleteNode|memoryNodeLogicalKey|resolveEntityId|stableEntityId|db\.tx\.memoryNodes\[" src
rg -n "completeExitBehavior|mindmap_and_verses|kanbanSortOrder|reviewSortOrder|onDragEnd|Moved out of Complete" src
rg -n "skip|suspended|similarity|dueNodes|review" src/app/(app)/todo/page.tsx src/app/(app)/dashboard/page.tsx src/app/(app)/statistics/page.tsx
```

Then inspect whether any write path:

- Reuses untrusted UUID IDs.
- Misses `userId` on create/update.
- Uses a deterministic ID that is not user-scoped.
- Deletes by ID that may belong to another entity/user.

## Permission-Error Guardrails (`not perms-pass?`)

For memory nodes:

- Prefer user-scoped deterministic IDs for fallback.
- Reuse a candidate UUID only if it is already present in current-user fetched nodes.
- Always write with `userId: user.id`.
- Avoid direct `db.tx.memoryNodes[...]` calls outside shared hooks unless absolutely required.

If a write can target stale/foreign IDs, route through a safe helper in `useInstantData.ts`.

## Behavior Matrix To Verify

After every fix, validate all rows:

1. Move surah card out of Complete with `mindmap_only`.
Expected: mindmap removed from review, verse nodes remain.

2. Move surah card out of Complete with `mindmap_and_verses`.
Expected: mindmap removed and verse nodes suspended.

3. Move surah card back to Complete.
Expected: required review nodes restored according to current map/splits.

4. Skip surah.
Expected: card hidden from todo review and dashboard review queue.

5. Today review counter.
Expected: updates immediately when cards move in/out of Complete under both modes.

6. Review sorting + review queue.
Expected: advanced sorting option changes order only, not inclusion/exclusion semantics.

7. Undo/redo in dashboard review flow.
Expected: node state, logs, and queue position restore correctly.

8. Suspended/similarity cards.
Expected: complete action and undo stay consistent with queue and counters.

9. Knowledge tracking and split configuration.
Expected: no regression in node range alignment or split save behavior.

10. FSRS optimization.
Expected: logs and optimization pipeline consume current fields and do not break after node changes.

## Popup Content Rules

When showing move-out-of-complete popup text:

- Mention that the setting controls future drag-and-drop behavior.
- Frame retroactive apply as optional.
- Keep messages mode-specific:
  - `mindmap_only`: verse reviews remain active.
  - `mindmap_and_verses`: verse reviews are suspended.
- Keep lines minimal and action-oriented.

## Regression-Prevention Pattern

Before closing the task, confirm:

- No direct write path bypasses safe node ID resolution.
- Derived review lists use canonical node identity logic.
- Queue counters are computed from the same inclusion rules used by visible queue items.
- Kanban sorting and review sorting do not mutate membership logic.

## Final Validation

Run:

```bash
npm run build
```

If available, execute a focused manual flow on `/todo`, `/dashboard`, and `/settings` covering both complete-exit modes.

Report:

- Root cause.
- Exact file-level fix.
- Which matrix checks passed.
- Any remaining risk and follow-up recommendation.
