# After Dark — private deployment checklist

The visual design is unchanged. This document covers deployment/security setup for the existing site.

## 1. Rotate the TMDB token

The old TMDB bearer token was embedded in public client-side JavaScript and therefore must be treated as exposed. Revoke/rotate it in the TMDB account before relying on this proxy. Do not commit the replacement token.

## 2. Configure the server-side token

Set an environment variable named `TMDB_BEARER_TOKEN` to the newly rotated TMDB API Read Access Token:

- **Vercel:** Project → Settings → Environment Variables. Add it for Preview and Production environments that you intend to use, then redeploy.
- **Netlify:** Site configuration → Environment variables. Add it to the site and redeploy.

The repo contains a Vercel function at `api/tmdb.js` and a Netlify function at `netlify/functions/tmdb.js`. The Netlify route is configured in `netlify.toml`. Do not put the token in `script.js`, HTML, or any `NEXT_PUBLIC_*` / client-exposed variable.

Until the environment variable is set, the proxy intentionally returns HTTP 503 and TMDB search/detail/Movie Night requests will not work.

## 3. Lock Supabase archive and ratings to the two accounts

Run `supabase-private-access.sql` in the Supabase SQL Editor after confirming that the existing `archive` and `ratings` tables exist. This migration removes all pre-existing policies on those two tables and installs fail-closed policies. It does not delete archive or rating rows.

Then create/sign in to the two intended accounts using the site's normal registration flow. In Supabase → Authentication → Users, copy the **User UID** for each account. Run the following in the SQL Editor, replacing both placeholders with the two actual UUIDs:

```sql
insert into public.private_members (user_id)
values
  ('REPLACE_WITH_FIRST_AUTH_USER_UUID'),
  ('REPLACE_WITH_SECOND_AUTH_USER_UUID')
on conflict (user_id) do nothing;
```

Do not run that example with the placeholder strings unchanged. Until both UUIDs are inserted, even the intended users will not be able to read or change the shared archive/ratings. Once added, both accounts can read/write the shared archive, while each account can only create, update, and delete its own rating. Other authenticated accounts are denied archive and ratings access.

The membership table exposes only a member's own row to authenticated clients and has no client-side insert/update/delete policy. Manage membership only from the Supabase SQL Editor.

## 4. Registration and profile rows

The membership migration intentionally does not change `profiles` policies or auth signup settings. The app's profile bridge still creates/updates each user's own profile row; verify that the existing `profiles` table policies permit a user to select and upsert only their own profile. Keep public signup disabled if you do not need it, or understand that non-members may create accounts but cannot access archive/ratings.

## 5. Test checklist

Use two separate browser profiles (or one normal and one private window) so the accounts do not share an auth session:

1. Register/sign in with account A and account B.
2. Add a film using A; verify it appears after refreshing and signing in as B.
3. Mark it watched and remove it; verify both actions sync for both users.
4. Add a rating with A, then with B; verify both ratings appear, but each account can only change its own rating.
5. Use Movie Night and add the result to the archive.
6. Search for a film/series, open its detail card, and verify the Russian description loads.
7. Confirm a third, non-member test account cannot read or mutate archive/ratings (if you choose to create one).
8. Check mobile layout on the iPhone viewport.

## What is and isn't automatic

- Source changes are in a review branch/PR, not merged to `main`.
- SQL migrations are files only; they have not been executed against your live Supabase project.
- No TMDB secret has been added to Vercel or Netlify from this repository. You must add the rotated token in the host dashboard.
- Run the two-account test checklist after those setup steps. Syntax checks are automated in GitHub Actions, but this is not a substitute for browser end-to-end testing.
