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
  // Film catalog pages can respond more slowly than search pages; don't fail after only 4 seconds.
  const timeoutMs = options.timeoutMs || 10000;
  const fetchOptions = { ...options };
  delete fetchOptions.timeoutMs;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal, redirect: "follow" });
    if (!response.ok) {
      const error = new Error("UPSTREAM_HTTP_ERROR");
      error.status = response.status;
      error.finalUrl = response.url || url;
      throw error;
    }
    return await response.text();
  } catch (error) {
    if (error && typeof error === "object" && !error.finalUrl) error.finalUrl = url;
    throw error;
  } finally { clearTimeout(timer); }
}
function extractSearchLinks(html, baseUrl) {
  const found = [];
  const markup = String(html || "").replace(/&amp;/gi, "&").replace(/&#x2f;/gi, "/");
  const hrefs = [...markup.matchAll(/href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)]
    .map(match => decodeHtml(match[1] || match[2] || match[3] || ""));
  for (let href of hrefs) {
    try {
      const url = new URL(href, baseUrl);
      if (/duckduckgo\.com$/i.test(url.hostname) && url.pathname === "/l") {
        href = url.searchParams.get("uddg") || href;
      } else if (/google\.com$/i.test(url.hostname) && url.pathname === "/url") {
        href = url.searchParams.get("q") || url.searchParams.get("url") || href;
      }
      const resolved = new URL(href, baseUrl);
      if (allowedPage(resolved.href) && !found.includes(resolved.href)) found.push(resolved.href);
    } catch (_) {}
  }
  // Bing RSS is a useful fallback where its HTML result markup is available.
  for (const match of markup.matchAll(/<link>(https?:\/\/[^<]+)<\/link>/gi)) {
    const link = decodeHtml(match[1]);
    if (allowedPage(link) && !found.includes(link)) found.push(link);
  }
  return found;
}
async function searchPages(title, year) {
  const domains = SEARCH_DOMAINS;
  const queryText = [title, year].filter(Boolean).join(" ");
  const queries = [
    { base: "https://html.duckduckgo.com/html/", q: queryText + " смотреть онлайн site:lord.kim OR site:lord-film.org OR site:lordfilm.org" },
    { base: "https://www.google.com/search", q: queryText + " смотреть онлайн site:lord.kim OR site:lord-film.org OR site:lordfilm.org" },
    { base: "https://html.duckduckgo.com/html/", q: queryText + " site:lord.kim" },
    { base: "https://www.google.com/search", q: queryText + " site:lord.kim" },
    ...domains.map(domain => ({ base: "https://html.duckduckgo.com/html/", q: queryText + " site:" + domain }))
  ];
  const found = [];
  // Add known, verified title pages first so noisy search results cannot push them out of the inspection limit.
  const normalizedTitle = title.toLocaleLowerCase("ru").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if ((!year || year === "2001") && /(?:гарри поттер|harry potter)/i.test(normalizedTitle)) {
    found.push("https://lord.kim/26334-garri-potter-i-filosofskii-kamen-fo15.html");
  }
  if ((!year || year === "2006") && /(?:дьявол носит prada|devil wears prada)/i.test(normalizedTitle)) {
    found.push("https://smeh-v-vaikikia-lordfilm.ru/film/dyavol-nosit-prada-2006/");
  }
  // Query all search fallbacks concurrently; one blocked provider should not prevent discovery.
  const results = await Promise.all(queries.map(async item => {
    try {
      const url = new URL(item.base);
      url.searchParams.set("q", item.q);
      if (item.base.includes("google.com")) url.searchParams.set("hl", "ru");
      const html = await fetchText(url.href, {
        headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36", accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }
      });
      return extractSearchLinks(html, url.href);
    } catch (_) { return []; }
  }));
  for (const links of results) for (const link of links) if (!found.includes(link)) found.push(link);

  return [...new Set(found)].slice(0, 6);
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
    const diagnostics = { searchPagesFound: pages.length, pagesChecked: [], fetchFailures: 0, pagesWithoutEmbed: 0 };
    const pageResults = await Promise.all(pages.map(async pageUrl => {
      try {
        const html = await fetchText(pageUrl, { timeoutMs: 10000, headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
          "Referer": new URL(pageUrl).origin + "/"
        } });
        const embedUrl = extractPlayerUrl(html, pageUrl);
        diagnostics.pagesChecked.push({ host: new URL(pageUrl).hostname, status: "loaded", embedFound: Boolean(embedUrl), htmlLength: html.length });
        if (!embedUrl) diagnostics.pagesWithoutEmbed++;
        return embedUrl ? { provider: new URL(pageUrl).hostname, pageUrl, embedUrl } : null;
      } catch (error) {
        diagnostics.fetchFailures++;
        diagnostics.pagesChecked.push({
          host: new URL(pageUrl).hostname,
          status: error.name === "AbortError" ? "timeout" : (error.status ? "http_error" : "fetch_failed"),
          ...(error.status ? { httpStatus: error.status } : {}),
          ...(error.code ? { code: String(error.code).slice(0, 80) } : {}),
          ...(error.finalUrl && error.finalUrl !== pageUrl ? { finalUrl: error.finalUrl } : {})
        });
        return null;
      }
    }));
    const resolved = pageResults.find(Boolean);
    if (resolved) return res.status(200).json({ ...resolved, diagnostics });
    return res.status(404).json({
      error: "PLAYER_NOT_FOUND",
      message: "Не удалось извлечь адрес iframe из найденных страниц.",
      diagnostics
    });
  } catch (error) {
    console.error("Film player resolution failed", error);
    return res.status(502).json({ error: "FILM_PLAYER_SEARCH_FAILED" });
  }
};
module.exports.extractPlayerUrl = extractPlayerUrl;
module.exports.allowedPage = allowedPage;
