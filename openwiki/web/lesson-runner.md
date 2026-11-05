---
type: "Reference"
title: "Lesson Runner"
openwiki_generated: true
verified:
  - by: openwiki/0.7.2
    at: 2026-11-04T02:58:40.844Z
sources:
  - id: openwiki-source-b751a418d5950bb0de9663c0
    resource: repo://apps/web/src/app/lesson/%5Blesson%5D/LessonPageClient.tsx
  - id: openwiki-source-ccfcb2b72d193169c7f2db17
    resource: repo://apps/web/src/app/lesson/%5Blesson%5D/page.tsx
  - id: openwiki-source-bc682161468825b2e367b4cf
    resource: repo://apps/web/src/components/LessonRunner.tsx
  - id: openwiki-source-114dd1060eed942d261ce26f
    resource: repo://apps/web/src/lib/exam.ts
generated: { by: "opencode", at: "2026-11-04T02:58:40.844Z" }
---


# Lesson Runner

The lesson runner is the most interactive part of the app. It owns the question queue, answer grading, heart loss, combo state, session persistence, and the multi-act completion sequence. It is deliberately client-only; the server-rendered page supplies lesson JSON and an optional chest slot, and the runner takes over from there.

## Entry and data

`/lesson/[lesson]/` uses a composite route key `{bookId}__{lessonId}`. The server component loads the lesson file and the book outline, determines whether a chest follows this lesson, and passes both to a dynamically imported client component with SSR disabled. The composite key keeps the route compatible with static export.

The runtime receives:

- the lesson: id, title, book and unit metadata, knowledge summary, questions;
- an optional chest slot describing the chest that immediately follows this lesson.

## Knowledge intro

If the lesson has a knowledge summary, the runner starts on a paginated intro card rather than the first question. It builds pages only for fields that exist:

- core concept ("What is this?");
- key formula or rule ("Remember this!");
- common mistakes ("Watch out for these!");
- study tips ("A little trick").

Each page auto-narrates a mascot phrase and its content, with pre-generated audio preferred and text fallback. If every field is empty, the intro auto-completes. A resumed session skips the intro, because the learner has already seen it.

The intro is also a persistence boundary: no lesson session is written until the intro is dismissed and at least one question has been attempted.

## Question queue and first-attempt accounting

The runner does not use a simple linear index. It maintains:

- `currentId`: the question being answered;
- `queue`: ids waiting after the current one;
- `solved`: ids answered correctly and removed;
- `attempted`: a ref set of ids that have received a first attempt.

On load, the first question becomes current and the rest are queued.

When an answer is checked:

- A correct answer immediately counts as solved and leaves the queue.
- A wrong answer is appended to the tail of the queue. The learner must eventually answer it correctly; the lesson only finishes when the queue is empty.
- `gradeAnswer` from core decides correctness using the type-specific tolerance rules.

Only the **first attempt** on a given question affects scoring:

- it increments `correctCount` or `mistakeCount`;
- it adds the question to the mistake bank on a wrong answer;
- it adds base XP on a correct answer;
- it drives accuracy and stars.

Re-answering a requeued question does not add XP and does not change the first-attempt accuracy. This is why the queue can require many interactions without inflating the score.

Progress is `solved.length / total`, so it advances only when a question leaves the queue. Combo increments on correct answers and resets on wrong ones; it is presentation only.

## Hearts and the zero-heart gate

A wrong answer or a manual skip costs one heart. When the learner reaches zero:

- If they are in the feedback phase, pressing continue opens a non-dismissable heart gate instead of advancing.
- If they enter a resumable lesson with zero hearts, the gate opens immediately.
- If they enter a brand-new lesson with zero hearts, a failure screen appears with the next-heart countdown.

The gate has three exits:

1. Spend gems to refill hearts and continue in place.
2. Go to the review screen; the active lesson session is preserved.
3. Exit to the book page; the session is also preserved.

The gate closes automatically if natural heart regeneration brings the count above zero while it is open, and the lesson resumes at the correct phase.

Hearts do not block review sessions, which are a safe zone.

## Session persistence and resume

While the learner is answering, the runner writes an `activeLesson` snapshot to the progress store whenever meaningful state changes. It skips writing when:

