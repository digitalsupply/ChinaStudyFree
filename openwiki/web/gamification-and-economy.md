---
type: web-subsystem
title: Gamification and Economy
description: How XP, stars, gems, hearts, streaks, daily goals, quests, achievements, the simulated league, cosmetics, and parental time limits are defined in core and orchestrated by the progress store and UI watchers.
tags: [gamification, economy, hearts, streak, quests, league, achievements]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-04T02:58:40.844Z
sources:
  - id: openwiki-source-66ea68506984f8c42b4ce8ad
    resource: repo://apps/web/src/app/league/page.tsx
  - id: openwiki-source-964ccfb5bbf836bd51f502e2
    resource: repo://apps/web/src/app/shop/page.tsx
  - id: openwiki-source-46ab99e49ddf2394760e0a8f
    resource: repo://apps/web/src/components/AchievementWatcher.tsx
  - id: openwiki-source-235bb4294142e392fd2adbc5
    resource: repo://apps/web/src/components/DailyRewardWatcher.tsx
  - id: openwiki-source-a961e5c7315282e92852b41a
    resource: repo://apps/web/src/components/LeagueWatcher.tsx
  - id: openwiki-source-bc682161468825b2e367b4cf
    resource: repo://apps/web/src/components/LessonRunner.tsx
  - id: openwiki-source-ba0fb183fe6a4b857984bc2e
    resource: repo://apps/web/src/lib/immersiveRoutes.ts
  - id: openwiki-source-7678eae486614637beeef14c
    resource: repo://apps/web/src/store/progress.ts
  - id: openwiki-source-995aab779af7efa6eb20e6af
    resource: repo://packages/core/src/achievements.ts
  - id: openwiki-source-50fb71a0f793e95c9243abfd
    resource: repo://packages/core/src/cosmetics.ts
  - id: openwiki-source-1b46b817c92a7bbab2c53087
    resource: repo://packages/core/src/economy.ts
  - id: openwiki-source-ed2aacdeecf2daadea647ceb
    resource: repo://packages/core/src/league.ts
  - id: openwiki-source-7b99c2de30317cf85c7f2847
    resource: repo://packages/core/src/quests.ts
generated: { by: "opencode", at: "2026-11-04T02:58:40.844Z" }
---

# Gamification and Economy

The gamification layer is split deliberately:

- **Pure rules** live in `packages/core`: XP and star thresholds, gem drip, hearts, streak advancement, milestones, daily rewards, quest generation, achievement definitions, league tiers and bots, and cosmetics.
- **State transitions** live in the progress store, which applies rules atomically and maintains anti-duplicate ledgers.
- **Surfaces and watchers** live in components: the stats bar, shop, league page, profile, daily reward modal, achievement toast, and quest panel.

This separation is what allows the same numbers to be reproduced on iOS and keeps UI code from inventing its own economy.

## XP and stars

Stars come from first-attempt accuracy:

- 3 stars at ≥ 0.95;
- 2 stars at ≥ 0.80;
- otherwise 1 star.

Lesson XP is computed by `xpForLesson`:

- 10 XP per first-attempt correct answer;
- +5 for a perfect first-attempt run;
- +5 if this is the lesson's first-ever 3-star completion;
- ×2 for an exam lesson;
- ×2 on weekends (local Saturday/Sunday).

Exam and weekend multipliers stack, so a weekend exam can reach ×4. The completion screen displays the same formula the store receives, avoiding a mismatch between "shown XP" and "credited XP".

Gems from a lesson use a separate drip function, which is not multiplied by weekend or exam status:

- base 3;
- +5 for 2 stars, or +10 for 3 stars (not both);
- +15 for the first-ever 3-star completion;
- +20 the first time today's XP crosses the daily goal.

## Gems and spending

Gems are the only soft currency. They are earned from lessons, chests, streak milestones, daily login, quests, achievements, and league settlement. They are spent on heart refills, streak shields, streak make-up, and cosmetic items.

The store maintains both a current balance and a lifetime total. Lifetime gems drive the "gem collector" achievement, so spending does not erase progress toward it.

Cosmetics are purely aesthetic and all are purchasable with gems. There are no premium-only items, no real-money purchases, and no stat effects. The shop has three tabs: mascot skins, UI themes, and lesson backdrops. Buying an item also equips it; equipping requires ownership.

## Hearts

Hearts represent practice stamina:

- maximum 5;
- one heart regenerates every 300 seconds;
- a wrong answer costs one heart;
- a full refill costs 350 gems;
- a review round can restore one heart if the learner gets at least five first-attempt correct answers, at most once per day.

The store handles regeneration defensively. If a persisted state has missing hearts but no next-heart timestamp, it seeds a new timer rather than leaving a permanent zero-heart dead state. `addHeart` refreshes natural regeneration first, caps at the maximum, and clears the timer only when full.

