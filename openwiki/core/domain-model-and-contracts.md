---
type: core-contract
title: Core Domain Model and Contracts
description: The shared TypeScript domain for questions, lessons, books, stages, grades, subjects, and publishers, and the compatibility rules that let web and iOS consume the same contracts.
tags: [core, domain-model, types, stage, subject, publisher]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-04T02:58:40.844Z
sources:
  - id: openwiki-source-f41577d2ec35d3f44a570c38
    resource: repo://apps/web/scripts/build-data.ts
  - id: openwiki-source-b6d4dbadc290acfd0ace4931
    resource: repo://packages/core/package.json
  - id: openwiki-source-d97e50806967580379c7aa25
    resource: repo://packages/core/src/grade.ts
  - id: openwiki-source-ed5136427f249ad8805ea377
    resource: repo://packages/core/src/publishers.ts
  - id: openwiki-source-7f8a6aed65553c012896a23c
    resource: repo://packages/core/src/stage.ts
  - id: openwiki-source-4a9a7e5f799b574be1b660e2
    resource: repo://packages/core/src/subjects.ts
  - id: openwiki-source-1ca847359486a7fa0bbda57a
    resource: repo://packages/core/src/types.ts
generated: { by: "opencode", at: "2026-11-04T02:58:40.844Z" }
---

# Core Domain Model and Contracts

`packages/core` is the contract layer between the content pipeline, the web app, and the iOS implementation. It is pure TypeScript: no DOM, no Next.js, no React Native. That constraint is what makes it portable. The package exposes subpath exports so consumers can import a narrow module rather than the entire surface.

This page describes the shapes and compatibility rules other pages depend on. It is not an exhaustive type listing; the source is the authority.

## Questions

A `Question` is the smallest assessable unit. Its fields carry both content and presentation metadata:

- `id`, `type`, `score`, `difficulty`, `knowledge_point`;
- `question`, `options`, `answer`, `explanation`;
- an optional `audio` object for question text, options, and explanation.

The `QuestionType` union covers true/false, single choice, numeric fill-in, calculation, text fill-in, word order, matching, and a legacy word-problem type. The type decides which renderer and grading rule applies.

The `answer` field is a canonical string whose meaning depends on type:

- **true_false** uses `对` / `错` in generated content, though the grader tolerates English and symbol variants.
- **choice** normally stores the option text; the grader also accepts a single letter and can map an option text back to its index.
- **fill_blank / calculation** are intended for numeric keypad input; `build-data` retypes them when the answer is not numeric.
- **fill_blank_text** compares normalized text.
- **word_order** stores a comma-separated sequence.
- **matching** stores pairs such as `A-1,B-2,C-3,D-4`.

This string-based design keeps content authoring simple and lets older data remain usable, at the cost of a grader that must be tolerant.

## Knowledge summaries, lessons, and outlines

A `KnowledgeSummary` carries the teaching card shown before practice: point, core concept, key formula, common mistakes, tips, and optional audio paths.

A `Lesson` is the learner-facing unit: an id such as `{bookId}-u{unit}-kp{index}`, a title, book and unit metadata, knowledge-point position and total, the questions, and an optional knowledge summary. The unit position fields are presentation metadata; the actual lesson set may be smaller than the outline because empty knowledge-point groups are dropped.

An `Outline` is a textbook-level list of units. Each `Unit` has a number, title, knowledge points, and optional exam metadata (`examLessonId`, `examQuestionCount`). The exam fields are optional because not every unit has enough exam questions. The built outline also carries `bookId`, grade, semester, subject, and a flattened `lessons` array used by the path UI.

A `Book` describes a textbook edition: stable id, grade, semester, subject, display names, publisher metadata, unit and lesson counts, stage, and optional passage/story flags. `subject` is optional for backward compatibility; consumers default it to math. Grade 13 represents college courses, which have no grade-based navigation.

`SiteIndex` wraps the book list with generation time and total lesson/question counts. It is the entry point pages use for routing, grade listings, and static parameter generation.

## Stages and grades

`StageId` has four values: `primary`, `middle`, `high`, and `college`. The stage table defines the display name, one-character short label, included grades, whether it is college, and theme colors.

`stageOfGrade` maps grades 1–6 to primary, 7–9 to middle, 10–12 to high, and anything else (including 0 and 13) to college. `gradeLabel` maps numeric grades to Chinese labels, with 10–12 becoming 高一/高二/高三 and 13 becoming 大学. `gradeFullName` appends 年级 except for college. `gradeLabelsForStage` returns an empty list for college.

These functions are used by the data builder, the grade and stage pages, and the backup/UI logic. They must remain consistent with how filenames are parsed and how books are assigned ids.

## Subjects

The `SubjectId` union covers twelve subjects: math, Chinese, English, science, moral education, physics, chemistry, biology, history, geography, politics, and computer/information technology.

The subject registry supplies a Chinese label, badge classes, and an accent color. It is a UI-facing registry, not a curriculum validator. `resolveSubject` tolerates books without a subject field by returning math.

Adding a subject requires coordinated changes: the union, the registry, the data builder's subject table, and any generator or catalog filtering that enumerates subjects. The core type alone is not sufficient.

## Publishers

Publisher metadata lives in its own module and is covered in depth in [Textbook Catalog and Publishers](../content/textbook-catalog-and-publishers.md). For the domain model, the important contract is that a book may carry a `publisher` id and `publisherName`, and that the id participates in the book id when the edition is not the subject default. A missing publisher is treated as the subject's default.

## Compatibility rules

Several conventions exist specifically to avoid breaking old data:

- A missing `Book.subject` means math.
- A missing publisher means the subject's default edition.
- The default edition's book id has no publisher segment, preserving legacy localStorage keys.
- College content uses grade 13 and ASCII course ids.
- Audio fields are optional; missing audio degrades to the project's online voice or silence, never a broken link.
- Exam fields are optional; units without them simply have no challenge node.
- Generated content may include fields the frontend does not read; unknown fields are ignored rather than rejected.

These rules make the data model forward-compatible within a version. They do not make arbitrary renames safe: changing a book id or lesson id invalidates progress records.

## Cross-platform role

The package's purpose is not merely code reuse. It is behavioral parity. The same pure functions are meant to be mirrored by the iOS client, with `spec/golden-vectors.json` acting as the shared conformance suite. That is why economy, SRS, league, quests, reading ids, week keys, and backup validation live here rather than inside the web app. The domain model defines the vocabulary; the algorithm modules define the behavior.

## Related pages

- [Data and Content Pipeline](../architecture/data-and-content-pipeline.md)
- [Textbook Catalog and Publishers](../content/textbook-catalog-and-publishers.md)
- [Learning Algorithms](./learning-algorithms.md)
- [Review and Cross-Platform State](./review-and-cross-platform-state.md)
