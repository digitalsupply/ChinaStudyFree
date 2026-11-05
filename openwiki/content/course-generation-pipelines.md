---
type: content-pipeline
title: Course Generation Pipelines
description: Deterministic JavaScript generators and LLM-assisted Python pipelines that author outlines, quizzes, stories, passages, page images, and pre-generated audio for the learning app.
tags: [content, generation, llm, validation, tts]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-04T02:58:40.844Z
sources:
  - id: openwiki-source-f41577d2ec35d3f44a570c38
    resource: repo://apps/web/scripts/build-data.ts
  - id: openwiki-source-9c461da45ae6e1d3d2cab331
    resource: repo://scripts/gen-coverage-content.mjs
  - id: openwiki-source-2669dee54048f2c457f8bd0f
    resource: repo://scripts/gen-stage-content.mjs
  - id: openwiki-source-b4b5ed312f3a5601d646dc55
    resource: repo://scripts/gen-version-content.mjs
  - id: openwiki-source-542b1db6fe7cf6fbc93680eb
    resource: repo://scripts/scripts/passages/extract_passages.py
  - id: openwiki-source-1ff825fb9d00c4142237a672
    resource: repo://scripts/scripts/passages/render_pages.py
  - id: openwiki-source-fb47f7456beb2a0557895142
    resource: repo://scripts/scripts/quiz/pipeline.py
  - id: openwiki-source-23399760c32ed0a73b323c67
    resource: repo://scripts/scripts/stories/pipeline.py
  - id: openwiki-source-903fb9008c9887165a8fb61c
    resource: repo://scripts/tts/generate-audio.mjs
  - id: openwiki-source-9a2078ee97acebfab554d221
    resource: repo://scripts/validate-quizzes.mjs
generated: { by: "opencode", at: "2026-11-04T02:58:40.844Z" }
---

# Course Generation Pipelines

ChinaStudyFree's course content is produced by two complementary families of tooling:

- **Deterministic JavaScript generators** that build curriculum-aligned outlines and quiz JSON without calling a model.
- **LLM-assisted Python pipelines** that extract textbook structure, generate quizzes, write graded stories, and extract passage text, followed by validation and optional page rendering.

All of them converge on the same authoring layout under `output/` (and `data/` for passages and stories) so that `build-data` can consume the results uniformly.

## Shared authoring format

Every generator ultimately emits:

- `output/{subject}/outlines/{stem}.json` — textbook metadata and a list of units with knowledge points.
- `output/{subject}/quizzes/{stem}_unit{N}.json` — knowledge summary, unit test, and optional exam questions.

The quiz file contains `knowledge_summary` entries with core concept, key formula, common mistakes, and tips; a `unit_test` with questions; and an `exam` block only when enough exam questions exist. This is exactly the shape `build-data` expects when it groups questions into lessons.

## Deterministic generators

Three JavaScript generators cover different content gaps:

### Stage content

`gen-stage-content.mjs` produces middle-school, high-school, and college courses. It uses small constructors for true/false, choice, fill-in, and calculation questions, plus helpers that generate arithmetic, linear-equation, square-root, and cube-root exercises programmatically. The stated principle is that knowledge points and conceptual questions are hand-authored for subject accuracy, while computation questions are generated with programmatically calculated answers.

Its `writeBook` function writes the outline, resets question ids per unit, assembles `unit_test` and optional `exam` blocks, and writes one quiz file per unit. It is a pure content authoring script: no network or API key is required.

### Multi-version content

`gen-version-content.mjs` targets the "one curriculum, many editions" problem. It authors different units for non-default publishers such as 沪教版, 外研版, 译林版, 北师大版, 苏教版, and 浙教版. The unit themes and knowledge-point order are intentionally different from the default edition, matching the real textbook table of contents. It uses the same `writeBook` shape, and relies on publisher keywords in the filename so that `build-data` inserts the right ASCII publisher slug into the book id.

### Coverage content

`gen-coverage-content.mjs` fills gaps in grade/subject coverage and adds more multi-publisher editions. It can create entirely new books or call `extendBook` to append units to an existing outline, continuing the unit numbering. Like the other generators it is incremental and overwrite-oriented; the documentation explicitly forbids wildcard deletion of `output/`, because that would destroy upstream original question banks.

All three generators print a summary of books, units, and questions produced. They do not validate answers by themselves; that is the job of the quiz validator and the later build/CI smoke checks.

## LLM-assisted quiz pipeline

The Python quiz pipeline is designed for extracting structure from real textbook PDFs and generating questions with an LLM.

Its flow is:

