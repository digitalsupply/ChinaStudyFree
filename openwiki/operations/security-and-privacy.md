---
type: operations
title: Security and Privacy
description: The local-first child-safety model, implemented HTTP and secret-handling controls, optional third-party AI data flows, and documented limitations and release caveats.
tags: [security, privacy, children, secrets, http]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-04T02:58:40.844Z
sources:
  - id: openwiki-source-5f5b95b3d6a215fa02ceb945
    resource: repo://.env.example
  - id: openwiki-source-79b37831c9c81206da1d88ec
    resource: repo://.github/dependabot.yml
  - id: openwiki-source-1314ccc5cd8f57a789261ebc
    resource: repo://.github/workflows/build-installers.yml
  - id: openwiki-source-164e2da859b5277df81c7d94
    resource: repo://.github/workflows/ci.yml
  - id: openwiki-source-ea70eb6c045047448e446296
    resource: repo://.gitignore
  - id: openwiki-source-f67bec33dfc9a4a4a2f32dea
    resource: repo://apps/server/.env.example
  - id: openwiki-source-3191419c76ea18831b50ac9e
    resource: repo://apps/server/src/index.ts
  - id: openwiki-source-acc55dab5de06507f91009e6
    resource: repo://apps/web/src/lib/useRecorder.ts
  - id: openwiki-source-7678eae486614637beeef14c
    resource: repo://apps/web/src/store/progress.ts
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-3a44815832a872f4778f822b
    resource: repo://SECURITY.md
generated: { by: "opencode", at: "2026-11-04T02:58:40.844Z" }
---

# Security and Privacy

ChinaStudyFree is a K-12 learning tool with an unusually strong privacy stance for a product in this category: it has no accounts, no cloud progress store, no analytics SDK, and no advertising. That stance is a design constraint, not a marketing claim, and it shapes both the architecture and the operational risks.

## Implemented privacy model

The security policy describes three principles: local-first, minimal collection, and optional AI.

- Learning progress — XP, streaks, hearts, gems, completed lessons, mistakes, reading history, cosmetics, and settings — is stored on the device in browser or webview storage.
- There is no account system and no server-side learner profile.
- The product does not request names, schools, phone numbers, or location, and does not embed analytics or advertising SDKs.
- AI features are optional and user-triggered. They work only when the server has the relevant provider keys.

The practical consequence is that losing the device means losing progress unless the user exported a backup. It also means there is no cross-device sync in the current version; the documentation explicitly labels cloud sync as unfinished roadmap work.

## What actually leaves the device

Three data paths can leave the device, and all are optional:

1. **AI generation requests.** Quiz, explanation, and story prompts include subject, grade, topic, question text, options, answers, or story theme. These are sent to the configured OpenAI-compatible LLM endpoint.
2. **Speech synthesis.** Text to be spoken is sent to DashScope when configured, or to Microsoft Edge TTS when the free fallback is enabled.
3. **Story illustrations.** A generated illustration prompt based on the story title or theme is sent to Google Gemini.

No learner identity is attached to these requests by the application. However, they do contain grade and content context, and the third-party provider sees the request. Deployers should evaluate provider terms and data retention for a child-facing service.

Microphone recordings for shadowing are local only: the recorder uses `MediaRecorder`, creates a blob URL, and never uploads or persists the audio. Refreshing the page discards it.

## Key handling

Provider keys are supplied through environment variables or `apps/server/.env`, which is gitignored. The repository's `.env.example` files contain placeholders, not real credentials.

CI includes a blocking secret scan that greps for common API-key and private-key patterns outside dependencies and `.gitignore`d files. That catches obvious accidents but is not a substitute for secret management. The recommended deployment pattern is environment injection through the hosting platform or container orchestration, not committing a filled `.env`.

The health endpoint reports only booleans and a version:

- whether LLM, TTS, and image generation are configured;
- which TTS backend is active (`dashscope`, `edge`, or `none`);
- the service version.

It does not echo keys, provider URLs, or model names.

## HTTP controls

The Express server applies several headers to both API responses and the static site it hosts:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: no-referrer-when-downgrade`
- `Permissions-Policy` disabling camera, microphone, geolocation, payment, USB, and interest-cohort
- `Cross-Origin-Opener-Policy: same-origin`
- a Content-Security-Policy allowing same-origin scripts/styles plus `'unsafe-inline'`, `'unsafe-eval'`, and HTTPS sources, with connections to self, HTTPS, and localhost

The CSP is deliberately permissive because the static SPA relies on an inline boot script and some fallback evaluation. The SECURITY policy acknowledges that a stricter nonce-based CSP would be required for a hardened deployment. The permissive directives are a known trade-off, not an oversight.

CORS defaults to `*`. That is convenient for self-hosted mobile builds and local testing, but it is not appropriate for a public production service handling sensitive prompts. Deployers should set `CORS_ORIGIN` to their actual frontend origin.

The server also limits JSON bodies to 2 MB and returns structured error responses rather than stack traces. Runtime logs are single-line JSON with timestamps and levels; errors may include provider response fragments, so logs should be treated as operational data and access-controlled.

One operational detail deserves attention: the `Permissions-Policy` disables the microphone, while the optional shadowing feature uses `getUserMedia`. Deployments that serve the app through this server should verify microphone behavior, or adjust the policy, before promising shadowing functionality.

## Release and supply-chain caveats

- The Android release workflow falls back to a demo keystore stored in the repository when signing secrets are absent. This is suitable for test distribution only; store releases need a private keystore and protected passwords.
- The release workflow uses repository secrets for Android signing and optionally for OpenWiki automation. Those secrets must be scoped and rotated normally.
- Dependabot opens weekly update PRs for npm, GitHub Actions, and the Docker base image. CI runs `npm audit --audit-level=high` but does not block on it, so audit findings require human follow-up.
- The desktop bundle ships a Node runtime and a single-file server. Its trust model is the same as any local application: the binary and sidecar must be obtained from a trusted release channel.

## What is not implemented

The current version has no account recovery, no server-side progress backup, no teacher/class data model, and no multi-device sync. The security documentation explicitly separates these roadmap items from existing behavior. Claims that the platform stores learner profiles in the cloud would be incorrect.

The project also does not claim full content moderation of LLM output. It mitigates with constrained prompts, local fallbacks, and pre-generated offline content, but a deployment enabling live generation should treat model output as untrusted and apply its own safeguards.

## Related pages

- [AI Backend](../server/ai-backend.md)
- [Progress Store and Persistence](../web/progress-and-persistence.md)
- [Build and Distribution](../architecture/build-and-distribution.md)
- [Testing and CI](./testing-and-ci.md)
