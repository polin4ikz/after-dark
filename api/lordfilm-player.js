// Resolve a public player iframe from one fixed film page; no caller-supplied URLs.
const SOURCE_PAGE = "https://smeh-v-vaikikia-lordfilm.ru/film/dyavol-nosit-prada-2006/";
const SOURCE_HOST = new URL(SOURCE_PAGE).hostname;
function decodeHtml(value) {
  return String(value || "").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#([0-9]+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}
function extractPlayerUrl(html) {
  const candidates = [];
  const tags = String(html || "").match(/<(?:iframe|embed|video)\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attrs = {};
    const pattern = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let match;
    while ((match = pattern.exec(tag))) attrs[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
    const raw = attrs.src || attrs["data-src"] || attrs["data-lazy-src"] || attrs["data-url"];
    if (!raw) continue;
    try {
      const url = new URL(raw, SOURCE_PAGE);
      if (url.protocol !== "https:" || url.username || url.password) continue;
      if (url.hostname === SOURCE_HOST || url.hostname.endsWith(".lordfilm")) continue;
      if (/ads?|banner|tracker|analytics|doubleclick/i.test(url.hostname + url.pathname)) continue;
      const hint = (url.hostname + url.pathname + " " + (attrs.title || "") + " " + (attrs.class || "") + " " + (attrs.id || "")).toLowerCase();
      const score = (/player|video|embed|iframe|stream|kinogo|collaps|kodik|alloha|videocdn|hdvb|cdn/i.test(hint) ? 10 : 0)
        + (tag.toLowerCase().startsWith("<iframe") ? 3 : 0);
      candidates.push({ url: url.href, score });
    } catch (_) {}
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.url || null;
}
module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(SOURCE_PAGE, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AfterDarkPlayer/1.0)", accept: "text/html,application/xhtml+xml" },
      redirect: "manual", signal: controller.signal
    });
    if (response.status >= 300 && response.status < 400)
      return res.status(502).json({ error: "LORDFILM_REDIRECTED", message: "Источник перенаправил запрос; адрес плеера не удалось определить безопасно." });
    if (!response.ok) return res.status(502).json({ error: "LORDFILM_UNAVAILABLE" });
    const html = (await response.text()).slice(0, 2000000);
    const embedUrl = extractPlayerUrl(html);
    if (!embedUrl) return res.status(404).json({ error: "PLAYER_NOT_FOUND", message: "Источник не отдал отдельный адрес плеера в HTML. Возможно, плеер создаётся скриптом или требует загрузки страницы." });
    return res.status(200).json({ provider: "LordFilm", embedUrl });
  } catch (error) {
    console.error("LordFilm player resolution failed", error);
    return res.status(502).json({ error: "LORDFILM_RESOLUTION_FAILED" });
  } finally { clearTimeout(timer); }
};
module.exports.extractPlayerUrl = extractPlayerUrl;
