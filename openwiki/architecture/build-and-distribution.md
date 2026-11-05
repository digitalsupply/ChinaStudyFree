---
type: architecture
title: Build and Distribution
description: Build order and packaging for the shared Next.js export, bundled Express AI server, Tauri desktop installers, Capacitor apps, offline bundles, Docker images, and GitHub Actions release artifacts.
tags: [build, release, docker, tauri, capacitor, ci]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-04T02:58:40.844Z
sources:
  - id: openwiki-source-1314ccc5cd8f57a789261ebc
    resource: repo://.github/workflows/build-installers.yml
  - id: openwiki-source-164e2da859b5277df81c7d94
    resource: repo://.github/workflows/ci.yml
  - id: openwiki-source-3e0e1ba775b9af1fee44edec
    resource: repo://apps/desktop/src-tauri/tauri.conf.json
  - id: openwiki-source-3f7ba76b703b086cdfb9b663
    resource: repo://apps/server/build.mjs
  - id: openwiki-source-9155198a57dd2721f248c9a5
    resource: repo://apps/web/next.config.mjs
  - id: openwiki-source-99de51df25f29bfc72caf823
    resource: repo://apps/web/package.json
  - id: openwiki-source-5be27729131e30130689f927
    resource: repo://docker/docker-compose.yml
  - id: openwiki-source-7f1ca00753e95588bc8efa39
    resource: repo://docker/Dockerfile
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-5c850fc379a79f682ccb1daa
    resource: repo://scripts/package-desktop.sh
  - id: openwiki-source-01e84ce0bd0db6056173526d
    resource: repo://scripts/package-offline.sh
generated: { by: "opencode", at: "2026-11-04T02:58:40.844Z" }
---

# Build and Distribution

ChinaStudyFree ships one learning frontend through several distribution channels. The build pipeline is deliberately ordered so every channel consumes the same generated data and the same static web export. This page explains that order, what each artifact contains, and which steps depend on external toolchains or secrets.

## Build dependency order

The root `package.json` is the orchestration point. Its scripts fan out into npm workspaces:

- `build:data` runs the `china-study-free` workspace's data build.
- `build:web` runs the web workspace's Next.js build.
- `build:server` runs the `china-study-free-server` workspace's esbuild bundle.
- `gen:content` composes the three deterministic course generators before a data build.
- `sync:textbooks` refreshes the external textbook catalog.
- `package:offline`, `package:desktop`, `sync:android`, `sync:ios`, and icon scripts cover packaging helpers.

The practical order is:

1. Generate or obtain course content in `output/`.
2. Optionally refresh the ChinaTextbook catalog.
3. Run `build:data` (`output/` → `apps/web/public/data`).
4. Optionally generate pre-rendered TTS audio.
5. Run `build:web` (Next.js static export → `apps/web/out`).
6. Run `build:server` (single-file Express bundle → `apps/server/dist/index.js`).
7. Wrap or copy the results for Tauri, Capacitor, offline, or Docker.

The data build is a prerequisite, not an optional detail: pages read `public/data/index.json`, book outlines, lesson JSON, passages, stories, and the textbook catalog at build time or runtime. A web build without `build:data` produces a structurally complete site with no courses.

## Web export

The web workspace script chain is `build:data` → `next build` → `fix-android-asset-paths.cjs`. Next is configured with `output: "export"`, unoptimized images, trailing slashes, and `@cstf/core` transpilation. The result is a purely static `apps/web/out/` tree that can be served by any static host or embedded in a native shell.

The Android post-processing step rewrites asset paths that would otherwise break inside the Capacitor WebView. That same exported tree is reused by Tauri, Capacitor, Docker, and the offline bundle, so changes to path assumptions have cross-platform consequences.

## AI server bundle

`apps/server` is a small Express service. Its production build is not a plain `tsc` output; `build.mjs` invokes esbuild to produce a single ESM file at `dist/index.js` with `express` and `dotenv` inlined. Optional native `ws` accelerators (`bufferutil`, `utf-8-validate`) are marked external because they are optional. A `createRequire` banner supplies a CommonJS `require` for the inlined CJS dependencies.

This design is what makes desktop and offline deployments self-contained: the wrappers can ship one JavaScript file and a Node runtime without a `node_modules` tree. `docker/Dockerfile` relies on the same property.

## Docker image

The Dockerfile is multi-stage:

