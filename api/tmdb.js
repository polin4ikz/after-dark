// Server-side TMDB proxy for Vercel.
// Configure TMDB_BEARER_TOKEN as a server-side environment variable. Never commit it.
const ALLOWED_PATHS = [
  /^\/search\/multi$/,
  /^\/discover\/(movie|tv)$/,
  /^\/(movie|tv)\/\d+$/,
  /^\/(movie|tv)\/\d+\/watch\/providers$/
];

module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const token = process.env.TMDB_BEARER_TOKEN;
  if (!token) {
    return res.status(503).json({ error: "TMDB_PROXY_NOT_CONFIGURED" });
  }

  const requestUrl = new URL(req.url, "https://after-dark.invalid");
  const path = requestUrl.searchParams.get("path") || "";
  if (!ALLOWED_PATHS.some((pattern) => pattern.test(path))) {
    return res.status(400).json({ error: "TMDB_PATH_NOT_ALLOWED" });
  }

  const params = new URLSearchParams();
  for (const [key, value] of requestUrl.searchParams.entries()) {
    if (key === "path") continue;
    if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(key) || value.length > 500) {
      return res.status(400).json({ error: "INVALID_QUERY_PARAMETER" });
    }
    params.append(key, value);
  }

  try {
    const upstreamUrl = `https://api.themoviedb.org/3${path}${params.size ? `?${params.toString()}` : ""}`;
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, accept: "application/json" }
    });
    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
    return res.send(body);
  } catch (error) {
    console.error("TMDB upstream request failed", error);
    return res.status(502).json({ error: "TMDB_UPSTREAM_UNAVAILABLE" });
  }
};
