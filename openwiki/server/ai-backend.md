---
type: server
title: AI Backend
description: The Express service that hosts the static export and exposes optional AI endpoints for quiz generation, explanation, stories, illustrations, and speech synthesis.
tags: [server, express, llm, api, static-hosting]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-04T02:58:40.844Z
sources:
  - id: openwiki-source-f67bec33dfc9a4a4a2f32dea
    resource: repo://apps/server/.env.example
  - id: openwiki-source-3191419c76ea18831b50ac9e
    resource: repo://apps/server/src/index.ts
  - id: openwiki-source-0b9b411b223f9779656e7083
    resource: repo://apps/server/src/llm.ts
  - id: openwiki-source-8aed709c402f556b080cd647
    resource: repo://apps/web/src/lib/ai.ts
generated: { by: "opencode", at: "2026-11-04T02:58:40.844Z" }
---

# AI Backend

`apps/server` is a small Express service with two jobs: serve the exported web app, and provide optional AI endpoints. It is shared by Docker, desktop, offline deploys, and self-hosted mobile backends. It is not required for offline study; without provider keys it still serves the site and returns explicit not-configured errors for AI calls.

## Configuration

Environment variables are read from `.env` via dotenv and from the process environment:

- `HOST` defaults to `0.0.0.0`, `PORT` to `8787`.
- `CORS_ORIGIN` defaults to `*`.
- `LLM_BASE_URL` defaults to `https://api.openai.com/v1`, `LLM_API_KEY` is required for generation, `LLM_MODEL` defaults to `gpt-4o-mini`.
- `DASHSCOPE_API_KEY` enables paid TTS; `TTS_VOICE` and `TTS_MODEL` select the voice and model.
- `EDGE_TTS_ENABLED` defaults to enabled and controls the free fallback.
- `GEMINI_API_KEY` enables story illustrations.
- `STATIC_DIR` overrides static-site discovery.

The example environment file documents these knobs and warns that wildcard CORS is for local or internal use.

## Endpoints

### `GET /api/health`

Returns service metadata and capability booleans:

```json
{
  "ok": true,
  "version": "0.1.0",
  "llm": true,
  "tts": true,
  "ttsBackend": "dashscope",
  "image": false
}
```

`ttsBackend` is `dashscope` when a DashScope key exists, `edge` when Edge TTS is enabled, and `none` otherwise. This is the first field to check when audio silently fails. The endpoint does not expose keys or provider URLs.

### `POST /api/ai/quiz`

Accepts `subject`, `grade`, `topic`, `count`, and `difficulty`. Count is clamped to 1–15. The system prompt asks for age-appropriate Chinese single-choice questions in a JSON object with a `questions` array; each question should have prompt, four options, a zero-based answer index, an explanation, and a knowledge point.

The endpoint parses the model output, validates that `questions` is an array, and returns `{ ok: true, questions }`.

Failure modes:

- `501 LLM_NOT_CONFIGURED` when `LLM_API_KEY` is missing.
- `500` with the provider or parse error message for other failures.

### `POST /api/ai/explain`

Accepts `question`, optional `options`, and optional `answer`. Missing `question` returns 400. The prompt asks for a short, child-friendly Chinese explanation and returns `{ ok: true, explanation }`. The same not-configured and provider-error behavior applies.

### `POST /api/ai/story`

Accepts `subject`, `grade`, `theme`, and `sentences` (clamped to 4–20). It requests a JSON story with title, sentence array, and 2–3 comprehension questions. After parsing the story, it attempts a Gemini illustration.

Illustration is best-effort: if Gemini is unconfigured or fails, the story still returns, with `image` absent. If successful, the response includes a data URL and MIME type. This keeps text generation usable without an image key.

### `POST /api/ai/tts`

Accepts `text` and optional `voice`. Missing or blank text returns 400. The response is raw audio with a content type and a one-year immutable cache header. Synthesis order and fallbacks are covered in [Voice Synthesis](./voice-synthesis.md).

- `501 TTS_NOT_CONFIGURED` when neither DashScope nor Edge TTS is available.
- `500` if a configured provider fails.

## Provider adapters

`llm.ts` implements a minimal OpenAI-compatible chat completions client. It sends system/user messages, optional JSON response format, optional max tokens, and a bearer key. It parses `choices[0].message.content` and throws on non-2xx responses or empty content. `parseJSON` strips a leading JSON code fence and trailing fence before parsing, tolerating a common model formatting habit.

`image.ts` calls Gemini's `generateContent` with a text prompt and `responseModalities: ["IMAGE", "TEXT"]`, then scans candidate parts for inline image data. It throws a typed not-configured error when the key is missing and a normal error when no image is returned.

There is no retry policy, streaming, tool calling, or response validation beyond shape checks. The service assumes a reasonably capable OpenAI-compatible endpoint.

## Static hosting

If the resolved static directory exists, the server mounts `express.static` with HTML extension fallback and registers a catch-all GET route for non-API paths. The fallback serves `index.html`, enabling deep links in a static export. If the directory is missing, the server logs a warning and runs API-only.

Static directory resolution is anchored to the compiled file:

1. `STATIC_DIR` environment variable, if set.
2. `../../web/out` relative to `dist/index.js`.
3. `cwd/web/out`, `cwd/../web/out`, and `cwd/apps/web/out` as fallbacks.

The file-relative candidate is the primary anchor because it is correct in development, portable desktop layouts, installed layouts, and Docker. Working-directory paths are only fallbacks; earlier versions that relied on `cwd/../web/out` broke when the process was started from the wrong directory.

## Middleware and failure behavior

The middleware order is:

1. `express.json({ limit: "2mb" })`.
2. CORS headers and OPTIONS short-circuit.
3. Security headers and CSP.
4. Routes.
5. Static hosting and SPA fallback.
6. A terminal error handler returning a generic 500.

The service adds conservative headers (nosniff, same-origin framing, referrer policy, permissions policy, COOP) and a permissive CSP suited to the static SPA. It logs structured single-line JSON with timestamp, level, message, and optional metadata. Unhandled promise rejections and uncaught exceptions are logged but do not terminate the process, because the desktop tray expects a long-lived local service. That choice favors availability over fail-fast behavior; a crash loop would be visible only in logs.

## Single-file build

`build.mjs` bundles the TypeScript entry with esbuild into `dist/index.js`. Express and dotenv are inlined, optional native `ws` accelerators are externalized, and a `createRequire` banner makes inlined CommonJS dependencies work in the ESM output. The result runs without `node_modules`, which is what makes the desktop sidecar and Docker runtime small.

## Frontend contract

`apps/web/src/lib/ai.ts` centralizes the client side. It chooses `http://localhost:8787` inside Tauri and `NEXT_PUBLIC_AI_BASE` elsewhere. It checks HTTP status before parsing JSON so proxy or fallback HTML responses produce a useful error rather than a syntax error. It preserves the server's error code, allowing callers to distinguish "not configured" from a transient failure and degrade accordingly.

## Operational limitations

The service has no authentication, authorization, rate limiting, or per-user quota. It is designed for local, classroom, or trusted self-hosted deployments. Exposing it directly to the public internet requires a reverse proxy or gateway that adds those controls. Wildcard CORS, permissive CSP, and open generation endpoints are all deliberate conveniences for those environments, not production-hardening defaults.

## Related pages

- [Voice Synthesis](./voice-synthesis.md)
- [Build and Distribution](../architecture/build-and-distribution.md)
- [Security and Privacy](../operations/security-and-privacy.md)
- [System Overview](../architecture/system-overview.md)
