---
type: architecture
title: System Overview
description: The four-target ChinaStudyFree architecture, where the shared Next.js export, pure TypeScript core, and Express AI backend sit at runtime, and how data and trust flow between them.
tags: [architecture, monorepo, static-export, ai, offline]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-04T02:58:40.844Z
sources:
  - id: openwiki-source-39fac23b897833c4b547e4b2
    resource: repo://apps/desktop/src-tauri/src/main.rs
  - id: openwiki-source-249a5086d403ed1490a7a8ec
    resource: repo://apps/mobile/capacitor.config.ts
  - id: openwiki-source-3191419c76ea18831b50ac9e
    resource: repo://apps/server/src/index.ts
  - id: openwiki-source-9155198a57dd2721f248c9a5
    resource: repo://apps/web/next.config.mjs
  - id: openwiki-source-8aed709c402f556b080cd647
    resource: repo://apps/web/src/lib/ai.ts
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-b6d4dbadc290acfd0ace4931
    resource: repo://packages/core/package.json
  - id: openwiki-source-d265cc7c06dcbefb6f92a01b
    resource: repo://packages/core/src/index.ts
  - id: openwiki-source-3a44815832a872f4778f822b
    resource: repo://SECURITY.md
generated: { by: "opencode", at: "2026-11-04T02:58:40.844Z" }
---

# System Overview

ChinaStudyFree is a monorepo for a K-12 learning platform delivered as a static web app, a Tauri desktop application, Capacitor mobile apps, and a Docker-hosted service. The central architectural decision is to keep one frontend source of truth and one shared domain core, then wrap the same static export with different shells. The AI backend is optional infrastructure, not a dependency for studying.

## Workspace responsibilities

The root is an npm workspace over `apps/*` and `packages/*`.

- `apps/web` is the Next.js 15 frontend. It exports static HTML/JS and contains all learner-facing pages, components, and the Zustand progress store.
- `apps/server` is an Express service that serves `/api/ai/*` and can also host the exported site.
- `apps/desktop` is a Tauri v2 shell that embeds the static export, runs a system tray, and launches the AI server as a local sidecar.
- `apps/mobile` is a Capacitor 6 shell that packages the same export for Android and iOS.
- `packages/core` is platform-agnostic TypeScript with no DOM, Next.js, or React Native dependencies. It holds the deterministic domain logic shared with the iOS implementation.
- `scripts` and `output` produce and transform course content.

The root scripts delegate to these workspaces rather than duplicating build logic.

## One frontend, four delivery contexts

The web app is configured with `output: "export"`, `trailingSlash: true`, unoptimized images, and `transpilePackages: ["@cstf/core"]`. The build emits a fully static `apps/web/out/` tree.

Each delivery context reuses that tree:

- **Web** serves `out/` directly.
- **Desktop** bundles `out/` as a Tauri resource and displays it in the platform webview; the AI sidecar runs on `127.0.0.1:8787`.
- **Mobile** points Capacitor's `webDir` at `../web/out` and uses the `https` scheme to avoid mixed-content blocking.
- **Docker** copies `out/` into the runtime image and lets the Express server host it alongside the APIs.

This avoids four divergent UIs, but it also means static-export constraints apply everywhere. In particular, the app prefers hard navigation (`window.location.assign` or plain anchors) over client-side router transitions, because soft navigation has been unreliable inside native webviews.

## Runtime topology

A typical deployment has three layers:

1. **Static learner UI** — pages, lesson JSON, audio, textbook page images, and stories. These are cacheable and work offline once present.
2. **Local progress** — XP, streaks, hearts, gems, completed lessons, mistakes, reading history, cosmetics, and settings in browser or webview storage. No account service exists.
3. **Optional AI service** — Express endpoints for quiz generation, explanation, story generation with optional illustration, and speech synthesis. It also provides `/api/health` and can serve the static export.

The frontend chooses its AI base at build/runtime:

- Inside Tauri, `window.__TAURI_INTERNALS__` is detected and the base is forced to `http://localhost:8787`.
- Elsewhere, `NEXT_PUBLIC_AI_BASE` is used; an empty value means same-origin `/api`.
- If no backend is configured, AI-dependent UI degrades to pre-generated content.

The server's static-directory resolver anchors on the compiled file location (`../../web/out`), then falls back to environment and working-directory candidates. That single choice is what makes the same `dist/index.js` work in development, portable desktop bundles, installed Windows layouts, and Docker.

## Shared core and cross-platform contracts

`packages/core` exports types, grading, SRS, stage/grade derivation, subjects, publishers, cosmetics, chest logic, economy, achievements, quests, RNG, week helpers, league, reading ids, backup, and jump sampling. The package is intentionally pure so it can be mirrored by an iOS implementation.

The cross-platform contract is enforced by `packages/core/spec/golden-vectors.json`: economy, league, quests, SRS, reading, and backup behaviors have expected outputs that both TypeScript and Swift tests must satisfy. Values such as streak advancement, gem drip, XP multipliers, league bot curves, and SRS graduation are not UI preferences; they are protocol.

## Data flow

Authoring data lives in `output/{subject}` and optional `data/` directories. `build-data` converts outlines, quizzes, passages, stories, page mappings, and audio presence into `apps/web/public/data`. The web build then pre-renders routes from that data and copies it into the static export.

At runtime, pages read the pre-built index and book files from `/data/...`. There is no database and no server-side rendering in production. Course content is immutable per build; learner state is local and mutable.

## Trust and privacy boundaries

The system is designed as local-first:

- Progress never leaves the device unless the user explicitly exports a backup file.
- There are no accounts, no analytics SDKs, and no PII collection.
- AI calls are user-triggered and require server-side provider keys.
- Keys live in server environment variables, never in the static bundle.
- The server adds conservative security headers, CORS controls, JSON body limits, and structured logs.

The main external trust dependencies are optional LLM, DashScope TTS, Gemini image, and Microsoft Edge TTS providers. When those are unavailable, the product remains usable with pre-generated content, though voice and generated exercises may be missing.

## Design consequences

The architecture favors offline resilience and low operating cost over real-time multi-device features. Two consequences follow:

- Content generation and packaging are first-class engineering concerns; a build is only as good as the generated data pipeline.
- Cross-platform behavior depends on shared deterministic functions, not server state. Any change to those functions must be treated as a protocol change.

## Related pages

- [Build and Distribution](./build-and-distribution.md)
- [Data and Content Pipeline](./data-and-content-pipeline.md)
- [Routing and App Shell](../web/routing-and-app-shell.md)
- [AI Backend](../server/ai-backend.md)
- [Desktop and Mobile Shells](../native/desktop-and-mobile-shells.md)