1. Load configuration from environment or a project `.env`, requiring `OPENROUTER_API_KEY`.
2. Download the textbook PDF from the ChinaTextbook raw GitHub base into `output/{subject}/pdfs`.
3. Split the PDF into batches of pages, defaulting to ten pages per batch.
4. Extract each batch with a vision-capable model, producing markdown or structured content.
5. Generate or reuse an outline for the textbook.
6. Generate one quiz per unit with a subject-specific prompt and JSON schema.
7. Validate the quiz, attach validation issues when found, and write both the quiz JSON and a human-readable knowledge markdown file.

The pipeline is idempotent at the textbook and unit level: an existing outline is reused, and units whose quiz file already exists are skipped. Unit generation runs concurrently with a configurable worker count. Cost and token usage are accumulated per step and printed at the end.

Validation is strict about the authoring contract:

- score totals must match the declared total;
- difficulty must be in range;
- question types must be allowed for the subject;
- choice questions need four options and an answer that appears in them;
- true/false answers must be `对` or `错`;
- numeric fill-in answers must be digit strings;
- matching questions need eight options and four answer pairs;
- word-order answers must be a permutation of the options;
- answers and explanations must be non-empty.

## Story pipeline

The story pipeline reads existing outlines and writes `data/stories/{subject}/{bookId}.json`. For each unit it asks an LLM for graded short stories plus comprehension questions, with Chinese and English prompt variants and grade-level sentence constraints.

Its validator checks:

- at least one story was produced;
- sentence counts fall within the grade band;
- each story has at least three questions;
- true/false answers use the language-appropriate values;
- choice questions have four options and an answer present in them;
- text fill-in answers are non-empty;
- explanations are non-empty;
- all three required question types appear.

Only Chinese and English are supported, matching the subjects that have reading content. The generator caches intermediate work under a hidden cache directory and skips work that already exists.

## Passage extraction and page rendering

Passage extraction is a separate, higher-fidelity pipeline because it copies original text rather than summarizing it. It reuses the quiz pipeline's PDF download and batching, then asks a stronger vision model to extract passages sentence by sentence.

Output goes to `data/passages/{subject}/{bookId}.draft.json`, not the final path. The draft includes a review checklist and placeholder unit numbers. A human must verify the text against the PDF, remove non-passage content, fill unit metadata, and rename the file from `.draft.json` to `.json`. `build-data` ignores draft files, so this review gate is enforced by naming convention.

`render_pages.py` then renders textbook page images. It computes a per-book offset between the printed page number reported by the extraction model and the physical PDF page by searching for passage anchors, taking the modal offset across samples, and applying it to every passage. Rendered JPEGs go to `apps/web/public/textbook-pages/{bookId}/p{n}.jpg`, and a `pages.json` mapping is written for the data build.

## Quiz validation law

`validate-quizzes.mjs` is the repository-wide invariant check over generated quiz files. It enforces four rules:

1. Choice answers must exactly equal one of the options.
2. Choice options must not repeat.
3. True/false answers must be `对` or `错`.
4. Every question must have question text and an explanation, and fill-in/calculation questions must not have empty answers.

It reports the first forty problems and exits non-zero if any exist. CI runs it after a data build, so a content generator that breaks the contract fails the pipeline.

## Pre-generated audio

`scripts/tts/generate-audio.mjs` walks the built data, collects unique speakable strings from lesson questions, options, explanations, knowledge summaries, passages, stories, and a fixed list of UI phrases, and synthesizes missing audio through DashScope.

Two details matter:

- The hash used for the output path is computed from the **original** normalized text, matching `build-data` exactly.
- The text sent to synthesis is separately cleaned: LaTeX fractions, roots, powers, and symbols are converted to spoken Chinese (or dropped) without changing the hash input.

Existing non-empty files are skipped, so the script is resumable. A dry run reports counts and source distribution without requiring a key. After generation, `build-data` must run again to inject the new paths.

## Quality boundaries

The deterministic generators guarantee internally consistent arithmetic but rely on human-authored concepts. The LLM pipelines add breadth but need validation because models can produce malformed options, wrong answer membership, or off-grade language. The human review gate on passages is the strongest control; quiz and story validation are automated approximations. None of these pipelines replaces teacher review of factual accuracy, which the project documentation flags as ongoing work.

## Related pages

- [Data and Content Pipeline](../architecture/data-and-content-pipeline.md)
- [Textbook Catalog and Publishers](./textbook-catalog-and-publishers.md)
- [Testing and CI](../operations/testing-and-ci.md)
- [Voice Synthesis](../server/voice-synthesis.md)
