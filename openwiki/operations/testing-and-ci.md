---
type: "Reference"
title: "Testing and CI"
openwiki_generated: true
verified:
  - by: openwiki/0.7.2
    at: 2026-11-04T02:58:40.844Z
sources:
  - id: openwiki-source-1314ccc5cd8f57a789261ebc
    resource: repo://.github/workflows/build-installers.yml
  - id: openwiki-source-164e2da859b5277df81c7d94
    resource: repo://.github/workflows/ci.yml
  - id: openwiki-source-0e12d3dfa3ba72561bb9b0c9
    resource: repo://apps/web/scripts/check-data-quality.mjs
  - id: openwiki-source-f317ee207e1653d2033c81a4
    resource: repo://CONTRIBUTING.md
  - id: openwiki-source-b6d4dbadc290acfd0ace4931
    resource: repo://packages/core/package.json
  - id: openwiki-source-2f32aa5b3a2f9761fb51ba65
    resource: repo://packages/core/spec/golden-vectors.json
  - id: openwiki-source-207d8c5116eb72e28d178d7e
    resource: repo://packages/core/src/__tests__/goldenVectors.test.ts
  - id: openwiki-source-6c8aa5ff8f923383719c3dbe
    resource: repo://scripts/coverage-report.mjs
  - id: openwiki-source-9a2078ee97acebfab554d221
    resource: repo://scripts/validate-quizzes.mjs
generated: { by: "opencode", at: "2026-11-04T02:58:40.844Z" }
---


# Testing and CI

ChinaStudyFree has a small but deliberately layered quality strategy. The highest-risk behavior is cross-platform progression logic, so that is pinned with unit tests and shared golden vectors. Content and build integrity are covered by smoke jobs. Visual and end-to-end behavior are mostly verified manually.

## Test layers

### Core unit tests

`packages/core` uses Vitest. The test suite currently covers:

- backup building and validation, including cross-platform reading-key normalization and quest-ledger preservation;
- golden vectors for stars, XP, gem drip, streak advancement, SRS review and graduation, daily rewards, quests, league, exam XP, and chest slots;
- jump-ahead sampling and its constants;
- league tier ordering, week keys, bot determinism, and promotion/demotion;
- daily quest determinism and structure;
- reading id normalization and parsing;
- week/date-key behavior across month, year, and weekday boundaries.

These tests are pure and fast. They run in CI before type-checking, so a protocol regression fails early.

### Golden vectors

`packages/core/spec/golden-vectors.json` is the cross-platform conformance file. The TypeScript test reads it directly and asserts every group. The iOS test suite is expected to consume the same file. This is the mechanism that keeps the web and iOS implementations from silently drifting on economy values, league bots, quests, SRS transitions, reading ids, or backup semantics.

A change to any covered value is a contract change. The contribution guide requires updating the JSON and both implementations in the same change.

### Type-checking and lint

The root `type-check` script runs each workspace's type-check if present. This covers core, web, and server TypeScript. Web lint runs through Next.js ESLint. These gates catch interface mismatches that unit tests do not, especially between the data builder, page props, and shared types.

### Data-build smoke test

CI runs `npm run build:data` from a clean checkout. This is a real pipeline execution: it parses `output/`, generates `public/data`, and catches malformed content, broken filename parsing, missing quiz files, and build-time exceptions. It does not require an AI key or a browser.

Immediately after, CI runs `npm run validate:quizzes`, which enforces the quiz contract across all generated question files.

### Quiz validation

The validator checks the rules most likely to break learner trust:

- choice answers must be exactly one of the options;
- choice options must not repeat;
- true/false answers must be `对` or `错`;
- questions must have text, explanations, and non-empty fill-in answers.

It exits non-zero on any problem and prints the first forty. This is the main automated defense against content-generation regressions.

### Secret scanning and dependency audit

CI greps for common API-key patterns and private-key blocks and fails on a match. It also runs `npm audit --audit-level=high`, but that job is marked `continue-on-error`, so audit findings are advisory rather than blocking. Dependabot independently opens weekly update PRs for npm, GitHub Actions, and the Docker base image.

### Coverage and data-quality reports

`npm run coverage` reads the built index and prints a stage × grade × subject matrix plus a detailed book listing. It is a manual operational tool, not a CI gate.

`apps/web/scripts/check-data-quality.mjs` performs a deeper audit of Chinese, English, and science books: it checks outline/lesson file consistency, lesson counts, book-id mismatches, empty question sets, missing knowledge cards, invalid choice answers, bad true/false values, and question-type distribution. It writes a JSON report. It is not wired into the root CI workflow, so it is a diagnostic tool rather than a gate.

## Continuous integration workflow

`.github/workflows/ci.yml` runs on pushes and pull requests to `main` with Node 22. Its jobs are:

1. **quality** — install with `--ignore-scripts`, run core tests, run all-workspace type-check, run web lint.
2. **data-build** — install, build data, validate quizzes.
3. **audit** — install and run npm audit; non-blocking.
4. **secret-scan** — grep the repository for key-like strings; blocking.

The separation matters: quality and data-build are the gates that should block a merge. Audit is a signal. Secret scanning is a hard stop because a leaked key is not a style issue.

## Release workflow

`.github/workflows/build-installers.yml` is separate from CI and runs on `v*` tags or manual dispatch. It first builds the shared web artifact, then fans out to platform jobs:

- Windows NSIS/MSI with Rust and a bundled Node executable;
- Linux AppImage/deb;
- Android APK/AAB with optional signing secrets;
- iOS unsigned IPA on macOS;
- Docker image tar with a `/api/health` smoke test.

This workflow is intentionally heavier and environment-dependent. It is where cross-platform packaging failures surface, not where day-to-day code quality is enforced.

## What is not covered

The repository does not currently include:

- web component or interaction tests;
- browser end-to-end tests;
- automated iOS tests in this repository (the golden-vector contract is documented, but the Swift suite lives with the iOS client);
- provider integration tests against live LLM, TTS, or image APIs;
- automated validation of every catalog entry or generated story beyond the structural checks above.

Those gaps are mitigated by deterministic core logic, offline fallbacks, and manual smoke testing of built artifacts, but they remain the areas where regressions are most likely to reach users.

## Practical commands

```bash
npm run test --workspace=@cstf/core   # unit tests and golden vectors
npm run type-check                    # all workspaces
npm run lint --workspace=china-study-free
npm run build:data                    # data pipeline smoke test
npm run validate:quizzes              # quiz contract
npm run coverage                      # coverage matrix
```

## Related pages

- [Build and Distribution](../architecture/build-and-distribution.md)
- [Course Generation Pipelines](../content/course-generation-pipelines.md)
- [Review and Cross-Platform State](../core/review-and-cross-platform-state.md)
- [Security and Privacy](./security-and-privacy.md)
