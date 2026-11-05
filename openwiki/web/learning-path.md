---
type: web-workflow
title: Learning Path and Book Map
description: The stage, grade, book, and lesson journey, including first-run selection, self-healing state, publisher-version choices, the path map, unlock rules, chests, exam nodes, and jump-ahead.
tags: [navigation, learning-path, path-map, jump-ahead, chests]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-04T02:58:40.844Z
sources:
  - id: openwiki-source-bca650266b2aa85b208d02df
    resource: repo://apps/web/src/app/book/%5Bbook%5D/BookPathView.tsx
  - id: openwiki-source-30aa5f2fdace0ba46deee14b
    resource: repo://apps/web/src/app/book/%5Bbook%5D/page.tsx
  - id: openwiki-source-3a80524fae3911e7184bd6e1
    resource: repo://apps/web/src/app/grade/%5Bgrade%5D/page.tsx
  - id: openwiki-source-8265e88e22d1dd3a83fea5c0
    resource: repo://apps/web/src/app/HomeClient.tsx
  - id: openwiki-source-f2bc2c7096de80d59d6c5888
    resource: repo://apps/web/src/app/jump/JumpClient.tsx
  - id: openwiki-source-deba80bf5b4e6fbdad344120
    resource: repo://apps/web/src/app/page.tsx
  - id: openwiki-source-e5030ac2735e084502cd7233
    resource: repo://apps/web/src/components/ContinueLearningCard.tsx
  - id: openwiki-source-486af5ff570ebc9fad11fab7
    resource: repo://apps/web/src/components/GradeSubjectGroups.tsx
  - id: openwiki-source-fc5141309d670a99de298488
    resource: repo://apps/web/src/components/LessonStartModal.tsx
  - id: openwiki-source-c684089d5a1f58ed540923b9
    resource: repo://apps/web/src/components/StagePicker.tsx
  - id: openwiki-source-114dd1060eed942d261ce26f
    resource: repo://apps/web/src/lib/exam.ts
  - id: openwiki-source-c9db14ed74c012e9e81344de
    resource: repo://apps/web/src/lib/versions.ts
  - id: openwiki-source-7678eae486614637beeef14c
    resource: repo://apps/web/src/store/progress.ts
  - id: openwiki-source-3cfe40a5cc5648d699ad6431
    resource: repo://packages/core/src/chestLogic.ts
generated: { by: "opencode", at: "2026-11-04T02:58:40.844Z" }
---

# Learning Path and Book Map

The primary learner journey is stage → grade → book → lesson. It is implemented as a set of pre-rendered routes with local state deciding where to send the learner next. The design goal is that returning users land directly on their current book, while first-time users are guided without being asked to re-select the same thing repeatedly.

## First run: stage selection

If no stage is selected, the home route renders `StagePicker`. It offers 小学, 初中, 高中, and 大学. Choosing a stage writes `selectedStage` and `lastStage`, then hard-navigates:

- college goes directly to `/grade/13/`, because college has no grade concept;
- other stages go to `/stage/{stage}/versions/` so the learner can choose textbook editions before grade selection.

Navigation is a full `window.location.assign`, not a client-side transition. Static export plus Android WebView has a history of soft-navigation 404s, so the app treats hard navigation as the safe default.

## Home routing and self-healing

`HomeClient` computes an effective stage through three fallbacks:

1. `selectedStage` — the normal value.
2. `lastStage` — a field-level recovery value written and cleared alongside the primary.
3. `stageOfGrade(selectedGrade)` — the final recovery path for old or partially written saves.

If any fallback succeeds, the learner is not sent back to stage selection. This was a deliberate fix for a reported loop where a missing field forced repeated onboarding.

Once the stage is known:

- college redirects to grade 13;
- a known stage without a grade renders `GradePicker` for that stage;
- a selected grade with a valid `activeBookId` redirects to `/book/{id}/`;
- a selected grade without a valid book redirects to `/grade/{grade}/`.

The book id is validated against the build's real book list. A stale id from a previous build would otherwise hard-navigate to a 404 with no bottom navigation. When validation fails, the fallback grade page always exists.

## Grade selection

`GradePicker` builds options from the stage:

- primary keeps six playful options with child-friendly hints;
- middle and high build one option per grade with exam-oriented hints;
- college would show a single "university student" option, though the normal flow bypasses it.

The picker also exposes an explicit "switch stage" action. Switching clears both `selectedStage` and `selectedGrade`; changing grade elsewhere in the app does not clear the stage.

The grade route pre-renders grades 1 through 13. That is necessary for static export: every possible link target must exist on disk. Grades without books show an empty state with a link to the textbook center.

## Book selection and version preferences

