// Same-origin TMDB image proxy. Fixed upstream host + strict path allowlist.
const ALLOWED_PATH = /^\/(w92|w154|w185|w342|w500|w780|w1280|original)\/[A-Za-z0-9_-]{1,180}\.(jpg|jpeg|png|webp)$/i;
const MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

exports.handler = async (event) => {
  const headers = {
    "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    "X-Content-Type-Options": "nosniff"
  };
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: { ...headers, Allow: "GET" }, body: JSON.stringify({ error: "METHOD_NOT_ALLOWED" }) };
  }

  const requestUrl = new URL(event.rawUrl || "https://after-dark.invalid/api/tmdb-image");
  const path = requestUrl.searchParams.get("path") || "";
  if (!ALLOWED_PATH.test(path)) {
    return { statusCode: 400, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify({ error: "TMDB_IMAGE_PATH_NOT_ALLOWED" }) };
  }

  try {
    const upstream = await fetch("https://image.tmdb.org/t/p" + path, {
      method: "GET",
      headers: { accept: "image/avif,image/webp,image/png,image/jpeg" },
      redirect: "error"
    });
    if (!upstream.ok) {
      return { statusCode: upstream.status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify({ error: "TMDB_IMAGE_UPSTREAM_ERROR" }) };
    }

    const contentType = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!MIME_TYPES.has(contentType)) {
      return { statusCode: 502, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify({ error: "TMDB_IMAGE_UNEXPECTED_CONTENT_TYPE" }) };
    }

    const bytes = Buffer.from(await upstream.arrayBuffer());
    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": contentType, "Content-Length": String(bytes.length) },
      isBase64Encoded: true,
      body: bytes.toString("base64")
    };
  } catch (error) {
    console.error("TMDB image proxy failed", error);
    return { statusCode: 502, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify({ error: "TMDB_IMAGE_UPSTREAM_UNAVAILABLE" }) };
  }
};