- The build stage installs all workspace dependencies with `--ignore-scripts`, runs `build:data` and `sync:textbooks` with failure tolerance, then `build:web` and `build:server`.
- The runtime stage starts from `node:20-slim`, copies only `server/dist`, `web/out`, and the generated `public/data`, and runs `node apps/server/dist/index.js`.
- Runtime defaults are `PORT=8787`, `STATIC_DIR=/app/apps/web/out`, and `HOST=0.0.0.0`.
- A container health check calls `/api/health`.

`docker-compose.yml` exposes port 8787 and passes optional LLM, DashScope, Gemini, voice/model, CORS, and static-directory settings through environment variables. The compose file therefore documents the supported runtime configuration surface as much as it starts the container.

Because `output/` content may be large or absent, the Docker comments explicitly warn that an image built without it has a complete shell but empty courses. The same applies to large audio or textbook-page assets unless they are present before the web build.

## Tauri desktop packaging

The Tauri configuration declares `frontendDist` as `../../web/out` and bundles several resources into the application:

- `../../web/out/` → `web/out/`
- `../../server/dist/` → `server/dist/`
- the server `package.json`
- the server `.env.example`
- `bin/` (the bundled Node runtime)

The bundle targets NSIS and MSI on Windows, with Chinese and English installer languages. `scripts/package-desktop.sh` assembles a portable Windows-style directory from the compiled executable, a Node binary, the server bundle, the `.env` template, and the web export, then writes launch scripts and a Chinese readme.

The desktop artifact is therefore a layered product: the Rust executable embeds the frontend, while the sidecar files let it run the AI service locally. The shell page covers the runtime lifecycle.

## Capacitor mobile packaging

Capacitor points `webDir` at the shared `../web/out` and uses the `https` scheme on Android and iOS to avoid mixed-content restrictions. Mobile builds are thin: build the web export with the desired `NEXT_PUBLIC_AI_BASE`, run `cap sync`, then build with Gradle or Xcode. No separate mobile UI code exists.

## Offline bundle

`scripts/package-offline.sh` composes `apps/web/out` plus `apps/server/dist` into `offline-bundle/`, adds `server/package.json` so Node treats the server as ESM, and writes `start.sh`, `start.ps1`, and a Chinese readme. The startup scripts set `PORT` and `STATIC_DIR` and execute the server. This is the LAN or campus deployment path: one machine serves both the static site and the optional AI endpoints.

## Continuous integration and release workflows

`.github/workflows/ci.yml` is the continuous quality gate on pushes and pull requests to `main`. It runs four jobs:

- `quality`: core Vitest tests, all-workspace type-check, and web lint.
- `data-build`: `build:data` plus quiz validation.
- `audit`: `npm audit --audit-level=high`, non-blocking.
- `secret-scan`: greps for obvious API keys and private-key blocks and fails on a match.

`.github/workflows/build-installers.yml` is the heavy release workflow. It runs on `v*` tags or manual dispatch. A shared `web` job builds data, optionally syncs textbooks, and builds the static export, then uploads `web-out`. Downstream jobs consume that artifact:

- Windows desktop installers on `windows-latest` with Rust and a bundled `node.exe`.
- Linux AppImage/deb on Ubuntu with WebKitGTK and AppIndicator dependencies.
- Android APK/AAB on Ubuntu with Java 21 and the Android SDK; optional repository secrets replace the demo signing key.
- iOS unsigned IPA on macOS with Xcode and CocoaPods.
- A Docker image tar plus a health-check smoke test.

The Android job explicitly documents that without `ANDROID_KEYSTORE_BASE64`, `ANDROID_STORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`, Gradle falls back to the repository's demo keystore. That is convenient for test builds and unsuitable for store distribution.

## What requires external tooling or secrets

Local web, data, and server builds need only Node and npm. The following are environment-dependent:

- Tauri installers need Rust plus platform webview toolchains; Windows installers are normally produced on Windows.
- iOS archives need macOS and Xcode; Linux desktop bundles need Linux packaging libraries.
- Docker builds need a Docker daemon.
- Real AI generation needs provider keys; without them the service starts and returns not-configured responses while offline content still works.
- Android release signing needs a real keystore for store distribution; the repository ships a demo key.

The release workflow is designed to absorb these differences by running each target on its native runner and publishing artifacts rather than trying to cross-build everything locally.

## Related pages

- [System Overview](./system-overview.md)
- [Data and Content Pipeline](./data-and-content-pipeline.md)
- [Desktop and Mobile Shells](../native/desktop-and-mobile-shells.md)
- [Testing and CI](../operations/testing-and-ci.md)
