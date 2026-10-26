// Discover film pages across the public web and extract an embedded player URL.
// This does not bypass DRM, paywalls, login requirements, or frame restrictions.
const MAX_TITLE = 120;
const MAX_PAGES = 8;
const SEARCH_HOSTS = new Set([
  "google.com", "www.google.com", "duckduckgo.com", "html.duckduckgo.com",
  "bing.com", "www.bing.com", "yandex.com", "yandex.ru", "www.yandex.ru",
  "search.yahoo.com", "yahoo.com", "www.yahoo.com"
]);
const SKIP_HOSTS = /(^|\.)(google\.[a-z.]+|duckduckgo\.com|bing\.com|yandex\.[a-z.]+|yahoo\.com|facebook\.com|instagram\.com|tiktok\.com|youtube\.com|youtu\.be|reddit\.com|pinterest\.com|twitter\.com|x\.com|wikipedia\.org|imdb\.com)$/i;
function decodeHtml(value) {
  return String(value || "").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#([0-9]+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}
function isPublicHttps(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port && u.port !== "443") return false;
    const host = u.hostname.toLowerCase().replace(/\.$/, "");
    if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
        host.endsWith(".internal") || host.endsWith(".test")) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.|224\.|::1$|fc|fd|fe80)/i.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    return true;
  } catch (_) { return false; }
}
function isSearchOrIrrelevant(raw) {
  try {
    const u = new URL(raw), host = u.hostname.toLowerCase();
    return SEARCH_HOSTS.has(host) || SKIP_HOSTS.test(host) ||
      /(^|\.)googleadservices\.com$|(^|\.)doubleclick\.net$|(^|\.)googlesyndication\.com$/.test(host);
  } catch (_) { return true; }
}
function extractPlayerUrl(html, pageUrl) {
  const candidates = [];
  const add = (raw, score = 0) => {
    if (!raw || typeof raw !== "string") return;
    const value = decodeHtml(raw.trim()).replace(/\\u0026/g, "&").replace(/\\\//g, "/");
    try {
      const u = new URL(value, pageUrl);
      if (!isPublicHttps(u.href) || isSearchOrIrrelevant(u.href)) return;
      const host = u.hostname.toLowerCase();
      const path = (host + u.pathname + u.search).toLowerCase();
      if (/ads?|banner|tracker|analytics|doubleclick|pixel|statistic/i.test(path)) return;
      if (host === new URL(pageUrl).hostname.toLowerCase() && !/player|embed|video|watch|stream/i.test(path)) return;
      const playerHint = /player|video|embed|stream|iframe|nextembed|alloha|kodik|collaps|videocdn|hdvb|hls|m3u8|manifest|playback|movie|watch/i.test(path);
      candidates.push({ url: u.href, score: score + (playerHint ? 10 : 0) });
    } catch (_) {}
  };
  const tags = String(html || "").match(/<(?:iframe|embed|video|source|object)\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attrs = {};
    const pattern = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let match;
    while ((match = pattern.exec(tag))) attrs[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
    for (const key of ["src", "data-src", "data-lazy-src", "data-url", "data-embed", "data-href", "content"]) {
      if (attrs[key]) add(attrs[key], tag.toLowerCase().startsWith("<iframe") ? 8 : 4);
    }
    for (const key of ["data-player", "data-options", "data-config", "data-setup"]) {
      if (!attrs[key]) continue;
      const config = attrs[key].replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
      for (const match of config.matchAll(/https?:\\?\/\\?\/[^"'\\\s<>]+/gi)) add(match[0], 5);
      for (const match of config.matchAll(/(?:file|src|url|embedUrl|iframe)\s*[:=]\s*["']([^"']+)["']/gi)) add(match[1], 6);
    }
  }
  // Inspect common player configuration snippets and escaped URLs embedded in scripts.
  const normalized = String(html || "").replaceAll("\\/", "/").replace(/\\u0026/gi, "&").replace(/\\u003d/gi, "=");
  for (const match of normalized.matchAll(/https?:\/\/[^\s"'<>\\]+/gi)) add(match[0], 1);
  for (const match of normalized.matchAll(/(?:file|src|source|embedUrl|iframeUrl|playerUrl|videoUrl|url)\s*[:=]\s*["']([^"']{8,1000})["']/gi)) {
    add(match[1], 7);
  }
  const unique = [...new Map(candidates.map(item => [item.url, item])).values()];
  unique.sort((a, b) => b.score - a.score);
  return unique[0]?.url || null;
}
async function fetchText(rawUrl, options = {}) {
  if (!isPublicHttps(rawUrl)) throw new Error("URL_NOT_ALLOWED");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 9000);
  try {
    const response = await fetch(rawUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
        ...(options.referer ? { Referer: options.referer } : {})
      }
    });
    if (!response.ok) {
      const error = new Error("UPSTREAM_HTTP_ERROR");
      error.status = response.status;
      error.finalUrl = response.url || rawUrl;
      throw error;
    }
    if (response.url && !isPublicHttps(response.url)) throw new Error("REDIRECT_URL_NOT_ALLOWED");
    return { html: await response.text(), finalUrl: response.url || rawUrl };
  } catch (error) {
    if (error && typeof error === "object" && !error.finalUrl) error.finalUrl = rawUrl;
    throw error;
  } finally { clearTimeout(timer); }
}
function extractSearchLinks(html, baseUrl) {
  const found = [];
  const markup = String(html || "").replace(/&amp;/gi, "&").replace(/&#x2f;/gi, "/").replaceAll("\\/", "/");
  const hrefs = [...markup.matchAll(/href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)]
    .map(match => decodeHtml(match[1] || match[2] || match[3] || ""));
  for (let href of hrefs) {
    try {
      const wrapped = new URL(href, baseUrl);
      if (SEARCH_HOSTS.has(wrapped.hostname.toLowerCase())) {
        const target = wrapped.searchParams.get("uddg") || wrapped.searchParams.get("url") ||
          wrapped.searchParams.get("q") || wrapped.searchParams.get("u");
        if (target) href = target;
      }
      const resolved = new URL(href, baseUrl);
      if (isPublicHttps(resolved.href) && !isSearchOrIrrelevant(resolved.href) &&
          !found.includes(resolved.href) && !/\.(?:jpg|jpeg|png|gif|webp|svg|css|js|pdf)(?:$|\?)/i.test(resolved.pathname)) {
        found.push(resolved.href);
      }
    } catch (_) {}
  }
  for (const match of markup.matchAll(/<link>(https?:\/\/[^<]+)<\/link>/gi)) {
    const link = decodeHtml(match[1]);
    if (isPublicHttps(link) && !isSearchOrIrrelevant(link) && !found.includes(link)) found.push(link);
  }
  return found;
}
async function searchPages(title, year) {
  const titleVariants = [...new Set([
    title,
    title.replace(/[«»„“”]/g, '"'),
    title.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim()
  ])].filter(Boolean);
  const queries = [];
  for (const variant of titleVariants.slice(0, 2)) {
    const q = [variant, year, "смотреть онлайн фильм плеер"].filter(Boolean).join(" ");
    queries.push(
      { engine: "ddg", url: "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q) },
      { engine: "bing", url: "https://www.bing.com/search?q=" + encodeURIComponent(q) },
      { engine: "google", url: "https://www.google.com/search?hl=ru&q=" + encodeURIComponent(q) }
    );
  }
  const found = [];
  const results = await Promise.all(queries.map(async query => {
    try {
      const { html } = await fetchText(query.url, { timeoutMs: 4000 });
      return extractSearchLinks(html, query.url);
    } catch (_) { return []; }
  }));
  for (const links of results) for (const link of links) {
    if (!found.includes(link)) found.push(link);
  }
  // Search results often include unrelated pages. Keep a broad set and check all candidates.
  return found.slice(0, MAX_PAGES);
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
        const { html, finalUrl } = await fetchText(pageUrl, { timeoutMs: 5000, referer: new URL(pageUrl).origin + "/" });
        const embedUrl = extractPlayerUrl(html, finalUrl);
        diagnostics.pagesChecked.push({
          host: new URL(pageUrl).hostname,
          status: "loaded",
          finalHost: new URL(finalUrl).hostname,
          embedFound: Boolean(embedUrl),
          htmlLength: html.length
        });
        if (!embedUrl) diagnostics.pagesWithoutEmbed++;
        return embedUrl ? { provider: new URL(finalUrl).hostname, pageUrl: finalUrl, embedUrl } : null;
      } catch (error) {
        diagnostics.fetchFailures++;
        diagnostics.pagesChecked.push({
          host: new URL(pageUrl).hostname,
          status: error.name === "AbortError" ? "timeout" : (error.status ? "http_error" : "fetch_failed"),
          ...(error.status ? { httpStatus: error.status } : {}),
          ...(error.code ? { code: String(error.code).slice(0, 80) } : {}),
          ...(error.message === "URL_NOT_ALLOWED" || error.message === "REDIRECT_URL_NOT_ALLOWED" ? { reason: error.message } : {})
        });
        return null;
      }
    }));
    const resolved = pageResults.find(Boolean);
    if (resolved) return res.status(200).json({ ...resolved, diagnostics });
    return res.status(404).json({
      error: "PLAYER_NOT_FOUND",
      message: "Поиск не нашёл доступный для встраивания плеер. Некоторые страницы могут требовать JavaScript, cookies или запрещать iframe.",
      diagnostics
    });
  } catch (error) {
    console.error("Film player resolution failed", error);
    return res.status(502).json({ error: "FILM_PLAYER_SEARCH_FAILED" });
  }
};
module.exports.extractPlayerUrl = extractPlayerUrl;
module.exports.isPublicHttps = isPublicHttps;
