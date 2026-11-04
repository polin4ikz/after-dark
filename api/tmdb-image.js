// Same-origin proxy for TMDB poster images. This avoids clients directly reaching image.tmdb.org.
const ALLOWED_SIZES = new Set(["w92", "w154", "w185", "w342", "w500", "w780", "original"]);
const SAFE_POSTER_PATH = /^\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i;

module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const url = new URL(req.url, "https://after-dark.invalid");
  const path = url.searchParams.get("path") || "";
  const size = url.searchParams.get("size") || "w500";
  if (!SAFE_POSTER_PATH.test(path) || !ALLOWED_SIZES.has(size)) {
    return res.status(400).json({ error: "INVALID_POSTER_PATH" });
  }

  try {
    const upstream = await fetch(`https://image.tmdb.org/t/p/${size}${path}`, {
      headers: { accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" }
    });
    if (!upstream.ok) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(upstream.status).json({ error: "POSTER_UPSTREAM_UNAVAILABLE" });
    }
    const bytes = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "image/jpeg");
    res.setHeader("Content-Length", String(bytes.length));
    return res.status(200).send(bytes);
  } catch (error) {
    console.error("TMDB poster proxy failed", error);
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: "POSTER_UPSTREAM_UNAVAILABLE" });
  }
};
