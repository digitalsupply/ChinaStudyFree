---
type: web-architecture
title: Routing and App Shell
description: The App Router surface under static export, composite route keys, hard-navigation policy, the responsive shell, global watchers, immersive routes, and PWA/service-worker behavior.
tags: [routing, app-router, static-export, layout, pwa, service-worker]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-04T02:58:40.844Z
sources:
  - id: openwiki-source-9155198a57dd2721f248c9a5
    resource: repo://apps/web/next.config.mjs
  - id: openwiki-source-ef6a421851aa41f6877d2014
    resource: repo://apps/web/public/sw.js
  - id: openwiki-source-3a80524fae3911e7184bd6e1
    resource: repo://apps/web/src/app/grade/%5Bgrade%5D/page.tsx
  - id: openwiki-source-0954ee55f52b9749d82f7ddb
    resource: repo://apps/web/src/app/guide/%5BbookUnit%5D/page.tsx
  - id: openwiki-source-8265e88e22d1dd3a83fea5c0
    resource: repo://apps/web/src/app/HomeClient.tsx
  - id: openwiki-source-b23522a72e7c020fb273ab0d
    resource: repo://apps/web/src/app/layout.tsx
  - id: openwiki-source-ccfcb2b72d193169c7f2db17
    resource: repo://apps/web/src/app/lesson/%5Blesson%5D/page.tsx
  - id: openwiki-source-836ea3521351eac828beff5f
    resource: repo://apps/web/src/app/manifest.ts
  - id: openwiki-source-2dd1624206bb223f80425d31
    resource: repo://apps/web/src/app/passage/%5Bpassage%5D/page.tsx
  - id: openwiki-source-72f6d8f758ff2de70163d572
    resource: repo://apps/web/src/app/reading/%5Bbook%5D/page.tsx
  - id: openwiki-source-6c79e3a09b238349ee5ea60a
    resource: repo://apps/web/src/app/stories/%5Bbook%5D/page.tsx
  - id: openwiki-source-8fee17b9e8ff8992d6efb38f
    resource: repo://apps/web/src/app/story/%5Bstory%5D/page.tsx
  - id: openwiki-source-46ab99e49ddf2394760e0a8f
    resource: repo://apps/web/src/components/AchievementWatcher.tsx
  - id: openwiki-source-cec6009e5b217e7ecab1d2c1
    resource: repo://apps/web/src/components/BottomNav.tsx
  - id: openwiki-source-33048a3851e542da5536dfbd
    resource: repo://apps/web/src/components/layout/AppShell.tsx
  - id: openwiki-source-72ef5b19b5e5bc35824f01d4
    resource: repo://apps/web/src/components/layout/SideNav.tsx
  - id: openwiki-source-c684089d5a1f58ed540923b9
    resource: repo://apps/web/src/components/StagePicker.tsx
  - id: openwiki-source-ba0fb183fe6a4b857984bc2e
    resource: repo://apps/web/src/lib/immersiveRoutes.ts
  - id: openwiki-source-f317ee207e1653d2033c81a4
    resource: repo://CONTRIBUTING.md
generated: { by: "opencode", at: "2026-11-04T02:58:40.844Z" }
---

# Routing and App Shell

The web app uses the Next.js App Router but ships as a fully static export. That combination determines almost every routing decision in the codebase: routes must be enumerable at build time, dynamic segments must collapse into static-friendly keys, and navigation must avoid client-side transitions that have proven unreliable in native webviews.

## Static export constraints

`next.config.mjs` sets `output: "export"`, `trailingSlash: true`, and unoptimized images. There is no server runtime for pages. Every dynamic route therefore provides `generateStaticParams`, and pages read pre-built JSON from `public/data` through Node's filesystem during the build.

Two consequences are visible throughout the app:

- **No arbitrary dynamic params.** A route like `/lesson/[lesson]` cannot accept a runtime-composed path. Instead, the build enumerates every lesson and encodes it as a single segment with a composite key.
- **Placeholder params are sometimes required.** If no passages or stories exist, the list route still injects a `__sample__` parameter so Next's export does not fail on an empty static-params array. That path 404s at runtime.

## Route surface

The main routes are:

| Route | Purpose |
| --- | --- |
| `/` | First-run stage/grade dispatch or redirect to the active book |
| `/stage/[stage]/` | Stage landing with grades and version entry |
| `/stage/[stage]/versions/` | Publisher-version selection |
| `/grade/[grade]/` | Books for a grade, grouped by subject |
| `/book/[book]/` | Path map for a textbook |
| `/lesson/[lesson]/` | Lesson runner, key `{bookId}__{lessonId}` |
| `/guide/[bookUnit]/` | Unit knowledge guide, key `{bookId}__{unit}` |
| `/reading/[book]/` | Passage list for a book |
| `/passage/[passage]/` | Passage reader, key `{bookId}__{passageId}` |
| `/stories/[book]/` | Story list for a book |
| `/story/[story]/` | Story reader, key `{bookId}__{storyId}` |
| `/review/` | Mistake bank and SRS summary |
| `/review/runner/` | Due-mistake review session |
| `/league/` | Simulated league board |
| `/shop/` | Cosmetics and power-ups |
| `/profile/` | Progress summary, achievements, settings, backup |
| `/textbooks/` | External textbook catalog |
| `/ai/` | Online AI demo |
| `/donate/` | Donation information |

