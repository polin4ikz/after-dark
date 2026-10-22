// Same-origin TMDB image proxy. Fixed upstream host + strict path allowlist.
const ALLOWED_PATH = /^\/(w92|w154|w185|w342|w500|w780|w1280|original)\/[A-Za-z0-9_-]{1,180}\.(jpg|jpeg|png|webp)$/i;
const MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const requestUrl = new URL(req.url, "https://after-dark.invalid");
  const path = requestUrl.searchParams.get("path") || "";
  if (!ALLOWED_PATH.test(path)) {
    return res.status(400).json({ error: "TMDB_IMAGE_PATH_NOT_ALLOWED" });
  }

  try {
    const upstream = await fetch("https://image.tmdb.org/t/p" + path, {
      method: "GET",
      headers: { accept: "image/avif,image/webp,image/png,image/jpeg" },
      redirect: "error"
    });
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: "TMDB_IMAGE_UPSTREAM_ERROR" });
    }

    const contentType = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!MIME_TYPES.has(contentType)) {
      return res.status(502).json({ error: "TMDB_IMAGE_UNEXPECTED_CONTENT_TYPE" });
    }

    const bytes = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(bytes.length));
    return res.status(200).send(bytes);
  } catch (error) {
    console.error("TMDB image proxy failed", error);
    return res.status(502).json({ error: "TMDB_IMAGE_UPSTREAM_UNAVAILABLE" });
  }
};
