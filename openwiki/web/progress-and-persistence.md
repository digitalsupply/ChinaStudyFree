---
type: web-subsystem
title: Progress Store and Persistence
description: The local Zustand progress store, its persisted schema and migrations, atomic lesson settlement, reading and review bookkeeping, session state, and backup import/export behavior.
tags: [state, zustand, persistence, migration, backup]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-04T02:58:40.844Z
sources:
  - id: openwiki-source-8265e88e22d1dd3a83fea5c0
    resource: repo://apps/web/src/app/HomeClient.tsx
  - id: openwiki-source-7678eae486614637beeef14c
    resource: repo://apps/web/src/store/progress.ts
  - id: openwiki-source-cee5e67dcfa7e14258f5bc2c
    resource: repo://packages/core/src/backup.ts
generated: { by: "opencode", at: "2026-11-04T02:58:40.844Z" }
---

# Progress Store and Persistence

All learner state lives in a single Zustand store persisted to `localStorage` under `csf-progress-v1`. The store is the web client's local source of truth. It does not call a backend for progress, and it is designed so that old saves, imported saves, and partially written saves degrade safely rather than corrupting rewards.

## Persisted schema

The state is grouped into several concerns:

- **Core progress** — XP, streak, last active date, completed lessons, mistakes bank.
- **Preferences** — mute, auto-narrate, daily goal, selected grade, selected stage, stage history, per-subject publisher versions, active book.
- **Hearts** — current hearts, next regeneration timestamp, last review-heart date.
- **Currency and rewards** — gems, lifetime gems, claimed chests, perfected lessons, claimed streak milestones, pending milestone.
- **Cosmetics** — owned item ids and equipped mascot skin, UI theme, and lesson backdrop.
- **Time care** — today's learning time, daily limit, session limit, and the separate time date.
- **History** — XP by date, lessons by date, last daily reward date, pruned to roughly 60 days.
- **Reading** — canonical reading id to completion date.
- **Achievements** — permanent unlocked ledger and a pending celebration marker.
- **Daily quests** — four counters, their date, and a date-scoped claim ledger.
- **League** — device salt, tier, current week key, pending settlement result.
- **Reports** — locally stored question reports, capped at 200.
- **Transient session state** — the active lesson snapshot.

Everything except clearly transient UI/session fields is persisted. Active lesson sessions are persisted too, because resuming is a product requirement, but they are treated as disposable and cleared on completion or confirmed exit.

## Persistence and hydration

The store uses Zustand's `persist` middleware with JSON storage over `localStorage`. Components that render user-specific values gate on a `hydrated` flag or a mount effect, showing neutral defaults until the store has loaded. This avoids server/client HTML mismatch in the static export.

The store version is 15. The migration function is cumulative rather than a chain of separate functions, so it must handle upgrading any older version to the current shape.

## Atomic lesson settlement

`recordLessonComplete` is the most important action. It performs the whole settlement inside one `set` callback:

1. Compute stars from first-attempt accuracy.
2. Roll the daily quest counters across midnight.
3. Increment today's lesson count.
4. Apply XP through `applyXpGain`, which updates total XP, today's XP, XP history, and detects the first crossing of the daily goal.
5. Compute gem drip from stars, first-perfect status, and the goal crossing.
6. Advance the streak using the pure `advanceStreak` rule, including shield consumption and Monday top-up.
7. Grant a streak milestone once, using the claimed-milestones ledger.
8. Preserve the best prior lesson result: a lower-star replay does not downgrade a previous result.
9. Update gems, lifetime gems, XP, streak, daily counts, and perfected lessons atomically.

The action returns a `LessonOutcome` snapshot containing credited XP, gems, stars, streak before/after, goal crossing, milestone gems, and first-perfect status. The completion UI reads this snapshot rather than recomputing rewards.

If accuracy is 100%, the action clears that lesson's mistakes. A lower-accuracy completion leaves them for review.

## XP and daily bookkeeping helpers

`applyXpGain` is shared by lesson completion, reading completion, and review XP. It handles:

- same-day versus new-day XP;
- pruning XP history to the most recent 60 days;
- the once-per-day `+20` gem bonus when the daily goal is crossed.

`questDayRollover` resets the daily lesson, review, and reading counters when the stored quest date differs from today. It returns a patch merged into the same `set`, so there is no window where one counter has rolled and another has not.

Reading completion uses the same XP accounting but deliberately does not grant lesson gems, write a lesson result, or increment lesson history. It is a separate activity type.

