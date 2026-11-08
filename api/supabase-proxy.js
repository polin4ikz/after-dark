// Same-origin Supabase gateway for Vercel's static API-functions runtime.
// Vercel rewrites /api/supabase/* here because plain /api functions do not support catch-all files.
const UPSTREAM = "https://kwphiydboppdpmdihpca.supabase.co";
const ALLOWED = ["/auth/v1/", "/rest/v1/", "/storage/v1/", "/functions/v1/"];
const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");

  const method = String(req.method || "GET").toUpperCase();
  if (!METHODS.has(method)) {
    res.setHeader("Allow", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const incoming = new URL(req.url || "/", "https://after-dark.invalid");
  const rawPath = incoming.searchParams.get("path") || "";
  const path = "/" + rawPath.replace(/^\\/+/, "");
  if (path.includes("\\\\") || path.split("/").includes("..") || !ALLOWED.some(prefix => path.startsWith(prefix))) {
    return res.status(404).json({ error: "SUPABASE_ROUTE_NOT_ALLOWED" });
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers || {})) {
    const name = key.toLowerCase();
    if (["host", "connection", "content-length", "transfer-encoding", "accept-encoding"].includes(name)) continue;
    if (Array.isArray(value)) headers.set(name, value.join(", "));
    else if (value != null) headers.set(name, String(value));
  }

  try {
    let body;
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      const chunks = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      body = Buffer.concat(chunks);
    }

    const query = new URLSearchParams(incoming.searchParams);
    query.delete("path");
    const upstreamUrl = UPSTREAM + path + (query.size ? "?" + query.toString() : "");
    const upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(25000)
    });

    for (const name of [
      "content-type", "content-range", "accept-ranges", "content-disposition",
      "etag", "last-modified", "location", "retry-after", "content-profile",
      "preference-applied", "x-request-id"
    ]) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    const bytes = Buffer.from(await upstream.arrayBuffer());
    return res.status(upstream.status).send(bytes);
  } catch (error) {
    console.error("Supabase proxy request failed:", error);
    return res.status(502).json({ error: "SUPABASE_UPSTREAM_UNAVAILABLE" });
  }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
