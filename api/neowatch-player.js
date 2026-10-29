// Optional NeoWatch/NeoMovies iframe discovery adapter.
// It only requests fixed public API routes; it does not proxy video or bypass access controls.
const API_BASE = "https://api.neome.uk";
const PROVIDERS = [
  { id: "collaps", label: "Collaps" },
  { id: "alloha", label: "Alloha" },
  { id: "lumex", label: "Lumex" },
  { id: "vibix", label: "Vibix" },
  { id: "hdvb", label: "HDVB" }
];

function cleanText(value, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function normalizeTitle(value) {
  return String(value || "").toLocaleLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function parseKpId(value) {
  const match = String(value || "").match(/^(?:kp[_-]?)?(\d{1,12})$/i);
  return match ? match[1] : "";
}
function safeEmbedUrl(raw) {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return "";
    if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
        host.endsWith(".internal") || /^(127\.|10\.|192\.168\.|169\.254\.|0\.|224\.|::1$|fc|fd|fe80)/i.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return "";
    return url.href;
  } catch (_) { return ""; }
}
function extractEmbed(html, baseUrl) {
  const text = String(html || "").slice(0, 500000);
  const tags = text.match(/<iframe\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const match = tag.match(/\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    const raw = (match && (match[1] || match[2] || match[3]) || "").replace(/&amp;/gi, "&");
    if (!raw || /ads?|banner|tracker|analytics|doubleclick/i.test(raw)) continue;
    const safe = safeEmbedUrl(new URL(raw, baseUrl).href);
    if (safe) return safe;
  }
  return "";
}
async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "AfterDark/1.0 (+source discovery)" },
    redirect: "manual",
    signal: AbortSignal.timeout(6500)
  });
  if (!response.ok) throw new Error("UPSTREAM_" + response.status);
  return response.json();
}
async function fetchText(url) {
  const response = await fetch(url, {
    headers: { accept: "text/html", "user-agent": "AfterDark/1.0 (+source discovery)" },
    redirect: "manual",
    signal: AbortSignal.timeout(6500)
  });
  if (!response.ok) throw new Error("PROVIDER_" + response.status);
  return response.text();
}
module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }
  const title = cleanText(req.query && req.query.title);
  const year = cleanText(req.query && req.query.year, 4);
  const season = Number.parseInt(req.query && req.query.season, 10);
  const episode = Number.parseInt(req.query && req.query.episode, 10);
  if (!title || title.length < 2 || !/^[\p{L}\p{N}\s'’.,&:;!?+()/_\-–—]+$/u.test(title)) {
    return res.status(400).json({ error: "INVALID_TITLE" });
  }
  if (year && !/^\d{4}$/.test(year)) return res.status(400).json({ error: "INVALID_YEAR" });
  const isSeries = Number.isInteger(season) && season >= 1 && season <= 100 &&
    Number.isInteger(episode) && episode >= 1 && episode <= 500;
  try {
    const searchUrl = new URL("/api/v1/search", API_BASE);
    searchUrl.searchParams.set("query", title);
    const payload = await fetchJson(searchUrl.href);
    const results = Array.isArray(payload && payload.data && payload.data.results) ? payload.data.results : [];
    const wanted = normalizeTitle(title);
    const match = results.find(item => {
      const id = parseKpId(item && item.id);
      if (!id) return false;
      const names = [item.title, item.originalTitle].map(normalizeTitle).filter(Boolean);
      const titleMatch = names.some(name => name === wanted || name.startsWith(wanted + " ") || wanted.startsWith(name + " "));
      const resultYear = item.year == null ? "" : String(item.year).slice(0, 4);
      return titleMatch && (!year || !resultYear || year === resultYear);
    });
    if (!match) return res.status(200).json({ provider: "NeoWatch", sources: [], message: "Совпадение по названию и году не найдено." });
    const kpId = parseKpId(match.id);
    const sources = [];
    for (const provider of PROVIDERS) {
      const url = new URL("/api/v1/players/" + provider.id + "/kp/" + kpId, API_BASE);
      if (isSeries) {
        url.searchParams.set("season", String(season));
        url.searchParams.set("episode", String(episode));
      }
      try {
        const html = await fetchText(url.href);
        const embedUrl = extractEmbed(html, url.href);
        if (embedUrl && !sources.some(source => source.embedUrl === embedUrl)) {
          sources.push({ provider: provider.label, embedUrl, kpId, title: cleanText(match.title || title, 160), year: match.year || year || null });
        }
      } catch (_) {
        // A missing provider token/config should not prevent trying the next provider.
      }
    }
    return res.status(200).json({
      provider: "NeoWatch",
      title: cleanText(match.title || title, 160),
      kpId,
      sources,
      message: sources.length ? "" : "NeoWatch не вернул доступные iframe-источники. Возможно, провайдеры не настроены на стороне API."
    });
  } catch (error) {
    const timeout = error && (error.name === "TimeoutError" || error.name === "AbortError");
    return res.status(502).json({
      error: timeout ? "NEOWATCH_TIMEOUT" : "NEOWATCH_UNAVAILABLE",
      message: "Сервис NeoWatch временно недоступен; остальные источники After Dark не затронуты."
    });
  }
};
module.exports.parseKpId = parseKpId;
module.exports.normalizeTitle = normalizeTitle;
module.exports.safeEmbedUrl = safeEmbedUrl;
module.exports.extractEmbed = extractEmbed;
