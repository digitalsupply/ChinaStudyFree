---
type: web-workflow
title: Reading, Stories and Audio
description: Passage listening and shadowing, story reading with comprehension quizzes, canonical reading rewards, textbook page images, and the shared audio playback policy.
tags: [reading, stories, passages, audio, tts, rewards]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-04T02:58:40.844Z
sources:
  - id: openwiki-source-f41577d2ec35d3f44a570c38
    resource: repo://apps/web/scripts/build-data.ts
  - id: openwiki-source-30aa5f2fdace0ba46deee14b
    resource: repo://apps/web/src/app/book/%5Bbook%5D/page.tsx
  - id: openwiki-source-72f6d8f758ff2de70163d572
    resource: repo://apps/web/src/app/reading/%5Bbook%5D/page.tsx
  - id: openwiki-source-6c79e3a09b238349ee5ea60a
    resource: repo://apps/web/src/app/stories/%5Bbook%5D/page.tsx
  - id: openwiki-source-c07e7148e38a335cbb0856f8
    resource: repo://apps/web/src/app/stories/%5Bbook%5D/StoryCard.tsx
  - id: openwiki-source-fb4c38ac0656abb40ac95296
    resource: repo://apps/web/src/app/story/%5Bstory%5D/StoryReaderClient.tsx
  - id: openwiki-source-957974842e477344d6cc2523
    resource: repo://apps/web/src/components/PassageReader.tsx
  - id: openwiki-source-bd1b722dd7b089c359b67df7
    resource: repo://apps/web/src/lib/tts.ts
  - id: openwiki-source-acc55dab5de06507f91009e6
    resource: repo://apps/web/src/lib/useRecorder.ts
  - id: openwiki-source-7678eae486614637beeef14c
    resource: repo://apps/web/src/store/progress.ts
  - id: openwiki-source-c01cbcccd1ed47df4f36f372
    resource: repo://packages/core/src/reading.ts
generated: { by: "opencode", at: "2026-11-04T02:58:40.844Z" }
---

# Reading, Stories and Audio

Reading is a separate learning mode from the lesson runner. It has its own data files, routes, rewards, and interaction patterns, but it shares the same audio stack and the same canonical reading-id space as the rest of the app.

## Data sources

Reading content is produced by `build-data` from optional source directories:

- `data/passages/{subject}/{bookId}.json` becomes `public/data/books/{bookId}/passages.json`.
- `data/stories/{subject}/{bookId}.json` becomes `public/data/books/{bookId}/stories.json`.

Both are decorated with audio paths only when matching pre-generated files exist. Passages may also gain textbook page images from `public/textbook-pages/{bookId}/pages.json`, which maps a passage to a physical PDF page and nearby page images. Books are flagged `hasPassages` or `hasStories` so the rest of the UI knows whether to show entry points.

Draft passages are excluded by filename. The extraction pipeline writes `.draft.json` until a human reviews the text.

## List pages and static export

The reading and story list routes pre-render only books with the corresponding flag. If there are no books at all, each route injects a `__sample__` parameter so Next's static export still has a valid page; that path resolves to a 404 at runtime.

The reading list shows each passage with its title, author, kind, sentence count, an audio-ready indicator, and a textbook page cover when available. The cover selection prefers the page matching `pdfPage`, otherwise the middle image.

The story list groups stories by unit and renders cards. A card checks the canonical reading id against `completedReadings` to show "already read". It also indicates whether audio exists and whether the story has questions.

## Passage listening

`PassageReader` supports three behaviors:

1. **Listen all** — plays sentences in order, highlighting the current sentence, with a short pause between them.
2. **Single sentence** — plays one sentence from its speaker button.
3. **Shadowing (follow-up)** — for each sentence, play the model audio, then record the learner, then move on. After the run, each recording can be replayed against the original.

The reader preloads sentence audio to reduce gaps. Playback is abortable: stopping or unmounting marks an abort flag, stops audio, and prevents a partial run from granting credit.

