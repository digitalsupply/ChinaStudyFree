---
type: content-model
title: Textbook Catalog and Publishers
description: The multi-publisher textbook model, publisher-aware book ids, the ChinaTextbook catalog sync, the textbook center filters, version preferences, and the coverage report.
tags: [textbooks, publishers, catalog, versions, coverage]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-04T02:58:40.844Z
sources:
  - id: openwiki-source-f41577d2ec35d3f44a570c38
    resource: repo://apps/web/scripts/build-data.ts
  - id: openwiki-source-d8704ac342e38e3e2e6389ef
    resource: repo://apps/web/src/app/textbooks/TextbooksClient.tsx
  - id: openwiki-source-c9db14ed74c012e9e81344de
    resource: repo://apps/web/src/lib/versions.ts
  - id: openwiki-source-ed5136427f249ad8805ea377
    resource: repo://packages/core/src/publishers.ts
  - id: openwiki-source-6c8aa5ff8f923383719c3dbe
    resource: repo://scripts/coverage-report.mjs
  - id: openwiki-source-f1ab3dd6fd38705d1f59e8d8
    resource: repo://scripts/sync-textbooks.mjs
generated: { by: "opencode", at: "2026-11-04T02:58:40.844Z" }
---

# Textbook Catalog and Publishers

Chinese textbooks follow a "one curriculum, many editions" model: the same grade and subject may exist as 人教版, 沪教版, 北师大版, 苏教版, 外研版, 译林版, 浙教版, and others. ChinaStudyFree treats publisher as a first-class concept rather than an afterthought, because different editions have different unit themes, knowledge-point order, and difficulty progression. Two editions cannot share lesson ids or progress records.

## Publisher registry

`packages/core/publishers.ts` is the single source of truth. Each publisher entry has:

- an `id` used in URLs, storage, and content metadata;
- a display `label` such as `人教版PEP` or `沪教版`;
- an ASCII `slug` inserted into book ids;
- a theme color used by badges and filters;
- filename matching patterns.

The registry includes primary and secondary publishers, college publishers (高教社 and 清华社), and a `general` fallback. `findPublisherByStem` scans the registry in order and returns the first match, so more specific patterns such as `人教版PEP` appear before the broader `人教版`. If no pattern matches, the calling code falls back to the subject's default publisher.

`publisherOfPath` handles the ChinaTextbook directory convention used by the catalog: the third path segment is a version folder, and suffixes such as `-上海教育出版社` or parenthetical editor notes are stripped for display. If that segment is actually a filename, the path is marked `未标注`.

## Stable book ids

`build-data` combines the publisher with grade/semester and subject information:

- The default edition for a subject keeps a short id. Math keeps the legacy `g1up` form; other subjects prefix the subject, for example `chinese-g1up` or `english-g3up`.
- A non-default publisher inserts its slug, for example `english-hujiao-g3up`, `english-waiyan-g3up`, `math-beishida-g7up`, or `math-zhejiao-g7up`.
- College courses use `college-{subject}-{slug}`, where the course name is mapped through an ASCII slug table so no Chinese characters enter URLs or filesystem paths.

The default edition is the one whose book id has no publisher segment. This is deliberate backward compatibility: older users' localStorage progress is keyed by the original ids, so renaming the default edition would lose their stars and completion history. Non-default editions are additive and coexist with the default.

## Catalog synchronization

`scripts/sync-textbooks.mjs` generates `apps/web/public/data/textbook-catalog.json` from `TapXWorld/ChinaTextbook`. It uses the GitHub trees API with recursive listing and a simple retry on rate limiting. If the root tree is truncated or empty, it falls back to fetching each top-level stage folder separately.

It maps top-level folders to stage ids:

- 小学 and 小学（五•四学制） → `primary`
- 初中 and 初中（五•四学制） → `middle`
- 高中 → `high`
- 大学 → `college`

Only `.pdf` blobs are retained. Each entry records stage, subject, a best-effort grade/semester label, filename, a GitHub blob URL, and the original repository path. Grade labels are inferred from filename and folder tokens such as `二年级上册`, `高一`, `必修一`, `第一册`, or `上册`; if none match, the folder name is used.

Entries are sorted by stage, subject, grade, and name. The output includes `generatedAt`, `source`, a note explaining that the catalog contains PDF links only, `count`, and `entries`.

The sync is intentionally optional and failure-tolerant. CI and Docker run it with `continue-on-error`/`|| true`, and the frontend treats a failed fetch as an empty catalog state. The PDFs themselves are not bundled: they are external links, which keeps installers small and respects the upstream project's distribution model.

## Textbook center UI

`/textbooks` is a client page that fetches the generated catalog at runtime. It offers:

- stage tabs for 小学 / 初中 / 高中 / 大学;
- publisher filters derived from `publisherOfPath` over the current stage's entries;
- a preview of the top twelve publishers with an expand control, because some stages have dozens of versions;
- keyword search across filename, subject, grade, and publisher;
- grouping by subject and then grade;
- URL state for `stage` and `publisher`, so links are shareable and survive a refresh.

The page initializes its stage from the `stage` query parameter, then the user's remembered stage, then primary school. If a selected publisher disappears after switching stages, the filter resets to all.

Catalog failure is non-fatal: `catalog` stays null and the page renders an empty result rather than crashing. That matters for offline builds and for GitHub API outages.

## Version preferences

`apps/web/src/lib/versions.ts` bridges the publisher registry and the learner's remembered choice.

It defines a default publisher per subject, with a deliberate English exception: primary English defaults to 人教版PEP (`pep`), while middle and high school English default to 人教版 (`renjiao`). This reflects the different textbook series and keeps the legacy book ids stable.

`versionsForSubject` groups a stage's books by publisher and returns only publishers that actually have interactive courses. Each option reports its book count, whether it is the default, and its books. Options are sorted default-first, then by book count, then label. A publisher with catalog PDFs but no generated interactive content never appears as a selectable course version.

`effectivePublisherId` validates a stored preference against the available books and falls back to the default if the preference is stale or invalid. `orderBooksByVersion` sorts the user's chosen edition first without hiding other editions, so switching remains possible.

The preference is stored per stage and subject (`subjectVersions` in the progress store), not globally. A learner can use 沪教版 English in primary school and 人教版 in middle school without one choice overwriting the other.

## Coverage reporting

`scripts/coverage-report.mjs` reads the built `index.json` and prints a stage × grade × subject matrix of present and missing subjects, followed by a detailed list of every book with its publisher and unit/lesson counts. It is an operational tool, not a runtime feature. It makes gaps visible after generation and helps verify that multi-publisher additions did not accidentally replace default editions.

## Boundaries and limitations

The catalog is a directory of external PDF links, not a structured question source. Titles and grade labels are heuristic. Publisher detection is filename-based and can misclassify ambiguous names. Interactive content exists only for the subset of books that generators have produced. The version picker intentionally shows only that subset, while the catalog shows the much larger universe of available PDFs.

## Related pages

- [Data and Content Pipeline](../architecture/data-and-content-pipeline.md)
- [Learning Path and Book Map](../web/learning-path.md)
- [Course Generation Pipelines](./course-generation-pipelines.md)
