---
type: architecture
title: Data and Content Pipeline
description: How build-data converts outline and quiz JSON, passages, stories, textbook page mappings, and generated audio into the static data tree consumed by the web app.
tags: [data, build, content, book-id, audio]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-04T02:58:40.844Z
sources:
  - id: openwiki-source-f41577d2ec35d3f44a570c38
    resource: repo://apps/web/scripts/build-data.ts
generated: { by: "opencode", at: "2026-11-04T02:58:40.844Z" }
---

# Data and Content Pipeline

The frontend never reads the authoring format directly. `apps/web/scripts/build-data.ts` is the boundary between the repository's content directories and the static JSON tree under `apps/web/public/data`. It runs before every web build and before development, and it decides book identity, lesson granularity, optional challenge lessons, media paths, and the shape of the site index.

## Inputs and outputs

The script reads from five locations:

- `output/{subject}/outlines/*.json` — textbook outlines.
- `output/{subject}/quizzes/{outlineStem}_unit{N}.json` — per-unit quizzes, knowledge summaries, and optional exam questions.
- `data/passages/{subject}/{bookId}.json` — sentence-level textbook passages.
- `data/stories/{subject}/{bookId}.json` — generated graded stories and comprehension questions.
- `apps/web/public/audio`, `public/textbook-pages`, and `public/story-images` — optional media already present on disk.

It writes `apps/web/public/data/index.json` plus `public/data/books/{bookId}/` containing `outline.json`, one file per lesson under `lessons/`, and optional `passages.json` and `stories.json`. Before rebuilding, it removes the old `index.json` and `books/` directory but deliberately leaves unrelated generated files such as `textbook-catalog.json` in place.

## Subject and book discovery

The script contains an explicit subject table for all twelve supported subjects, each with a display name and a default publisher. It scans each subject's `outlines/` directory and ignores subjects or directories that do not exist, so partial content sets build cleanly.

Book identity is parsed from the outline filename stem. The parser recognizes:

- Primary through high-school grade/semester patterns such as `一年级上册`, `七年级下册`, and `高一上册`.
- College courses prefixed with `大学`, which map to grade 13 and an ASCII course slug.
- Publisher markers in the filename, resolved through `@cstf/core/publishers`.

The resulting `bookId` is deliberately stable and URL-safe:

- Math default editions keep the legacy form `g1up`.
- Other subjects prefix the subject, for example `chinese-g1up` or `english-g3up`.
- A non-default publisher inserts an ASCII slug, for example `english-hujiao-g3up` or `math-beishida-g7up`.
- College courses use `college-{subject}-{slug}`, for example `college-english-comprehensive`.

This rule preserves old localStorage progress for default math books while letting multiple editions of the same subject and grade coexist. It also keeps Chinese characters out of URLs and static output paths.

## From outline to lessons

For each textbook, the builder reads the outline and then reads one quiz file per unit. Each quiz contributes:

- `knowledge_summary` entries, decorated with audio paths.
- `unit_test.questions`, decorated and normalized.
- `exam.questions`, decorated and normalized when present.

Questions are grouped by `knowledge_point`. The unit's knowledge-point order from the outline is used first, then any extra points found only in the quiz are appended. Empty groups are dropped, so a unit does not produce a lesson with zero questions.

Each surviving group becomes a lesson with an id of the form `{bookId}-u{unitNumber}-kp{index}`. The lesson carries its questions and the matching knowledge summary. The builder then renumbers `kpIndex` and `kpTotal` over the lessons that actually exist, not over the raw outline points.

A separate `exam` lesson is produced when the unit has at least one ordinary lesson and at least four exam questions. The lesson id is `{bookId}-u{n}-exam`; up to fifteen questions are selected by uniform sampling while preserving order. The unit object in the emitted outline gains `examLessonId` and `examQuestionCount`, which the UI uses to render an optional challenge node.

## Question normalization

Two transformations happen during the build:

1. **Question type reassignment.** `fill_blank` and `calculation` questions whose answer is not purely numeric (digits, `.`, `/`, `-`) are changed to `fill_blank_text`. This prevents the numeric keypad from being shown for an answer containing Chinese characters or units.
2. **Audio decoration.** Question text, option text, explanations, and knowledge-summary fields receive an audio URL only when a matching file exists.

The audio convention is content-addressed: normalized text is trimmed and whitespace-collapsed, hashed with SHA-1, and addressed as `/audio/{hash[0:2]}/{hash}{ext}`. Supported extensions are checked in priority order `.opus`, `.mp3`, `.wav`. Option prefixes such as `A.` are stripped before hashing. Because the builder indexes only files that are actually present, a missing audio directory simply results in no audio fields rather than broken links.

## Passages and textbook pages

Passages come from `data/passages`, not from `output/`. Draft files ending in `.draft.json` are ignored so unreviewed extracts do not leak into the product. For each book, the builder loads `public/textbook-pages/{bookId}/pages.json`, which maps a passage to its real PDF page and a small set of nearby page images. It then emits `books/{bookId}/passages.json` with sentences, optional per-sentence audio, page hints, and image URLs, and records that the book has passages.

If a page mapping is missing or unreadable, the passage still builds; it simply has no page images. A malformed passage file is logged and skipped.

## Stories

Stories come from `data/stories`. Each book file contributes stories with sentences, optional vocabulary, and comprehension questions. Story questions are audio-decorated the same way as lesson questions. If a matching image exists under `public/story-images/{bookId}/{storyId}.jpg`, its URL is attached. The output is `books/{bookId}/stories.json`, and the book is marked as having stories.

## The site index

The final `index.json` contains the sorted `books` array plus `generatedAt`, `totalLessons`, and `totalQuestions`. Each book record includes:

- identity: `id`, `grade`, `semester`, `subject`, and optional `publisher`/`publisherName`;
- display names: `gradeName`, `semesterName`, `subjectName`, `textbookName`, `fullName`;
- counts: `unitsCount`, `lessonsCount`;
- derived flags: `stage`, `hasPassages`, `hasStories`.

Books are sorted by subject order, semester (up before down), then grade. Pages read this file for home routing, grade listings, static parameter generation, and validity checks on remembered book ids.

## Failure behavior

The pipeline is intentionally tolerant:

- A missing subject directory, outline directory, passages directory, or stories directory is skipped.
- A missing quiz file logs a warning and skips that unit rather than inventing questions.
- Malformed JSON is logged and skipped.
- An unrecognized filename stem is skipped.
- Missing media never breaks the build; it only omits optional fields.

The consequence is that the site can build from a partial content set. It also means a silent content regression can produce a smaller index rather than a hard failure, which is why the data-build smoke job and coverage report exist in CI and local workflows.

## Related pages

- [Course Generation Pipelines](../content/course-generation-pipelines.md)
- [Textbook Catalog and Publishers](../content/textbook-catalog-and-publishers.md)
- [Learning Path and Book Map](../web/learning-path.md)
- [Reading, Stories and Audio](../web/reading-stories-and-audio.md)