The grade route pre-renders grades 1 through 13 even if some have no books. The lesson route pre-renders ordinary and exam lessons. The guide route pre-renders one entry per unit. Reading and story routes pre-render only books flagged with the corresponding content.

## Composite keys

Instead of nested dynamic routes such as `/book/[book]/lesson/[lesson]`, the app flattens interactive routes into one segment:

```
{bookId}__{lessonId}
{bookId}__{passageId}
{bookId}__{storyId}
{bookId}__{unitNumber}
```

The page splits on the first `__`, then loads the book and the specific resource. This avoids nested dynamic-route export problems and keeps every URL pre-rendered. It also means the dashboard's continue-learning card can construct a lesson URL by parsing the book id from a lesson id and joining the two with `__`.

## Hard navigation policy

The app uses full-page navigation (`window.location.assign` or plain `<a>`) rather than `next/link` and `router.push` for most transitions. This is not stylistic. In the static export running inside Tauri or a Capacitor WebView, client-side navigation has intermittently produced 404s, especially on Android. Hard navigation is slower but predictable.

The policy shows up in:

- stage, grade, and lesson start actions;
- continue-learning links;
- current-book and version switches;
- exit paths from the lesson runner and readers;
- navigation items in the side and bottom bars.

Server components use plain anchors where possible. Client components call `window.location.assign`. New navigation code is expected to follow the same rule.

## Root layout and providers

The root layout installs:

- the Nunito display font and global styles;
- metadata for title, description, manifest, Apple web app, and icons;
- viewport theme colors for light and dark;
- an inline boot script that runs before hydration;
- the `ErrorBoundary`, `ThemeProvider`, and `ToastProvider`;
- three global watchers: daily reward, achievements, and league;
- the page content;
- the bottom navigation.

The boot script has two jobs:

1. Read the persisted cosmetic theme and theme-mode preference, then add the dark class and background before first paint to avoid a white flash.
2. Register the service worker on ordinary web hosts, but on native hosts unregister existing workers and clear caches. Native apps already bundle their assets, and a stale service worker caused blank-screen and stale-chunk failures on Android.

## Responsive shell

`AppShell` is a single-tree responsive layout:

- below `md`: one column with the fixed bottom navigation;
- `md`: an 88 px icon-only side navigation plus the center column;
- `lg` and above: a 260 px side navigation, the center column, and a 360 px right rail.

The center column has a configurable max width. The right rail can be replaced or hidden per page. Children are mounted once; the side rails are hidden with responsive classes rather than rendering a second copy. That avoids duplicated audio, observers, and tickers, which had caused real bugs when mobile and desktop trees were rendered separately.

The side and bottom navigation expose learning, league, review, shop, profile, and textbooks. The learning item stays active across grade, stage, book, lesson, reading, and story routes.

## Immersive routes

Some routes are full-screen focus modes. `isImmersivePath` is the single source of truth:

- lesson runner;
- jump-ahead;
- review runner (but not the review list);
- passage reader;
- story reader.

On these routes the bottom navigation is hidden so it cannot cover action buttons. The global watchers also suppress celebrations and modals, deferring achievement, league, and daily-reward toasts until the learner returns to a normal page. Rewards and ledgers still update immediately; only the interruption is deferred.

## PWA and service worker

`manifest.ts` defines a standalone portrait PWA with Chinese metadata, a theme color, and SVG/PNG maskable icons. A service worker adds offline behavior for the web build:

- shell assets and navigations: network first, falling back to cache and then the cached home page;
- `/data/**` and `/audio/**`: stale-while-revalidate;
- `/_next/static/**`: cache first because those files are content-addressed;
- other same-origin static assets: stale-while-revalidate.

The worker is registered only after load, and only on non-native hosts. Native hosts detect Capacitor, file, localhost HTTPS, Tauri, or Android asset domains, unregister existing registrations, delete caches, and skip registration. This is a deliberate divergence: the web benefits from offline caching, while native apps must avoid stale bundled assets.

## Error containment

The layout wraps the app in an error boundary. A rendering failure in a page or client component shows a fallback instead of a blank screen. Combined with static fallbacks and hard navigation, this keeps a single broken route from taking down the whole app shell.

## Related pages

- [Build and Distribution](../architecture/build-and-distribution.md)
- [Learning Path and Book Map](./learning-path.md)
- [Progress Store and Persistence](./progress-and-persistence.md)
- [Security and Privacy](../operations/security-and-privacy.md)
