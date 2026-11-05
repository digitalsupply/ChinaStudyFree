---
type: native-shell
title: Desktop and Mobile Shells
description: How Tauri and Capacitor wrap the shared static export, including desktop sidecar startup, tray lifecycle, port reuse, logging, mobile schemes, and asset-path fixes.
tags: [tauri, capacitor, desktop, mobile, native]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-04T02:58:40.844Z
sources:
  - id: openwiki-source-39fac23b897833c4b547e4b2
    resource: repo://apps/desktop/src-tauri/src/main.rs
  - id: openwiki-source-3e0e1ba775b9af1fee44edec
    resource: repo://apps/desktop/src-tauri/tauri.conf.json
  - id: openwiki-source-249a5086d403ed1490a7a8ec
    resource: repo://apps/mobile/capacitor.config.ts
  - id: openwiki-source-99de51df25f29bfc72caf823
    resource: repo://apps/web/package.json
  - id: openwiki-source-38e557a247066865defd30a6
    resource: repo://apps/web/scripts/fix-android-asset-paths.cjs
generated: { by: "opencode", at: "2026-11-04T02:58:40.844Z" }
---

# Desktop and Mobile Shells

The native wrappers are thin by design. Neither contains a separate UI implementation. Both consume `apps/web/out` and add only what a platform needs: a window and process lifecycle on desktop, and a WebView container on mobile.

## Shared assumptions

The shared frontend is a static export with `trailingSlash: true`. Inside native webviews, client-side router transitions have proven unreliable, so the app prefers hard navigation. The wrappers also inherit the same offline-first behavior: pre-generated content works without a server, and AI features are optional.

The desktop wrapper has one capability the mobile wrapper does not: it can launch the AI server locally. Mobile either points at a self-hosted AI base at build time or runs with offline content only.

## Tauri desktop shell

### Bundled resources

The Tauri configuration sets `frontendDist` to `../../web/out` and bundles:

- the web export into `web/out`;
- the server bundle into `server/dist`;
- the server `package.json`;
- the server `.env.example`;
- a `bin/` directory containing a Node runtime.

The executable therefore contains the UI, while the sidecar files supply the local service.

### Startup order

The Rust `setup` function is deliberately ordered:

1. Resolve the resource directory and strip Windows verbatim prefixes that Node misinterprets.
2. Resolve the log path and store it globally.
3. Create the system tray before anything slow, so closing the window immediately still leaves a usable tray icon.
4. Spawn a background thread to launch the AI server and wait for readiness.

Starting the server synchronously would block the main message loop for up to twenty seconds, making the window appear unresponsive before the tray exists. The background thread avoids that.

### Sidecar launch and port reuse

Before spawning, the shell probes `127.0.0.1:8787` with a raw HTTP request to `/api/health` and accepts only a response containing `"ok":true`. If a healthy server already exists, it reuses it and does not hold a child handle. This handles the common case where a previous crash or force-kill left an orphan Node process holding the port.

If no server is running, the shell prefers the bundled `bin/node` (or `node.exe`), falls back to the system `node`, and launches `server/dist/index.js` with:

- `PORT=8787`
- `HOST=127.0.0.1`
- `STATIC_DIR=<resources>/web/out`
- `CORS_ORIGIN=*`

On Windows, every child process is started with `CREATE_NO_WINDOW` so no console window flashes. If the server bundle is missing or launch fails, it logs and continues; the frontend degrades to offline content.

### Tray and window lifecycle

The tray icon supports:

- left click or double click to show and focus the main window;
- a menu to show the window, open the local server in a browser, open the runtime log, or quit.

Clicking the window close button is intercepted: unless a quit is already in progress, the window is hidden rather than destroyed, and the process keeps running in the tray. Choosing quit sets a quitting flag, kills the child if one is owned, and exits. Any exit path, including `ExitRequested` and `Exit`, also reaps the child process.

### Logging

The log is written to a user-level directory (`LOCALAPPDATA` on Windows, `~/Library/Logs` on macOS, XDG state on Linux) with a fallback to the resource directory. This solves two problems: a normal user may not be able to write into an installation under `Program Files`, and a log file left in the install directory can prevent the installer from removing the folder on uninstall. Both the Rust diagnostics and the Node sidecar's stdout/stderr go to the same file, which the tray menu opens.

## Capacitor mobile shell

### Configuration

Capacitor uses the shared `../web/out` directory, the app id `com.chinastudyfree.app`, and the `https` scheme on both Android and iOS. The https scheme avoids mixed-content restrictions when the WebView loads remote AI endpoints.

The AI base is a build-time concern: set `NEXT_PUBLIC_AI_BASE` to a self-hosted service URL before `npm run build:web`, then run `cap sync`. Leaving it empty produces an offline-only app.

### Asset-path repair

The web build runs `fix-android-asset-paths.cjs` after `next build`. This addresses a specific WebView failure:

- Next emits dynamic-route chunks in directories containing brackets, such as `app/grade/[grade]/page-*.js`.
- HTML references those paths percent-encoded (`%5Bgrade%5D`).
- Android/iOS WebView asset loaders may not decode those sequences when resolving files, producing a chunk 404 and a blank page on dynamic routes.

The script renames bracket directories to their bare segment names and rewrites both encoded and decoded references in text assets. The fix is applied to the shared export, so web, desktop, iOS, and Android all agree on the final paths. It only touches text-like extensions, not images, fonts, or audio.

### Release builds

Mobile release builds are produced by the installers workflow: sync the web export, then use Gradle for APK/AAB or Xcode for an unsigned IPA. The Android job can use repository secrets to replace the demo signing key. The app itself has no native business logic beyond the container and any platform configuration.

## What differs from the web build

| Concern | Web/Docker | Desktop | Mobile |
| --- | --- | --- | --- |
| Static export | served directly | embedded resource | Capacitor webDir |
| AI base | same origin or configured | forced to localhost:8787 | build-time remote URL or none |
| AI server process | external | managed sidecar | not included |
| Lifecycle | browser tab | tray + hide-to-tray | OS app lifecycle |
| Offline assets | cached or bundled | bundled in installer | bundled in app |

The important invariant is that all four contexts consume the same `out/` tree, so a fix to routing, asset paths, or static data benefits every target.

## Related pages

- [Build and Distribution](../architecture/build-and-distribution.md)
- [AI Backend](../server/ai-backend.md)
- [Routing and App Shell](../web/routing-and-app-shell.md)
