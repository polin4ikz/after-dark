# After Dark — Clean Rebuild Audit

Date: 2026-10-25

## Safety boundary
- This audit was performed against `compat/current-player-client-tmdb`.
- The `clean-rebuild` branch was created from that branch for isolated work.
- No changes were made to `main`, production deployments, Supabase data, or existing branches.
- Do not merge or deploy this branch until the compatibility checklist is completed.

## Baseline
- Baseline branch: `compat/current-player-client-tmdb`
- Baseline commit for the working player UI: `54b85b97cb5dcb2e85cc5a236ce4d62b6276f3ae` (previously verified deployment; branch HEAD may have advanced).
- `main` is 102 commits behind this branch in the GitHub comparison performed on 2026-10-25.
- `rewrite-after-dark` is divergent (2 commits ahead, 417 behind main in the comparison performed on 2026-10-25); do not use it as a replacement baseline.

## Functional inventory (to preserve)
- Supabase email/password authentication and profile/nickname flow.
- Shared archive/list synchronization for the two authorized users.
- Ratings/history, including WATCHED and REMOVED states and user ratings.
- Catalog search and metadata/posters from TMDB.
- Movie Night selection, details, archive status and add-to-archive action.
- Embedded WATCH player, supported source normalization, progress/source persistence and mobile/fullscreen behavior where supported by the existing implementation.
- Internet Archive search proxy; search results are catalog records and must not be treated as playable video URLs by default.
- Existing dark bordeaux/black/milk visual identity, grain texture, responsive layout and readable mobile typography.
- Existing Supabase RLS and private-member access model.

## Dependency and deployment map
- Static HTML entry: `index.html`.
- Main theme: `style.css` (about 90 KB in the audited branch).
- Main catalog/search logic: `script.js`.
- Movie cards / Movie Night logic: `after-dark-final.js`.
- Auth UI: `auth-ui.js`.
- Supabase/auth/shared archive runtime: `supabase-runtime.js`.
- Ratings UI/data behavior: `supabase-ratings.js`.
- Player: `watch-player.js` and `watch-player.css`.
- Server-side TMDB proxy exists in both `api/tmdb.js` (Vercel-style) and `netlify/functions/tmdb.js`.
- Internet Archive search proxy exists in both `api/archive-search.js` and `netlify/functions/archive-search.js`.
- Netlify routing is defined in `netlify.toml`.
- Node built-in test suite files: `tests/watch-player.test.js`, `tests/archive-search.test.js`, `tests/tmdb-proxy.test.js`.
- GitHub Actions validation workflow: `.github/workflows/validate.yml`.
- Supabase schema/RLS documentation: `supabase-schema.sql`; history migration: `supabase/migrations/20261020_watchlist_history.sql`.

## Security / migration risks
1. The audited `script.js` in `main` contains a TMDB bearer-token pattern. Do not copy it into a new client bundle. The compatible branch includes server-side proxy implementations and a test intended to catch client-bundled tokens. Verify actual deployment secrets are configured in the host environment before relying on the proxy.
2. Supabase schema/RLS and private-member rules are production data contracts. Do not run SQL migrations against the live project during this rebuild without explicit review and approval.
3. Do not replace Supabase project credentials or create a new Supabase project. Existing users and shared data must remain in place.
4. Both Vercel-style and Netlify-style API implementations exist. Choose the deployment target deliberately and test its routes; do not remove one merely to reduce file count until deployment hosting is confirmed.
5. The existing repository appears to use browser-loaded scripts rather than a conventional package build in the files checked. Confirm complete file inventory and CI commands before restructuring.

## Rebuild strategy
- Preserve behavior first; reduce complexity second.
- Keep the existing database and visual theme.
- Consolidate duplicated server functions only after selecting the target hosting platform.
- Keep a single canonical player implementation and one canonical source of truth for ratings/archive behavior.
- Keep automated tests and add regression coverage for authentication-independent UI, archive state transitions, Movie Night and player controls.
- Do not merge or deploy until all checks pass on `clean-rebuild`.

## Audit limitations
This is a code/configuration audit based on files accessible through GitHub's file API. It is not a full live end-to-end test, a full repository clone, or a production security audit. Hosting secrets and live Supabase policies were not inspected or changed.

## Update — 2026-10-25

- Removed the TMDB bearer credential from the browser bundle in `script.js`; browser requests now target `/api/tmdb` and send the requested API path as a query parameter.
- Enabled `tests/tmdb-proxy.test.js` in the validation workflow and added the `clean-rebuild` branch to the workflow's push triggers.
- Verified the current `script.js` no longer contains the TMDB bearer-token variable or a direct TMDB API base URL.
- The commit's reported Vercel check is successful. This is a deployment check only; it does not prove the full application works end-to-end or that the TMDB server environment variable is configured.
- **Security follow-up required:** the credential was present in Git history. Revoke/rotate it in TMDB; changing the current file does not erase historical exposure.
- **Do not merge this branch into `main` yet.** It is 105 commits ahead of `main` and contains a broad accumulated feature set. Run the complete CI and functional regression checks, confirm server environment configuration, then review the diff before any production cutover.
- Branch cleanup is intentionally postponed until one tested release candidate is selected. Deleting preview branches now would remove useful rollback/reference points without fixing deployment drift.