- the intro is still open;
- nothing has been attempted yet;
- the persisted queue would be empty after the final answer.

That last guard matters: a final checked answer empties the queue, but the lesson has not yet settled. Writing an empty queue would make a reload hit the "empty queue without completion" fallback and discard progress. The runner keeps the last non-empty snapshot instead.

On mount, it first refreshes natural heart regeneration, then checks for a stored session for the same lesson with actual progress. If found, it restores:

- solved and queued ids, filtered to ids that still exist in the lesson;
- any new questions added by a content update, appended to the queue;
- correct and mistake counts, combo, max combo, session XP, and start time.

Old sessions without queue/solved ids fall back to the legacy linear index. A session for a different lesson, or an empty legacy session, is discarded.

Completion clears the session. Failure does **not** clear it, because the failure screen offers retry and the gate promises that leaving preserves progress. Explicit confirmed exit clears it; choosing to leave through the heart gate does not.

## Learning time

The runner accumulates learning time only while the page is visible:

- a 30-second interval flushes elapsed time;
- a single flush is capped at ten minutes to avoid counting system sleep;
- on tab hide it flushes the visible span and stops; on return it restarts;
- unmount flushes the final visible span.

The store keeps time on its own date field, separate from the XP date. Parental daily limits can therefore block new lessons without corrupting daily XP rollover.

## Input and feedback details

The runner supports keyboard interaction: Enter submits when an answer exists, Enter or Space continues after feedback, and individual question components implement number-key selection. When any modal is open (exit confirm, heart gate, settings, intro), an interaction lock disables both keyboard and automatic submission so a hidden question cannot be graded behind the overlay.

Matching questions auto-submit when the answer string becomes complete. Correct answers trigger haptics, sound, XP float animation, mascot reactions, progress pulses, and combo overlays at 3, 5, and 10. Wrong answers trigger a shake, a sad mascot, a bubble, and a heart-loss sound. All of this is presentation; the authoritative state changes are the queue, counters, and store writes.

## Completion settlement

When the final correct answer is continued, the runner settles the lesson:

1. Compute accuracy as first-attempt correct answers divided by total questions.
2. Compute perfect as zero first-attempt mistakes.
3. Determine first-ever 3-star via the store's perfected ledger.
4. Compute XP through `xpForLesson`, including exam and weekend multipliers.
5. Roll a chest reward if a chest slot exists and is unclaimed.
6. Capture quest progress before settlement.
7. Claim the chest and gems if applicable.
8. Call `recordLessonComplete`, which atomically updates XP, gems, stars, streak, daily goal, daily counts, milestones, and perfected lessons.
9. Capture quest progress after settlement.
10. Freeze a stats snapshot and show the completion screen.

The completion screen is a sequence of acts, not a single page:

- stars, with perfect, first-three-star, exam, and weekend badges;
- exam conquest if accuracy ≥ 0.8;
- streak if today's first activity advanced it;
- daily goal if this settlement crossed it;
- stats with credited XP and gems;
- quest progress before → after.

The runner displays the credited XP, not a recomputed estimate, so the number on the celebration screen matches the store.

## Exam lessons

An exam lesson is identified by the id pattern `{bookId}-u{n}-exam`. It has no knowledge intro and gets an XP multiplier of 2. If the lesson occurs on a weekend, the multiplier stacks to 4. The gem drip is not multiplied.

A pass at ≥ 0.8 accuracy marks the lesson conquered in the UI and adds the conquest act. Exam lessons are optional challenge nodes; they do not block ordinary progression.

## Failure, retry, and exit

A failure screen is used when a brand-new lesson starts at zero hearts. Retry resets all local state to the first question without a full page reload, because the component is client-rendered and a router refresh would not reset its state.

Exiting with zero attempts navigates away immediately. Exiting after attempts asks for confirmation; confirming clears the session. Exiting via the heart gate does not clear it. This asymmetry is intentional: the confirmation is an explicit "discard", while the gate is an interruption.

## Related pages

- [Learning Algorithms](../core/learning-algorithms.md)
- [Gamification and Economy](./gamification-and-economy.md)
- [Progress Store and Persistence](./progress-and-persistence.md)
- [Reading, Stories and Audio](./reading-stories-and-audio.md)
