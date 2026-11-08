// Same-origin, allowlisted CDN gateway for browser libraries.
// This keeps critical scripts on the After Dark origin for networks that block public CDNs.
const PREFIX = "/api/vendor";
const ALLOWED = [
  /^\/@supabase\/supabase-js@2$/,
  /^\/hls\.js@1\.5\.18\/dist\/hls\.min\.js$/,
  /^\/dashjs@4\.7\.4\/dist\/dash\.all\.min\.js$/,
  /^\/mattebox@0\.15\.0\/dist\/cdn\/mattebox\.min\.js$/,
  /^\/player-venom@0\.3\.6\/dist\/[A-Za-z0-9._/-]+$/
];

module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).end();
  }

  const incoming = new URL(req.url || "/", "https://after-dark.invalid");
  if (!incoming.pathname.startsWith(PREFIX + "/")) {
    return res.status(404).end();
  }
  const path = incoming.pathname.slice(PREFIX.length);
  if (path.includes("\\") || path.split("/").includes("..") || !ALLOWED.some(pattern => pattern.test(path))) {
    return res.status(404).json({ error: "VENDOR_ASSET_NOT_ALLOWED" });
  }

  const urls = [
    "https://cdn.jsdelivr.net/npm" + path,
    "https://unpkg.com" + path
  ];
  try {
    let upstream;
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          method: req.method,
          headers: { accept: req.headers.accept || "*/*" },
          redirect: "follow",
          signal: AbortSignal.timeout(20000)
        });
        if (response.ok) {
          upstream = response;
          break;
        }
      } catch (error) {
        console.warn("Vendor CDN unavailable:", url, error?.message || error);
      }
    }
    if (!upstream) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(502).json({ error: "VENDOR_ASSET_UNAVAILABLE" });
    }

    const type = upstream.headers.get("content-type");
    if (type) res.setHeader("Content-Type", type);
    const cache = upstream.headers.get("cache-control");
    if (cache && /no-store|private/i.test(cache)) res.setHeader("Cache-Control", "public, s-maxage=3600");
    if (req.method === "HEAD") return res.status(200).end();
    const bytes = Buffer.from(await upstream.arrayBuffer());
    return res.status(200).send(bytes);
  } catch (error) {
    console.error("Vendor asset proxy failed:", error);
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: "VENDOR_ASSET_UNAVAILABLE" });
  }
};