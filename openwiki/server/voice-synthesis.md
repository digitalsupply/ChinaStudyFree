---
type: "Reference"
title: "Voice Synthesis"
openwiki_generated: true
verified:
  - by: openwiki/0.7.2
    at: 2026-11-04T02:58:40.844Z
sources:
  - id: openwiki-source-e882a832c2ff1872fd64417d
    resource: repo://apps/server/src/edge-tts.ts
  - id: openwiki-source-7682ee95fa90a02750093384
    resource: repo://apps/server/src/gec.ts
  - id: openwiki-source-3191419c76ea18831b50ac9e
    resource: repo://apps/server/src/index.ts
  - id: openwiki-source-a07f5417e0feaac0cbf690cf
    resource: repo://apps/server/src/tts.ts
  - id: openwiki-source-f41577d2ec35d3f44a570c38
    resource: repo://apps/web/scripts/build-data.ts
  - id: openwiki-source-bd1b722dd7b089c359b67df7
    resource: repo://apps/web/src/lib/tts.ts
  - id: openwiki-source-903fb9008c9887165a8fb61c
    resource: repo://scripts/tts/generate-audio.mjs
generated: { by: "opencode", at: "2026-11-04T02:58:40.844Z" }
---


# Voice Synthesis

ChinaStudyFree deliberately does not use the operating system or browser's built-in speech synthesis. System voices vary by platform, cannot be controlled, and break the product's consistent child-friendly tone. Instead, every spoken interaction comes from one of two project-owned sources:

1. Pre-generated audio files addressed by a content hash.
2. The project's own TTS API, which uses DashScope when configured and a free Edge TTS fallback otherwise.

If neither is available, playback is silent. That is an explicit product decision, not an error state.

## Tier 1: pre-generated audio

`build-data` scans `apps/web/public/audio` and injects an audio URL into lesson questions, options, explanations, knowledge summaries, passages, and stories only when a matching file exists.

The addressing convention is:

```
normalize(text) = trim + collapse whitespace
hash            = sha1(normalize(text))
path            = /audio/{hash[0:2]}/{hash}{.opus|.mp3|.wav}
```

The extension is chosen by checking which file exists, with `.opus` preferred for size. Option prefixes such as `A.` are stripped before hashing. Because `build-data` indexes the actual directory, a missing audio tree produces no audio fields rather than broken URLs.

`scripts/tts/generate-audio.mjs` fills the tree. It collects unique strings from the built data and a fixed UI phrase list, hashes the original text exactly as `build-data` does, cleans LaTeX only for the synthesis request, skips existing non-empty files, and writes through DashScope with a configurable concurrency. It supports dry runs and limits for cost control. After generation, data must be rebuilt to inject the new paths.

This tier is the best experience: offline, zero latency, and a consistent voice. It is also optional; `public/audio` is gitignored and produced locally or in a release pipeline.

## Tier 2: online synthesis

The frontend's `playVoice(src, text)` is the single playback entry point. It:

1. Returns immediately if muted.
2. Tries the pre-generated `src` if provided.
3. If loading fails, or if no `src` exists, calls the project TTS API with the text.
4. Plays the returned object URL and revokes it afterward.
5. Stays silent if both paths fail.

A single `HTMLAudioElement` is reused, so only one clip plays at a time. A small LRU preload map (16 entries) reduces repeated fetches. Clicking the same source while it is playing stops it.

Online availability is probed once through `/api/health`. If the backend reports TTS as unavailable, or a synthesis request fails, the client stops trying online TTS for the rest of the session rather than retrying on every click. This prevents repeated latency and console noise in offline deployments.

## Server synthesis order

`/api/ai/tts` calls `synthesize(text, voice)`:

1. If `DASHSCOPE_API_KEY` is set, try DashScope.
2. If DashScope fails and Edge TTS is enabled, fall back to Edge.
3. If Edge is disabled and DashScope is absent or fails, throw `TTSNotConfigured`.