## Reading and review bookkeeping

`completeReading` normalizes the input id to the canonical `reading:{kind}:{rawId}` space, checks whether the key already exists, and returns early if it does. On first completion it rolls the reading counter, applies XP, updates the goal bonus, and writes the completion timestamp.

The existence check is on the key, not the value. A completed reading with an unknown date has a placeholder value and must still count as done. This prevents duplicate XP after an import.

`reviewMistake` applies the core SRS transition to the matching entry. A wrong answer resets the box and clears graduation; a correct answer may graduate the entry, and the action reports whether graduation is new so the UI can celebrate.

`awardReviewXP` grants XP per first-attempt correct answer, increments the review counter by the number of reviewed items, applies the daily goal bonus, and advances the streak. It is idempotent only at the session level: the runner calls it once per finished or exited session.

## Hearts

Heart actions are defensive:

- `loseHeart` does nothing at zero and starts a regeneration timer only when leaving full health.
- `refreshHearts` derives all elapsed regeneration cycles, clears the timer at full health, and seeds a timer if it finds the impossible state of missing hearts with no timer. That self-healing guard prevents a permanent zero-heart lock after an import or manual storage edit.
- `addHeart` refreshes first, caps at the maximum, and preserves the existing timer if not full.
- `buyHeartRefill` refreshes first so a full-heart purchase cannot charge gems.
- `awardReviewHeart` is limited by the daily ledger and only writes the ledger when a heart was actually granted.

## Quests, achievements, league, and cosmetics

Quest claiming requires that the id belongs to today's deterministic quest set, that progress meets the target, and that the date-scoped ledger key is absent. The ledger is trimmed to the newest 60 keys.

`claimAchievement` is idempotent through the permanent ledger: it returns 0 if already present. The watcher may call it repeatedly as rewards unlock further achievements.

League settlement is triggered by `settleLeagueIfNeeded`. It creates the device salt once, records the first week without settling, skips settlement while the league is locked, and otherwise settles last week's final rank, updates tier and gems, and stores a pending result for the watcher.

Cosmetic purchases validate existence, ownership, and gem balance, then deduct gems, add ownership, and auto-equip. Equipping requires ownership and updates only the field for that cosmetic type.

## Jump-ahead and reports

`jumpAheadComplete` marks previously incomplete lessons with one star and accuracy 0.8. It deliberately does not grant XP, gems, streak, or quest progress, and does not overwrite existing results. This makes jump-ahead a progression shortcut without a reward farm.

Question reports are local only. Each gets an id and timestamp, is appended, and the list is capped at 200. The profile page can export them; nothing is uploaded.

## Migration behavior

The version-15 migration fills defaults, repairs old shapes, and performs several one-time semantic upgrades:

- **Reading migration** — historical passage/story completions stored as pseudo-lessons move into `completedReadings`, and lesson history is decremented where possible.
- **Reading key normalization** — old web and iOS keys are converted to the canonical reading-id space.
- **Achievement ledger** — the current computed unlock set is written into the ledger without paying retroactive rewards, so future unlocks are the only ones that pay.
- **Shield migration** — a one-time top-up raises freezes to the initial value, guarded by a flag so future version bumps do not grant free shields repeatedly.
- **Stage recovery** — `lastStage` is backfilled from the stored value, the selected stage, or the selected grade.
- **Cosmetics** — starter items are always present; unknown equipped ids fall back to defaults at import/render time.

Migration also tolerates missing fields by defaulting them, so an old save never blocks the app from loading.

## Backup import and export

Export builds a platform-neutral envelope via core `buildBackup`, mapping internal records into the backup shape. Import expects a validated envelope, then overwrites progress while resetting transient state.

Important import decisions:

- Hearts are clamped and, if not full, given a fresh regeneration timer.
- Completed readings are normalized again as an idempotent safety net.
- `claimedQuests` is pruned to today's keys so already-claimed quests cannot be reclaimed immediately.
- `lastReviewHeartDate` is intentionally **not** imported; keeping the local value prevents a backup round-trip from resetting the daily heart ledger.
- `freezesMigrated` stays local so importing does not trigger another shield grant.
- Active lesson, pending celebrations, league results, time counters, and daily counters are reset.

The result is a save format that can move between web and iOS without duplicating rewards or losing the meaning of completion.

## Related pages

- [Review and Cross-Platform State](../core/review-and-cross-platform-state.md)
- [Gamification and Economy](./gamification-and-economy.md)
- [Lesson Runner](./lesson-runner.md)
