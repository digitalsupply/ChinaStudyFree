---
type: core-algorithm
title: Learning Algorithms
description: Deterministic grading, spaced repetition, jump-ahead sampling, chest placement and rewards, calendar-week helpers, and shared RNG primitives used across the learning app.
tags: [algorithms, grading, srs, jump, chest, rng]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-04T02:58:40.844Z
sources:
  - id: openwiki-source-f2bc2c7096de80d59d6c5888
    resource: repo://apps/web/src/app/jump/JumpClient.tsx
  - id: openwiki-source-3cfe40a5cc5648d699ad6431
    resource: repo://packages/core/src/chestLogic.ts
  - id: openwiki-source-d97e50806967580379c7aa25
    resource: repo://packages/core/src/grade.ts
  - id: openwiki-source-a8bbc6e42d517cc9f75ef781
    resource: repo://packages/core/src/jump.ts
  - id: openwiki-source-14007114813307b31f7d49cf
    resource: repo://packages/core/src/rng.ts
  - id: openwiki-source-c478bb7067eafb0c4ad049e2
    resource: repo://packages/core/src/srs.ts
  - id: openwiki-source-84601ab5781a26e2488cceef
    resource: repo://packages/core/src/week.ts
generated: { by: "opencode", at: "2026-11-04T02:58:40.844Z" }
---

# Learning Algorithms

The core package contains several small algorithms whose value comes from being deterministic, testable, and identical across platforms. None of them depends on React, the DOM, or the server. This page explains their inputs, outputs, invariants, and the edge cases that matter.

## Answer grading

`gradeAnswer` is the tolerant comparison layer between learner input and canonical answers. It normalizes whitespace, case, full-width punctuation, and several typographic variants before comparing.

Behavior by type:

- **true_false** recognizes Chinese, English, and symbol forms of true/false. If the learner's input is recognizable as one polarity, the grader compares polarity rather than raw text.
- **choice** takes the first letter of the learner's answer. If the stored answer is not a single A–D letter, the grader searches the options for an exact or prefix-stripped match and converts the index to a letter.
- **fill_blank / calculation / word_problem** first compares normalized strings, then strips units and non-numeric characters, then compares parsed floats with a `1e-6` tolerance. This tolerates `3/4` versus `0.75` only where parsing supports it; the string normalization is the primary path.
- **fill_blank_text** removes whitespace and common punctuation and lowercases before comparing.
- **word_order** normalizes commas and whitespace and compares the sequence.
- **matching** parses `A-1,B-2` into a map, ignores pair order, and requires the same key/value set.

The grader is intentionally permissive on presentation and strict on meaning. It does not attempt semantic equivalence or fuzzy spelling correction.

## Spaced repetition

The SRS module implements a three-box Leitner variant. Each mistake entry carries a `box`, cumulative correct count, last review time, next review date, and an optional graduated flag.

On review:

- A wrong answer resets the entry to box 1, zeroes the correct count, and schedules it for today.
- A correct answer in box 1 advances to box 2 and schedules tomorrow.
- A correct answer in box 2 advances to box 3 and schedules three days out.
- A correct answer in box 3 stays in box 3 and schedules seven days out.

Graduation is a derived predicate, not merely a stored flag:

```
graduated === true ||
((box ?? 1) >= 3 && (correctCount ?? 0) >= 2)
```

This matters for old data and cross-platform imports: an entry may have box 3 and two correct answers without an explicit `graduated` field and still be considered mastered. The due queue uses this predicate, filters out graduated entries, treats a missing review date as immediately due, and sorts by lower box first, then older review timestamps.

The module deliberately accepts a minimal graduation state (`graduated`, `box`, `correctCount`) so store entries, backup entries, and the iOS model can all feed the same function.

## Jump-ahead sampling

Jump-ahead lets a learner test out of earlier units. The sampler receives a list of lesson/question sources, a target size (default 15), and a seed.

Its guarantees:

- Questions are deduplicated by id within each lesson.
- Each lesson's questions are deterministically shuffled from a seed derived from the global seed and lesson id.
- Lessons themselves are shuffled so the first unit does not always fill the quota.
- Selection proceeds round-robin across lessons, so each lesson contributes at most one more question than another until the quota is met.
- The final selected list is shuffled again so questions from one lesson are not adjacent.
- If the available question count is at or below the target, all questions are returned.
- The same inputs and seed always produce the same output.

The caller can retry with a new seed to get a different set. Pass accuracy is a separate constant (`0.8`) enforced by the UI; the sampler only selects questions.

## Chest placement and rewards

Chests are pure UI progression markers, not stored in the outline. `computeChestsForBook` walks lessons in order, tracks a per-unit count, and inserts a chest slot whenever the count within a unit reaches a multiple of five.

Consequences:

- A chest appears after the 5th, 10th, 15th, etc. lesson of a unit.
- A unit shorter than five lessons gets no chest; the code intentionally does not add a chest at the unit end.
- The slot id is stable: `{bookId}-u{unit}-chest-{indexInUnit}`.
- The caller can find the chest immediately following a lesson by scanning the computed slots.

Reward rolling is deliberately variable:

- 85% common: 10–20 gems.
- 10% rare: 21–30 gems.
- 5% epic: 40–50 gems.

The tier is returned alongside the amount so the UI can scale the animation. Unlike the deterministic algorithms above, the roll uses `Math.random` and is not part of cross-platform golden vectors.

## Calendar weeks and date keys

`week.ts` is the single definition of "this week" for leagues, weekly reports, streak calendars, and any other calendar-window feature.

It uses local-time `YYYY-MM-DD` keys, validates real dates (rejecting impossible dates such as February 30), and defines a week as Monday through Sunday. `weekStartKey` returns the Monday of a date's week; `weekDateKeys` returns the seven keys in Monday-to-Sunday order; `dayIndexInWeek` returns the offset of a date from that Monday, allowing negative values for earlier weeks and values above six for later weeks.

The module explicitly forbids rolling seven-day windows as a substitute. Using one calendar definition prevents league resets, weekly reports, and streak displays from disagreeing about which days belong together.

## Shared RNG primitives

`rng.ts` provides the deterministic primitives used by daily quests and the simulated league:

- `djb2Hash` over UTF-8 bytes with 64-bit wrapping.
- `mix64`, a SplitMix64 finalizer with explicit 64-bit masking.
- `utf8Bytes`, implemented to match Swift's UTF-8 byte view, including surrogate pairs.

TypeScript uses `BigInt` arithmetic and masking to emulate Swift's `UInt64` wrapping operations. The comments make the parity requirement explicit: changing these functions alone would desynchronize the web and iOS clients.

## Determinism boundaries

The deterministic core covers grading, SRS transitions, jump sampling, chest placement, week calculations, quests, league bots, economy, reading ids, and backup validation. The nondeterministic parts are intentionally isolated: chest reward amounts, cosmetic purchases, and actual learner input.

Tests cover the deterministic parts directly, and `spec/golden-vectors.json` pins the cross-platform subset. When changing any of these functions, the correct sequence is to decide whether it is a protocol change, update the vectors, then update both implementations.

## Related pages

- [Review and Cross-Platform State](./review-and-cross-platform-state.md)
- [Learning Path and Book Map](../web/learning-path.md)
- [Lesson Runner](../web/lesson-runner.md)
- [Progress Store and Persistence](../web/progress-and-persistence.md)
