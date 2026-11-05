---
type: "Reference"
title: "Review and Cross-Platform State"
openwiki_generated: true
verified:
  - by: openwiki/0.7.2
    at: 2026-11-04T02:58:40.844Z
sources:
  - id: openwiki-source-7513589369cf37a560590e3e
    resource: repo://apps/web/src/app/review/runner/ReviewRunnerClient.tsx
  - id: openwiki-source-7678eae486614637beeef14c
    resource: repo://apps/web/src/store/progress.ts
  - id: openwiki-source-2f32aa5b3a2f9761fb51ba65
    resource: repo://packages/core/spec/golden-vectors.json
  - id: openwiki-source-207d8c5116eb72e28d178d7e
    resource: repo://packages/core/src/__tests__/goldenVectors.test.ts
  - id: openwiki-source-cee5e67dcfa7e14258f5bc2c
    resource: repo://packages/core/src/backup.ts
  - id: openwiki-source-1b46b817c92a7bbab2c53087
    resource: repo://packages/core/src/economy.ts
  - id: openwiki-source-c01cbcccd1ed47df4f36f372
    resource: repo://packages/core/src/reading.ts
generated: { by: "opencode", at: "2026-11-04T02:58:40.844Z" }
---


# Review and Cross-Platform State

The web app is one client of a shared behavioral contract. Its review loop, reading bookkeeping, and save-file format are designed so an iOS client can produce and consume the same state. That design is not incidental: it is enforced by canonical ids, explicit compatibility rules, and a shared golden-vector suite.

## The review loop

The review surface starts from the mistakes bank. `ReviewClient` sorts and groups mistakes by lesson, shows the SRS box and whether an item is due, and exposes a start button only when due items exist. Graduated items remain visible as mastered but are excluded from the due count.

The runner takes a one-time snapshot of due entries, then behaves like a real quiz rather than self-assessment:

- It reuses the same question renderer and grader as lessons.
- A first attempt drives SRS and reward accounting; re-attempts within the session do not re-advance the box or grant XP.
- A wrong answer is pushed to the back of the queue, so the learner repeats it until correct.
- The session is a safe zone: mistakes do not cost hearts.
- On completion, each first-attempt correct answer grants a small XP amount, and the number of reviewed items increments the daily review counter.
- If the learner completes the due round and has at least the configured minimum correct, the store may award one heart, subject to a once-per-day ledger.

The daily heart ledger is what prevents farming: repeatedly entering the same small set of mistakes cannot refill hearts indefinitely. Exiting early still settles XP for the first attempts made, so a partial session is not wasted.

Graduation is a derived property, not just a stored flag. The SRS graduation predicate is `graduated === true` or `box >= 3 && correctCount >= 2`. Old entries and imported entries often have only box and correct count, and they must still leave the due queue. The review client, the due helper, and the backup representation all use the same predicate.

## Canonical reading ids

Reading completion used to be stored under incompatible key spaces: web wrote `passage-{id}-listen`, `passage-{id}-followup`, or `story-{id}`, while iOS wrote bare ids or `{id}-followup`. The result was that a backup imported from one platform showed everything as unread and allowed duplicate XP.

The canonical format is now:

```
reading:{kind}:{rawId}
```

where `kind` is `listen`, `followup`, or `story`, and `rawId` is the data-layer passage or story id without platform prefixes. Examples are `reading:listen:chinese-g1up-p3` and `reading:story:chinese-g3up-s1`.

`normalizeReadingId` upgrades legacy forms:

- already canonical ids pass through;
- `story-{raw}` becomes story;
- `passage-{raw}-followup` becomes follow-up;
- `passage-{raw}-listen` and bare `passage-{raw}` become listen;
- `{raw}-followup` becomes follow-up;
- a bare id matching `-s\d+` is treated as a story, otherwise as listen.

`normalizeReadingMap` normalizes an entire table. It drops invalid keys, keeps the earlier completion date when multiple legacy keys collapse into one, and replaces empty dates with an explicit "unknown" placeholder rather than leaving an empty string. That placeholder matters because callers must test key existence, not truthiness: a completed reading with an unknown date must never become re-rewardable.

The store's `completeReading` normalizes the id, checks key existence, and only then grants XP. This makes rewards idempotent across re-renders, reloads, and imported backups.

## Backup envelope

The cross-platform save format is `BackupEnvelope v1` with schema `cstf-backup`, a positive integer version, an export timestamp, a platform (`web` or `ios`), and a `data` object.

The data carries learner progress:

- XP, streak, last active date, streak freezes;
- gems, lifetime gems, hearts, daily goal;
- completed lessons and canonical completed readings;
- perfected lessons and the mistakes bank with SRS fields;
- claimed chests, streak rewards, and daily quests;
- daily reward date, achievements, cosmetics, equipped items;
- XP history and optional league tier/week key.

Transient state is deliberately excluded: active lesson sessions, pending celebrations, today's elapsed time, and similar in-memory markers do not survive an import.

`buildBackup` fills missing fields with defaults, strips undefined values, and normalizes the reading map. `validateBackup` is a hand-written zero-dependency validator. It distinguishes fatal structural problems from field-level repairs:

- Fatal: input is not an object, schema is wrong, version is missing or not a positive integer, or `data` is not an object. The result is `ok: false` with no data.
- Repairable: wrong-typed numbers, strings, flags, arrays, cosmetics, or equipped ids. The validator substitutes defaults, records a human-readable repair log, and still returns `ok: true`.

Forward compatibility is explicit: a version greater than the current one is not rejected. Unknown fields are ignored and known fields are read. This works because v1 field semantics are promised not to change. Reading maps are normalized on both export and import, so older clients and newer clients converge on the canonical key space.

Some fields receive special treatment for anti-exploit reasons. `claimedQuests` is carried in the envelope and is pruned to today's keys on import; otherwise an export/import cycle could re-claim already-rewarded quests. `lastReviewHeartDate` is intentionally not imported, so a backup round-trip cannot reset the daily heart ledger. `freezesMigrated` stays local so importing does not trigger another shield grant.

## Golden vectors

`packages/core/spec/golden-vectors.json` is the shared conformance file. The TypeScript tests consume it directly; the iOS test suite is expected to read the same JSON and assert equivalent behavior.

The vectors cover:

- star thresholds from accuracy;
- lesson XP with perfect, first-perfect, weekend, and exam modifiers;
- gem drip;
- streak advancement including shield consumption and Monday top-up;
- SRS transitions and graduation edge cases;
- daily login rewards;
- deterministic daily quests;
- league bot names, goals, and time-based XP;
- canonical reading id normalization;
- backup build/validate expectations.

Any behavior change in these areas is a protocol change. The project's contribution rules require updating the vectors and both implementations together, not just the web client. The tests are therefore not merely regression tests; they are the executable definition of cross-platform compatibility.

## Where the contract can still drift

The vectors pin the shared subset, but not every UI rule is in the core. Examples include when a heart gate opens, which animation plays, and how a completion screen is staged. Those may differ by platform as long as the underlying economy and progression values agree.

The riskiest changes are silent renames: a book id, lesson id, reading kind, or backup field. These do not necessarily fail a type check, but they invalidate stored progress or break cross-platform import. The compatibility comments in the source are the best guide to which identifiers are effectively permanent.

## Related pages

- [Testing and CI](../operations/testing-and-ci.md)
- [Gamification and Economy](../web/gamification-and-economy.md)
- [Progress Store and Persistence](../web/progress-and-persistence.md)
- [Reading, Stories and Audio](../web/reading-stories-and-audio.md)