The fallback is controlled by `EDGE_TTS_ENABLED`. Setting it to `false` is the recommended configuration for offline or intranet deployments, where the Microsoft endpoint is unreachable and repeated attempts would only add latency.

The endpoint returns raw audio bytes, sets the provider's content type, and applies `Cache-Control: public, max-age=31536000, immutable`. The immutable cache header is safe because the request text is the de facto cache key, though the server itself does not maintain a synthesis cache.

## DashScope path

DashScope synthesis posts to Alibaba Cloud's multimodal generation endpoint with:

- the configured model (default `cosyvoice-v1`);
- the configured voice (default `longxiaochun`, a child-appropriate voice);
- plain text input;
- output format `mp3` at 24 kHz.

The response contains a JSON-encoded audio field with base64 data and a content type. The server decodes the base64 to a Buffer and returns it. Errors include the provider status and a truncated response body.

## Edge TTS path

The free fallback speaks to Microsoft's Edge read-aloud WebSocket endpoint. It requires no API key but does require network access.

The handshake includes:

- the public trusted client token;
- a `Sec-MS-GEC` token;
- a `Sec-MS-GEC-Version` string;
- a connection id;
- a browser-like user agent and cookie.

The version string is pinned to the Edge 143 era (`2-143.0.3650.75`). The `2-` prefix matters: the endpoint rejects the older `1-` token format with 403.

After the socket opens, the server sends a speech-config message and an SSML message. SSML text is XML-escaped and wrapped in a `zh-CN` voice with a slightly slower prosody (`-10%`). Output is 24 kHz, 48 kbit/s mono MP3.

Binary frames are scanned for the `Path:audio` header; the bytes after it are appended. A text frame containing `turn.end` completes the request. A text frame containing `Path:response` with a non-success code fails fast, so a 402/403 is reported as a provider error rather than a 30-second timeout. A 30-second timer bounds the whole operation. The socket is always closed on success or failure.

The fallback is best-effort and depends on an undocumented consumer endpoint. Microsoft can change it; the pinned GEC algorithm and version are maintenance liabilities, not a stable public API contract.

## Sec-MS-GEC v2 token

`gec.ts` ports the token algorithm from the community Edge TTS implementation. It computes:

1. A Windows FILETIME-style timestamp from Unix seconds plus the Windows epoch.
2. Rounding down to a 300-second window.
3. Conversion to 100-nanosecond ticks.
4. Concatenation with the trusted client token.
5. A custom SHA-256 variant using a non-standard initial state, modified schedule, and an additional CS64 checksum.
6. A token of the form `<16 hex>-<64 hex>`.

The implementation uses 32-bit arithmetic with careful logical shifts versus rotates, BigInt-backed 32-bit multiplication, and signed-modulo correction to match the Python reference. The repository includes a cross-language validation script at its root. The code comments identify the exact traps: the small sigma's third term must be a logical shift, the CS64 coefficients must be prepended before data words, and JS modulo needs sign correction.

This is the most fragile part of the voice stack. It exists because the free fallback is valuable for zero-configuration deployments, especially desktop and portable builds.

## Diagnostics

`/api/health` reports `ttsBackend`:

- `dashscope` — a DashScope key is configured.
- `edge` — the free fallback is enabled.
- `none` — TTS is disabled or unavailable.

The startup banner prints a human-readable version of the same state. If a Read Aloud button produces no sound, the first check is this field, followed by network reachability for Edge and the validity of the DashScope key.

## Operational recommendations

- For fully offline deployments, generate pre-rendered audio and set `EDGE_TTS_ENABLED=false`.
- For online deployments without a paid key, leave Edge enabled and accept its external dependency.
- For production quality and predictability, configure DashScope and keep Edge as a fallback.
- Treat generated audio as a build artifact: regenerate after content changes, then rebuild data.

## Related pages

- [Reading, Stories and Audio](../web/reading-stories-and-audio.md)
- [AI Backend](./ai-backend.md)
- [Data and Content Pipeline](../architecture/data-and-content-pipeline.md)
- [Course Generation Pipelines](../content/course-generation-pipelines.md)
