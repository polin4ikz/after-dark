// Same-origin proxy for the optional Neome source-catalog API.
// The client can only request a validated IMDb title ID; upstream host/path are fixed.
module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=900");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const url = new URL(req.url || "/", "https://after-dark.invalid");
  const match = url.pathname.match(/^\/api\/neome\/(tt\d{5,12})$/);
  if (!match) return res.status(400).json({ error: "INVALID_IMDB_ID" });

  try {
    const upstream = await fetch("https://api.neome.uk/api/v1/player/cdn/imdb/" + match[1], {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20000)
    });
    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
    if (!upstream.ok) res.setHeader("Cache-Control", "no-store");
    return res.send(body);
  } catch (error) {
    console.error("Neome source catalog request failed", error);
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: "NEOME_UPSTREAM_UNAVAILABLE" });
  }
};
