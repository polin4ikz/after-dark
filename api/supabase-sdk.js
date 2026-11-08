// Explicit same-origin endpoint for the Supabase browser SDK.
// Avoids catch-all routing ambiguity for the deeply nested vendor asset path.
const SOURCES = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js",
  "https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js"
];

module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).end();
  }

  for (const url of SOURCES) {
    try {
      const upstream = await fetch(url, {
        method: req.method,
        headers: { accept: "application/javascript, text/javascript, */*" },
        redirect: "follow",
        signal: AbortSignal.timeout(20000)
      });
      if (!upstream.ok) {
        console.warn("Supabase SDK source returned:", url, upstream.status);
        continue;
      }
      const type = upstream.headers.get("content-type");
      res.setHeader("Content-Type", type && /javascript/i.test(type)
        ? type
        : "application/javascript; charset=utf-8");
      if (req.method === "HEAD") return res.status(200).end();
      const bytes = Buffer.from(await upstream.arrayBuffer());
      return res.status(200).send(bytes);
    } catch (error) {
      console.warn("Supabase SDK source unavailable:", url, error?.message || error);
    }
  }

  res.setHeader("Cache-Control", "no-store");
  return res.status(502).json({ error: "SUPABASE_SDK_UPSTREAM_UNAVAILABLE" });
};
