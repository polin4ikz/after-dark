# After Dark — player foundation, stage 1

This is a deliberately small, additive step on top of `fix/internal-stability`.

## What works in this stage
- Adds a `WATCH` action to archive cards, Movie Night result actions, and the film detail window.
- Opens a responsive player overlay using the site's existing bordeaux/milk visual style.
- Accepts official HTTPS links for YouTube, Vimeo, and Archive.org and normalizes them to their embed endpoints.
- Allows fullscreen when the provider allows it.
- Stops playback by removing the iframe when the player closes.
- Remembers a chosen source in this browser's local storage for the matching TMDB movie/series ID, so it survives refreshes on the same device. Stored URLs are revalidated before use.

## Deliberate limits
- Source discovery is not connected yet: a viewer must paste a link to a video they are authorized to watch and embed.
- A supported domain does not guarantee that a specific video allows embedding; the provider may refuse it or require sign-in.
- This step does not save playback progress and does not write to Supabase. Source links are local to the browser/device and are not shared with the other account. Cross-origin iframe providers expose different playback APIs; progress tracking needs a provider-specific adapter in the next step.
- Only use sources whose rights and embed settings permit this use. This is not a mechanism for bypassing paywalls, DRM, or provider restrictions.

## Validation
CI checks JavaScript syntax and runs `tests/watch-player.test.js`, including accepted URL normalization and rejection of unsupported or insecure URLs.
