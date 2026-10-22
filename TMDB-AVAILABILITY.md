# TMDB availability and poster proxy

After Dark already requests TMDB metadata through the same-origin `/api/tmdb` endpoint; the browser does not call `api.themoviedb.org` directly. Poster URLs were still pointing directly to `image.tmdb.org`, so those requests could fail independently in networks that restrict TMDB image delivery.

This change routes poster requests through `/api/tmdb-image` on the same host as After Dark. The server-side function fetches from the fixed TMDB image host, validates a strict poster-path allowlist, rejects redirects and unexpected MIME types, and sets long-lived cache headers. The Netlify function and redirect are included as well.

This improves the chance that posters load without a VPN when the After Dark host is reachable and its serverless runtime can reach TMDB. It cannot guarantee that TMDB itself is reachable from the hosting provider, and it cannot make the third-party video provider available in a region where that provider is blocked.

No Supabase tables, policies, credentials, ratings, or archive rows are changed.