Recording uses `MediaRecorder` through a small hook. It requests microphone access, records to an in-memory blob, returns a blob URL, and never uploads or persists the audio. Refreshing the page discards recordings. The maximum recording time is derived from sentence length, bounded to 3–8 seconds.

Completing a full listen grants 5 XP once. Completing a full shadowing run grants 10 XP once. Replaying a recording does not grant additional XP. The reward is written through the progress store, which checks the canonical id and only pays the first time.

## Story reading

`StoryReaderClient` has three phases:

1. **Reading** — the story text with optional illustration, per-sentence audio buttons, and a "listen all" control.
2. **Quiz** — comprehension questions rendered through the shared question components.
3. **Result** — stars, correct count, accuracy, and navigation.

The quiz supports true/false, choice, and text fill-in questions. It grades answers locally rather than calling the shared `gradeAnswer` for every type: true/false recognizes Chinese and English values, choice maps the correct option text to a letter, and text compares normalized strings. Each answer shows correctness and the explanation before advancing.

On the final question, the reader computes accuracy and awards reading XP:

- 5 XP for completing the story;
- 10 additional XP if accuracy is at least 0.8, for 15 total.

The result screen converts accuracy to stars at 0.95 and 0.75 thresholds for presentation. The reward is idempotent through `reading:story:{storyId}`; re-reading does not pay again.

## Canonical reward ids

All reading rewards use core's canonical id format:

- `reading:listen:{passageId}`
- `reading:followup:{passageId}`
- `reading:story:{storyId}`

The store normalizes incoming ids, checks key existence, and writes a completion timestamp. The list cards use the same `readingId` helper, so the "done" indicator and the reward condition cannot disagree. This is the fix for the historical web/iOS key-space mismatch that let imported progress show as unread and allowed duplicate XP.

Reading rewards are pure XP. They do not grant lesson gems, do not write `completedLessons`, and do not increment lesson counts. They do increment the daily reading counter, which feeds reading quests, and they advance the streak.

## Audio playback policy

The playback entry point is `playVoice(src, text)`:

1. If muted, do nothing.
2. If a pre-generated source exists, play it.
3. If the file fails to load, or no source exists, synthesize through the project's `/api/ai/tts`.
4. If both fail, stay silent.

The app never falls back to `speechSynthesis`. System voices are excluded by design because they vary by platform and cannot match the product's voice.

A single audio element is reused so that two clips cannot overlap. A small LRU preload cache avoids repeated fetches. Online TTS availability is probed once via `/api/health`; if unavailable, the client stops trying for the session. Pre-generated audio is preferred because it is offline, immediate, and consistent.

One practical asymmetry: the passage reader passes both `src` and `text`, so a passage with no pre-generated audio can still speak through the online API. The story reader's controls are enabled based on the presence of pre-generated sentence audio, so a text-only story may appear silent even if the API is available. Deployments relying on online synthesis should verify this path or generate audio.

## Page images

Passage page images are rendered from the source PDF by the content pipeline. `pages.json` carries a book-level offset so the printed page hint is converted to a real PDF page. The reader displays the matching image by default and allows moving among the nearby pages. The images are static assets under `textbook-pages`, not external links, so they work offline when bundled.

## Failure behavior

- Missing passage or story files make the list route 404 rather than crash.
- Missing audio does not break text rendering; it only removes or degrades audio controls.
- Missing page images simply omit the cover and image viewer.
- A malformed story question still renders through the shared question component; grading falls back to its type branch.
- Recording permission denial surfaces an error state and aborts the shadowing run without granting follow-up XP.

## Related pages

- [Data and Content Pipeline](../architecture/data-and-content-pipeline.md)
- [Voice Synthesis](../server/voice-synthesis.md)
- [Lesson Runner](./lesson-runner.md)
- [Progress Store and Persistence](./progress-and-persistence.md)
