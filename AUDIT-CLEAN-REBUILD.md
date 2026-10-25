# After Dark — Clean Rebuild Audit

Date: 2026-10-25

## Safety boundary
- Audit target: `clean-rebuild`, forked from the compatible player branch for isolated work.
- Production branch `main`, live deployments, Supabase data, and host environment settings have not been changed.
- PR #9 is still draft and unmerged. Do not merge or deploy this candidate until release blockers are resolved.

## Baseline and branch state
- Baseline player UI commit: `54b85b97cb5dcb2e85cc5a236ce4d62b6276f3ae` (previously verified deployment; source branch may have advanced).
- Current comparison: `clean-rebuild` is 125 commits ahead of `main`, 0 behind. This is too large to merge blindly.
- `rewrite-after-dark` is divergent (historical comparison: 2 ahead / 417 behind main); do not use it as a replacement baseline.
- The repository currently has 15 branches, including three named backups. No branches have been deleted.
- The separate public repository `polin4kz/cinema` still exists and is not archived. It should not be deleted until its unique content has been compared and preserved.

## Functional inventory to preserve
- Supabase email/password authentication and profile/nickname flow.
- Shared archive/list synchronization for the two authorized users.
- Ratings/history, including WATCHED and REMOVED states and individual user ratings.
- TMDB catalog search, metadata, posters, detail cards and Movie Night.
- Movie Night selection, details, archive status and add-to-archive action.
- WATCH overlay, supported source URL normalization, browser-local source cache, and fullscreen where supported by the provider.
- Internet Archive search proxy; catalog search results are not guaranteed to be playable video streams.
- Existing dark bordeaux/black/milk identity, grain texture, responsive layout and readable mobile typography.
- Existing Supabase RLS and private-member access model.

## Dependency and deployment map
- Static HTML entry: `index.html`.
- Main theme: `style.css`.
- Catalog/search logic: `script.js`.
- Cards and Movie Night: `after-dark-final.js`.
- Auth UI: `auth-ui.js`.
- Supabase auth/shared archive runtime: `supabase-runtime.js`.
- Ratings UI/data behavior: `supabase-ratings.js`.
- Player: `watch-player.js` and `watch-player.css`.
- Vercel-style server functions: `api/tmdb.js`, `api/archive-search.js`.
- Netlify-style server functions: `netlify/functions/tmdb.js`, `netlify/functions/archive-search.js`; routes in `netlify.toml`.
- Tests: `tests/watch-player.test.js`, `tests/archive-search.test.js`, `tests/tmdb-proxy.test.js`.
- Validation workflow: `.github/workflows/validate.yml`.
- Supabase schema/RLS documentation: `supabase-schema.sql`; watchlist-history migration: `supabase/migrations/20261020_watchlist_history.sql`.

## Confirmed code findings
1. Browser requests in the inspected `script.js` use the `/api/tmdb` helper. The browser bundle no longer contains the TMDB bearer-token variable or a direct `api.themoviedb.org/3` base URL.
2. The proxy allowlist covers search, discover, movie/TV detail, and movie/TV credits routes. Tests exercise Vercel and Netlify handler behavior with mocked upstream responses.
3. `watch-player.js` currently stores normalized source URLs in browser local storage. The code inspected does **not** implement playback-position resume, season/episode progress, or provider-independent quality/audio selection. These remain feature work, not completed functionality.
4. The player requires a user-supplied supported source URL when no source is cached; a JustWatch search link is shown as an alternative. Supporting a provider domain does not guarantee that a specific video can be embedded.
5. The `in_watchlist` migration exists in the repository but has not been applied to the live Supabase database. Code that writes this field may fail against a database schema that lacks the column. Confirm schema compatibility before any release; do not run a live migration as part of this audit.
6. `index.html` loads the player before `script.js` and the Supabase runtime. The player injects WATCH actions into archive cards and Movie Night actions through a mutation observer. Live behavior still needs browser verification.
7. `after-dark-final.js` contains several additive Movie Night interaction handlers. They may overlap in responsibilities (filter options and the DECIDE action). This is a code-review target; do not remove handlers without a focused regression test because the controls have been patched repeatedly to address earlier interaction bugs.

## Security and migration risks
1. The current browser bundle no longer includes the old TMDB bearer token, but that credential appeared in Git history. Credential rotation remains deferred by the user. Treat this as a release blocker; do not expose, copy, or rotate credentials from code.
2. The TMDB proxy requires server-side `TMDB_BEARER_TOKEN`. Hosting environment settings have not been inspected or edited, so working TMDB calls on the candidate are not confirmed.
3. Supabase schema/RLS/private-member rules are production data contracts. Do not run SQL against the live project without explicit review.
4. Vercel and Netlify implementations duplicate the server proxy functions. Select the actual release host before consolidating these files.
5. The project uses browser-loaded scripts and Node's built-in test runner in the inspected files; no package-manager-based build was established from this audit.

## Latest automated checks
- Latest recorded GitHub Actions run: `40198504691`, conclusion `success`.
- Its job `Check JavaScript syntax` completed successfully, including the workflow's JavaScript syntax and Node test commands.
- Latest recorded Vercel status for candidate commit `c4f0366391b052efd3fe3824e22f9cbcf061cfff`: `success`.
- This verifies the candidate's CI/deployment check only. Tests mock upstream calls and do not prove live TMDB credentials, login, shared archive, ratings, Movie Night, or player behavior end-to-end.
- Browser automation was not completed because the available browser tool could not start due to its negative wallet balance. Do not infer that the site is broken from this tooling failure.
- No review threads were present on PR #9 at the time checked.

## Release plan
1. Keep `main` and the production URL untouched.
2. Complete source review and build targeted regression tests for Movie Night handlers and archive state transitions.
3. Verify the live schema requirement for `in_watchlist` before any release. Do not apply the migration automatically.
4. Confirm the release host and server-side TMDB secret configuration; credential rotation remains a separately deferred security blocker.
5. Perform authenticated two-account regression: login/logout, shared archive add/remove/watch, ratings ownership, Movie Night add-to-archive, and mobile layout.
6. Only after selecting and validating a release candidate, compare the old `cinema` repo and every candidate branch for unique commits before any deletion. Preserve `main`, `clean-rebuild`, and the known player baseline until that comparison is complete.

## Audit limitations
This is a GitHub-file-API source/configuration audit, not a full local clone, live end-to-end test, review of hosting secrets, or production security audit. No production or Supabase changes have been made.