The grade page groups books by subject. Subjects with multiple publishers show version chips. The stored preference is keyed by stage and subject, not globally. Choosing the default publisher clears the preference; choosing a non-default one stores its publisher id.

Books are sorted with the learner's chosen version first and marked "my version", but other versions remain visible. Different editions teach different units, so hiding them would remove legitimate choices. The grade page also offers a "change grade" control that clears grade and active book without touching the stage.

The stage page includes a version-selection card that lists only publishers with interactive content. The textbook center is separate: it lists far more external PDFs and is not limited to generated courses.

## Entering a book

Opening `/book/{bookId}/` triggers `ActiveBookSync`, which sets `activeBookId` and aligns `selectedGrade` to the book. That is what makes the home route "open directly into the current book" on subsequent visits. The sync runs once per book/grade pair to avoid racing with the change-book modal.

The page shows:

- the current book badge and a change-book modal listing same-grade books;
- a "continue learning" card if an unfinished lesson session matches this book's lesson id pattern;
- passage and story entry links when the book has those assets;
- the path map itself.

## Path map and unlock rules

`BookPathView` derives lesson statuses from `completedLessons`:

- a completed lesson is `completed` and carries its star count;
- the first incomplete lesson becomes `current`;
- all later lessons are `locked`.

This is a strictly linear unlock along the flattened lesson array, which is grouped by unit in the data build. There is no per-unit independence for ordinary lessons: finishing the last lesson of unit 1 unlocks the first lesson of unit 2.

The map groups lessons by unit, inserts chest slots, and appends optional exam nodes. It uses a snake layout and a sticky unit banner that follows scrolling. Clicking a node opens a start modal with title, question count, estimated XP, heart state, and resume/restart choices.

## Chests

Chest slots are computed, not stored in the outline. Within each unit, every fifth lesson is followed by a chest. A unit shorter than five lessons has none. The chest id is stable, and the store's `claimedChests` ledger makes claiming idempotent.

Opening a chest rolls a common, rare, or epic gem reward and adds it immediately. Once claimed, the node remains claimed across reloads and backups.

## Exam nodes

A unit may have an exam lesson if the data builder found at least four exam questions. The path view appends one exam node at the end of that unit, separate from the ordinary linear chain.

Its unlock rule is different: it unlocks when **all ordinary lessons in that unit** are completed. It does not block or depend on later units. This lets a learner revisit a finished unit for a challenge without disturbing the main progression.

Passing an exam with accuracy ≥ 0.8 marks it "conquered" and shows a gold trophy state. Exam XP is doubled; if it is also a weekend, the multiplier stacks to ×4. Exam lessons do not receive a special gem multiplier.

## Continue learning

An unfinished lesson session is persisted with the lesson id, solved queue, current queue, counters, combo, start time, and session XP. The book page shows a continue card only when the session belongs to that book and has actual answered progress. The home page similarly routes directly to the active book.

The card links to `/lesson/{bookId}__{lessonId}/`, the composite key used by the static lesson route. The lesson runner itself handles restoring the queue; the modal and card use shared helpers so "has progress" and "remaining questions" mean the same thing everywhere.

## Jump-ahead

Jump-ahead lets a learner skip earlier units. A path action opens `/jump/?book=...&unit=...`. The page:

1. Loads the book outline.
2. Collects all lessons from earlier units.
3. Fetches their lesson JSON.
4. Deterministically samples up to 15 questions with even coverage.
5. Runs a quiz with no intro and no skipping.

Passing requires accuracy ≥ 0.8. On success, the store marks every previously incomplete lesson as completed with one star and accuracy 0.8. It deliberately grants no XP, gems, streak advancement, or quest progress, preventing a learner from farming rewards by repeatedly testing out. Already completed lessons keep their better results.

Failing costs one heart. The learner can retry with a new seed, which produces a different question set. At zero hearts, the standard refill gate appears. The jump session is synthetic: it is not persisted, not added to the mistakes bank, and does not write a normal lesson result.

## Stale-state edge cases

The path is robust to several stale-state conditions:

- a missing stage falls back to stage history, then to the selected grade;
- a stale active book is rejected and the learner goes to the grade page;
- an empty queue snapshot from an interrupted final answer is ignored rather than wiping progress;
- a book with no interactive content shows an empty state rather than a broken map;
- a unit without exam metadata simply has no challenge node.

These are not cosmetic details. Each one corresponds to a way a learner could otherwise get stuck in a dead page or lose progress.

## Related pages

- [Data and Content Pipeline](../architecture/data-and-content-pipeline.md)
- [Textbook Catalog and Publishers](../content/textbook-catalog-and-publishers.md)
- [Lesson Runner](./lesson-runner.md)
- [Gamification and Economy](./gamification-and-economy.md)
