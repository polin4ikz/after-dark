// Find a public film page from a small allowlist of known catalog domains,
// then extract its embedded player URL. This does not bypass DRM or frame restrictions.
const SEARCH_DOMAINS = [
  "lord-film.org", "lord.kim", "lordfilm.org", "lordfilm.film",
  "smeh-v-vaikikia-lordfilm.ru", "lord-film7.org", "kinogo.inc", "kinogo.ec", "hdrezka.ag"
];
const MAX_TITLE = 120;
function decodeHtml(value) {
  return String(value || "").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#([0-9]+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}
function allowedPage(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.username && !u.password &&
      SEARCH_DOMAINS.some(domain => u.hostname === domain || u.hostname.endsWith("." + domain));
  } catch (_) { return false; }
}
function extractPlayerUrl(html, pageUrl) {
  const candidates = [];
  const tags = String(html || "").match(/<(?:iframe|embed|video|source)\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attrs = {};
    const pattern = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let match;
    while ((match = pattern.exec(tag))) attrs[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
    const raw = attrs.src || attrs["data-src"] || attrs["data-lazy-src"] || attrs["data-url"] || attrs["data-embed"];
    if (!raw) continue;
    try {
      const u = new URL(raw, pageUrl);
      if (u.protocol !== "https:" || u.username || u.password) continue;
      if (/ads?|banner|tracker|analytics|doubleclick/i.test(u.hostname + u.pathname)) continue;
      const hint = (u.hostname + u.pathname + " " + (attrs.title || "") + " " + (attrs.class || "") + " " + (attrs.id || "")).toLowerCase();
      const score = (/player|video|embed|stream|iframe|nextembed|alloha|kodik|collaps|videocdn|hdvb/i.test(hint) ? 10 : 0)
        + (tag.toLowerCase().startsWith("<iframe") ? 4 : 0)
        + (tag.toLowerCase().startsWith("<video") || tag.toLowerCase().startsWith("<source") ? 2 : 0);
      candidates.push({ url: u.href, score });
    } catch (_) {}
  }
  // Some catalog templates construct their iframe from JavaScript instead of a literal tag.
  // Inspect only explicit player/embed-like HTTPS URLs already present in that page's HTML.
  const normalizedHtml = String(html || "").replaceAll("\\/", "/");
  const rawUrls = normalizedHtml.match(/https?:\/\/[^\s"'<>\\]+/gi) || [];
  for (const raw of rawUrls) {
    const cleaned = decodeHtml(raw).replace(/[),;]+$/g, "");
    try {
      const u = new URL(cleaned);
      if (u.protocol !== "https:" || u.username || u.password) continue;
      if (u.hostname === new URL(pageUrl).hostname) continue;
      if (/ads?|banner|tracker|analytics|doubleclick/i.test(u.hostname + u.pathname)) continue;
      const hint = (u.hostname + u.pathname + u.search).toLowerCase();
      if (!/player|embed|iframe|video_ext|nextembed|alloha|kodik|collaps|videocdn|hdvb|shortener/i.test(hint)) continue;
      candidates.push({ url: u.href, score: 8 });
    } catch (_) {}
  }
  const unique = [...new Map(candidates.map(item => [item.url, item])).values()];
  unique.sort((a, b) => b.score - a.score);
  return unique[0]?.url || null;
}
async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error("UPSTREAM_UNAVAILABLE");
    return await response.text();
  } finally { clearTimeout(timer); }
}
async function searchPages(title, year) {
  const siteQuery = SEARCH_DOMAINS.map(domain => "site:" + domain).join(" OR ");
  const queries = [
    [title, year, "смотреть онлайн", siteQuery].filter(Boolean).join(" "),
    [title, year, "film online", siteQuery].filter(Boolean).join(" ")
  ];
  const found = [];
  for (const query of queries) {
    try {
      const url = new URL("https://www.bing.com/search");
      url.searchParams.set("format", "rss");
      url.searchParams.set("q", query);
      const xml = await fetchText(url.href, { headers: { "User-Agent": "Mozilla/5.0", accept: "application/rss+xml,application/xml,text/xml" } });
      const links = [...xml.matchAll(/<link>(https?:\/\/[^<]+)<\/link>/gi)].map(m => decodeHtml(m[1]));
      for (const link of links) {
        if (allowedPage(link) && !found.includes(link)) found.push(link);
        if (found.length >= 8) return found;
      }
    } catch (_) {}
  }
  return found;
}
module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "METHOD_NOT_ALLOWED" }); }
  const requestUrl = new URL(req.url, "https://after-dark.invalid");
  const title = (requestUrl.searchParams.get("title") || "").trim().replace(/\s+/g, " ");
  const year = (requestUrl.searchParams.get("year") || "").trim();
  if (!title || title.length > MAX_TITLE || !/[\p{L}\p{N}]/u.test(title) || (year && !/^\d{4}$/.test(year))) {
    return res.status(400).json({ error: "INVALID_FILM_QUERY" });
  }
  try {
    const pages = await searchPages(title, year);
    for (const pageUrl of pages) {
      try {
        const html = await fetchText(pageUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; AfterDarkPlayer/1.0)", accept: "text/html,application/xhtml+xml" } });
        const embedUrl = extractPlayerUrl(html, pageUrl);
        if (embedUrl) return res.status(200).json({ provider: new URL(pageUrl).hostname, pageUrl, embedUrl });
      } catch (_) {}
    }
    return res.status(404).json({ error: "PLAYER_NOT_FOUND", message: "Не удалось автоматически найти доступный iframe плеера для этого фильма. Источник мог изменить разметку или создавать плеер скриптом." });
  } catch (error) {
    console.error("Film player resolution failed", error);
    return res.status(502).json({ error: "FILM_PLAYER_SEARCH_FAILED" });
  }
};
module.exports.extractPlayerUrl = extractPlayerUrl;
module.exports.allowedPage = allowedPage;
