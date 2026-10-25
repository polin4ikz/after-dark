# After Dark — playback architecture plan

Status: design / implementation plan, not a production release.
Target branch: cleanup/vercel-only-final.
Production `main`, the production Vercel alias, Supabase data and live schema must remain untouched.

## User experience

1. User chooses a film/series in Archive or Movie Night and presses Смотреть.
2. Open a dedicated same-site watch route/page, not a modal and not a form requesting a URL.
3. Resolve the catalog item using TMDB ID + media type, with title/year fallback only for discovery.
4. Show Russian-first legal watch options when available. Distinguish playable embeds from outbound provider links.
5. For series, show seasons and episodes only when the selected playback provider supplies reliable episode metadata. Never fabricate a season list from TMDB metadata alone.
6. Persist progress (provider, media ID, season/episode, playback seconds, duration, updated timestamp) only when the provider exposes playback events/API or a first-party HTML5/HLS player is used. For cross-origin iframes that do not expose progress, show provider link and don't pretend resume works.
7. Resume UI: Продолжить с … / Начать сначала. Per-user identity should be used if progress is saved to Supabase; browser-local storage can be a fallback for anonymous/local progress.
8. Russian audio/subtitle labels and quality options are provider capabilities, not universal controls. Only display controls actually supported by the chosen provider.

## Source discovery

- TMDB remains catalog metadata only; it does not provide film streams.
- Investigate a licensed availability/discovery provider (e.g. JustWatch partner/API access) for regional availability and outbound links. Verify access terms, Germany/Russia region behavior, API rights, and whether the provider exposes playable embeds. Do not scrape private endpoints or rely on undocumented APIs.
- Keep a provider adapter interface so discovery and playback are decoupled.
- Legal first-party HTML5/HLS sources can use native playback controls when the user/provider has rights to stream them.
- Third-party official embeds may be supported where terms permit; validate host allowlists and use CSP/referrer policies.
- If only an external service link is available, clearly open that service rather than displaying a fake in-app player.
- Internet Archive search results are catalogue records, not proof that a full playable film exists; do not treat title matches as a playback provider.

## Proposed components

- `watch.html` (or a route supported by current static hosting): dedicated watch screen, responsive, After Dark bordeaux/black/milk visual system.
- `watch-page.js`: reads selected media identity, loads progress and provider options, manages episode selection and resume actions.
- `watch-page.css`: desktop/mobile player layout; accessible controls and larger mobile text.
- `api/watch-options.js`: server-side provider adapter; returns normalized legal availability records only. No secret in client code. Add only after a documented provider and credentials/access are confirmed.
- `api/watch-progress.js` only if progress is stored in Supabase; first inspect existing schema/RLS and add a reviewed migration only if needed. Do not alter live Supabase automatically.
- Tests for provider response normalization, no-provider state, episode selection, progress save/resume, unsupported iframe behavior, and safe external URLs.

## Normalized data contracts (proposal)

Media: `{ tmdbId, mediaType: "movie"|"tv", title, year? }`

Provider option: `{ providerId, displayName, mode: "embed"|"external"|"native", url, region, audioLanguages?, subtitleLanguages?, qualityOptions?, seasons? }`

Progress: `{ mediaKey, seasonNumber?, episodeNumber?, positionSeconds, durationSeconds?, updatedAt, providerId? }`

The UI must never assume optional audio, subtitle, quality, seasons, or playback progress capabilities exist.

## Release gates

1. Confirm a real source/discovery provider and its terms/access. Without this, the app cannot automatically promise an arbitrary film will play in Russian.
2. Implement and test the page against a mock provider before wiring a live provider.
3. Confirm progress persistence strategy and Supabase RLS before creating/updating any schema.
4. Test on desktop and iPhone-sized layout; verify Movie Night and archive launch the same watch page.
5. Run CI and manual authenticated regression.
6. Do not merge into `main` or assign the stable production domain until explicitly approved and the release gates are satisfied.

## Known current-state gaps

The current `watch-player.js` is a modal, asks for a manually supplied supported embed URL, and supports only YouTube, Vimeo and Archive.org. Its source cache is browser-local. It does not implement automatic provider discovery, seasons/episodes, playback-position tracking, resume, or universal audio/quality controls. Its Archive.org search is catalogue search, not a reliable stream resolver.
