// Server-side Watchmode streaming-availability proxy for Vercel.
// Set WATCHMODE_API_KEY in Vercel project environment variables. Never expose it in client code.
const ALLOWED_REGIONS = new Set(["RU", "DE", "US", "GB", "CA", "FR", "IT", "ES", "PL", "NL", "AU", "JP", "KR"]);

module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const apiKey = process.env.WATCHMODE_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "WATCHMODE_NOT_CONFIGURED" });

  const url = new URL(req.url, "https://after-dark.invalid");
  const rawId = url.searchParams.get("tmdbId") || "";
  const type = url.searchParams.get("type") || "";
  const region = (url.searchParams.get("region") || "").toUpperCase();

  if (!/^\d{1,12}$/.test(rawId) || Number(rawId) < 1) {
    return res.status(400).json({ error: "INVALID_TMDB_ID" });
  }
  if (type !== "movie" && type !== "tv") {
    return res.status(400).json({ error: "INVALID_TITLE_TYPE" });
  }
  if (!ALLOWED_REGIONS.has(region)) {
    return res.status(400).json({ error: "UNSUPPORTED_REGION" });
  }

  // Watchmode accepts TMDB-form identifiers directly, so no extra title-search call is needed.
  const titleId = (type === "tv" ? "tv-" : "movie-") + rawId;
  const upstreamUrl = new URL("https://api.watchmode.com/v1/title/" + titleId + "/sources/");
  upstreamUrl.searchParams.set("regions", region);

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: { "X-API-Key": apiKey, accept: "application/json" }
    });
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      // Do not leak provider response bodies or credentials to the browser.
      console.error("Watchmode upstream returned", upstream.status);
      return res.status(upstream.status === 400 ? 400 : upstream.status === 401 || upstream.status === 403 ? 502 : 502)
        .json({ error: upstream.status === 400 ? "WATCHMODE_REGION_OR_TITLE_UNAVAILABLE" : "WATCHMODE_UPSTREAM_UNAVAILABLE" });
    }

    const rows = Array.isArray(body) ? body : Array.isArray(body?.sources) ? body.sources : [];
    const sources = rows.filter(item => item && typeof item.name === "string")
      .map(item => {
        let link = "";
        try {
          const parsed = new URL(String(item.web_url || ""));
          if (parsed.protocol === "https:") link = parsed.href;
        } catch (_) {}
        return {
          name: item.name.slice(0, 120),
          type: String(item.type || "unknown").slice(0, 24),
          webUrl: link,
          price: typeof item.price === "string" || typeof item.price === "number" ? String(item.price).slice(0, 40) : "",
          format: typeof item.format === "string" ? item.format.slice(0, 40) : ""
        };
      })
      .filter(item => item.webUrl);
    return res.status(200).json({ region, sources });
  } catch (error) {
    console.error("Watchmode request failed", error);
    return res.status(502).json({ error: "WATCHMODE_UPSTREAM_UNAVAILABLE" });
  }
};
