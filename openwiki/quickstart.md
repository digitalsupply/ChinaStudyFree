---
type: "Reference"
title: "Quickstart"
openwiki_generated: true
verified:
  - by: openwiki/0.7.2
    at: 2026-11-04T02:58:40.844Z
sources:
  - id: openwiki-source-f67bec33dfc9a4a4a2f32dea
    resource: repo://apps/server/.env.example
  - id: openwiki-source-99de51df25f29bfc72caf823
    resource: repo://apps/web/package.json
  - id: openwiki-source-f41577d2ec35d3f44a570c38
    resource: repo://apps/web/scripts/build-data.ts
  - id: openwiki-source-f317ee207e1653d2033c81a4
    resource: repo://CONTRIBUTING.md
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-2f32aa5b3a2f9761fb51ba65
    resource: repo://packages/core/spec/golden-vectors.json
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-9c461da45ae6e1d3d2cab331
    resource: repo://scripts/gen-coverage-content.mjs
  - id: openwiki-source-9a2078ee97acebfab554d221
    resource: repo://scripts/validate-quizzes.mjs
  - id: openwiki-source-3a44815832a872f4778f822b
    resource: repo://SECURITY.md
generated: { by: "opencode", at: "2026-11-04T02:58:40.844Z" }
---


# Quickstart

ChinaStudyFree (聪聪学堂) is a free, ad-free K-12 learning platform assembled as a monorepo. It covers primary, middle, high school, and college content, with twelve subjects, multiple textbook publishers, interactive lessons, reading and stories, a local gamification system, and optional AI generation and speech synthesis.

The distinguishing architectural choice is that one Next.js static export serves every target: web, Tauri desktop, Capacitor Android/iOS, Docker, and offline LAN bundles. The AI backend is optional; the learning content and progress system work without it.

## Repository map

| Path | Responsibility |
| --- | --- |
| `apps/web` | Next.js 15 static-export frontend: routes, components, Zustand progress store, audio |
| `apps/server` | Express AI backend and optional static host (`/api/ai/*`, `/api/health`) |
| `apps/desktop` | Tauri v2 shell with tray, bundled static site, and local AI sidecar |
| `apps/mobile` | Capacitor 6 shell reusing `apps/web/out` |
| `packages/core` | Pure TypeScript domain and deterministic algorithms shared with iOS |
| `scripts` | Course generators, textbook catalog sync, validation, TTS, packaging |
| `output` | Authored outlines and quizzes per subject |
| `data` | Optional passages and stories (often gitignored/large) |
| `docker` | Multi-stage image and compose file |

The core package is the contract layer: grading, economy, SRS, stage/grade, publishers, quests, league, reading ids, backup, and jump sampling. The web app consumes it; the iOS client is expected to mirror it against the same golden vectors.

## Prerequisites

- Node.js 22 and npm 9+ (matching CI).
- No database, account system, or mandatory external service.
- Optional: provider keys for real AI generation and paid TTS; a Docker daemon for images; Rust for desktop builds; macOS/Xcode for iOS archives.

## Shortest local run

```bash
npm install
npm run build:data      # output/ -> apps/web/public/data
npm run dev:web         # http://localhost:3000
```

The frontend can run without the AI server. To enable live AI features:

```bash
cp .env.example apps/server/.env
# fill LLM_API_KEY / DASHSCOPE_API_KEY / GEMINI_API_KEY as desired
npm run dev:server      # http://localhost:8787
```

The web client uses same-origin `/api` when `NEXT_PUBLIC_AI_BASE` is empty; the desktop shell forces `http://localhost:8787`; mobile builds bake in a remote base or run offline.

## Useful commands

```bash
npm run gen:content          # regenerate deterministic course content
npm run build:data           # rebuild frontend data
npm run validate:quizzes     # enforce question/answer invariants
npm run coverage             # print the textbook coverage matrix
npm run build:web            # static export -> apps/web/out
npm run build:server         # single-file AI server -> apps/server/dist/index.js
npm run test --workspace=@cstf/core
npm run type-check
npm run package:offline      # offline-bundle/ with start scripts
```

`npm run build:web` and `build:server` are the prerequisites for desktop, mobile, Docker, and offline packaging. `gen:content` and `data/` assets are prerequisites for a meaningful course build; without them the site shell builds but courses are empty.

## What to read next

- **New to the architecture?** Start with [System Overview](./architecture/system-overview.md).
- **Trying to run or package it?** Read [Build and Distribution](./architecture/build-and-distribution.md).
- **Working on course data?** Read [Data and Content Pipeline](./architecture/data-and-content-pipeline.md) and [Course Generation Pipelines](./content/course-generation-pipelines.md).
- **Working on the learner UI?** Read [Routing and App Shell](./web/routing-and-app-shell.md), [Learning Path and Book Map](./web/learning-path.md), and [Lesson Runner](./web/lesson-runner.md).
- **Working on progression, rewards, or saves?** Read [Progress Store and Persistence](./web/progress-and-persistence.md), [Gamification and Economy](./web/gamification-and-economy.md), and [Review and Cross-Platform State](./core/review-and-cross-platform-state.md).
- **Working on AI or voice?** Read [AI Backend](./server/ai-backend.md) and [Voice Synthesis](./server/voice-synthesis.md).
- **Working on the native wrappers?** Read [Desktop and Mobile Shells](./native/desktop-and-mobile-shells.md).
- **Preparing a release?** Read [Testing and CI](./operations/testing-and-ci.md) and [Security and Privacy](./operations/security-and-privacy.md).

## Invariants to know before changing code

- **Book and lesson ids are storage keys.** Renaming them loses progress. Default editions intentionally keep the short legacy ids.
- **Core algorithms are cross-platform protocol.** Economy, league, quests, SRS, reading ids, and backup changes require golden-vector updates and iOS parity.
- **Navigation is hard on purpose.** Static export plus native webviews makes client-side routing unreliable.
- **Content generation must not delete `output/`.** Generators are incremental and overwrite-oriented.
- **The quiz contract is enforced.** Choice answers must be present in unique options; true/false must be 对/错; explanations are required.
- **Release signing uses a demo Android key unless secrets are provided.** Do not publish store builds with it.
- **The product is local-first.** There is no account, cloud progress, analytics, or cross-device sync in this version.

## Related pages

- [System Overview](./architecture/system-overview.md)
- [Build and Distribution](./architecture/build-and-distribution.md)
- [Lesson Runner](./web/lesson-runner.md)