The once-per-day review heart ledger (`lastReviewHeartDate`) is the anti-farm control. Without it, a learner could repeatedly enter a tiny mistake set and refill hearts indefinitely.

## Streaks, shields, and daily rewards

`advanceStreak` is the pure rule:

- same day or clock rollback: no change;
- next day: streak +1, and on Monday a shield is granted if below the cap;
- gap of two or more days: consume one shield per missed day if possible, otherwise reset the streak to 1 without consuming shields.

Shields cost 200 gems, cap at 2, and are granted on Mondays. A make-up purchase costs 50 gems and is only valid when the learner has not studied today and the gap is at least two days; it rewinds `lastActiveDate` to yesterday so the next activity continues the streak.

Displayed streak is "effective": if the gap exceeds what shields can cover, the UI shows 0 even though the stored streak may still be a larger number. This avoids claiming a streak that is already broken.

Streak milestones at 3, 7, 14, 30, 60, and 100 days award gems once each, tracked in a `claimedStreakRewards` ledger. The daily login reward uses a table indexed by effective streak and is granted at most once per day.

## Daily goal

The daily goal is selectable from 20, 50, 100, or 200 XP, defaulting to 50. The first time today's XP crosses the goal, the learner receives a one-time 20-gem bonus. The goal ring and progress displays read today's XP, which is reset by date and reconstructed from history on import.

## Daily quests

`dailyQuests(date)` deterministically generates three quests:

- the first is always an XP quest;
- the other two are drawn without replacement from lesson-completion, mistake-review, and reading quests;
- the candidate pool is fixed, so the same date always yields the same three quests on every platform.

Progress uses four counters: today's XP, lessons completed, reviews completed, and readings completed. Counters roll over at local midnight.

Claiming is guarded by a ledger keyed as `"YYYY-MM-DD:questId"`. A quest can be claimed only if it is one of today's quests, its progress meets the target, and the key is absent. The ledger is trimmed to the most recent 60 entries. Because the ledger travels in backups (pruned to today on import), an export/import cycle cannot re-claim the same quest.

## Achievements

Achievements are defined as data: id, category, name, description, icon, color, goal, reward, and a progress function over a minimal snapshot. Categories include milestones, streaks, perfection, shop, and review.

Examples include first lesson, 10/50 lessons, XP thresholds, streak thresholds, perfect-lesson counts, first non-starter cosmetic, lifetime gems, and first reviewed mistake.

The achievement watcher subscribes to the store, computes newly unlocked ids, and calls an idempotent `claimAchievement`. The permanent `unlockedAchievements` ledger is append-only, so a later streak drop cannot "re-lock" an achievement. The watcher loops a few times because awarding gems can itself unlock the lifetime-gem achievement.

On immersive pages the ledger and gems are still updated immediately, but celebration toasts are queued and replayed after the learner leaves the lesson or reader. This preserves the reward without interrupting the flow.

## Simulated league

The league is local and deterministic, not a server ranking.

- It unlocks after 10 completed lessons.
- The group has 16 members: the learner plus 15 bots.
- Bots are generated from a seed over `weekKey`, tier, and a device salt created once and stored.
- Bot names come from a fixed ordered pool and are drawn without replacement.
- Each bot has a weekly XP goal within a tier-specific range and a deterministic daily activity curve, with an active window that advances linearly by hour.

The page recomputes standings every 30 seconds from the learner's weekly XP history and each bot's XP at the current time. Because the algorithm is deterministic, the same device, week, and tier always produce the same board.

There are six tiers: bronze, silver, gold, sapphire, ruby, diamond. At the weekly rollover, the store settles last week's final rank: top 5 promote (diamond capped), bottom 5 demote (bronze floored), and gem rewards follow the rank table with a promotion bonus. The result is stored as `pendingLeagueResult` and shown by the league watcher as a weekly report modal.

The league is deliberately a "shadow" competition: it provides progression and social framing without exposing a child to real-time strangers or requiring a backend account.

## Parental time limits

The profile exposes optional daily and per-session time limits. The lesson runner accumulates only visible-page time, flushing every 30 seconds and capping a single flush at ten minutes to avoid counting system sleep. Time uses its own date field so it cannot corrupt the XP day boundary. A zero limit means no restriction.

## Watchers and immersive suppression

Three root-level watchers run on ordinary pages:

- `DailyRewardWatcher` grants the daily login reward, offers streak make-up, and celebrates milestones.
- `AchievementWatcher` unlocks and rewards achievements.
- `LeagueWatcher` performs weekly settlement and shows the report.

All three consult `isImmersivePath` and defer celebrations on lesson, jump, review-runner, and reader routes. This is the difference between a reward and an interruption.

## Related pages

- [Learning Algorithms](../core/learning-algorithms.md)
- [Review and Cross-Platform State](../core/review-and-cross-platform-state.md)
- [Lesson Runner](./lesson-runner.md)
- [Progress Store and Persistence](./progress-and-persistence.md)
