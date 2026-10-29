// Kodik source discovery adapter for the After Dark test branch.
// Requires KODIK_API_TOKEN in the Vercel Preview environment.
// Only returns HTTPS embed links published by Kodik; does not proxy media.
const API_BASE = "https://kodik-api.com/search";
const ALLOWED_HOSTS = new Set([
  "kodik.info", "kodik.cc", "kodik.club", "kodik.biz",
  "kodik.life", "kodik.lat", "kodik.online"
]);
function clean(value, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function normalize(value) {
  return String(value || "").toLocaleLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function safeEmbed(raw) {
  try {
    const url = new URL(raw.startsWith("//") ? "https:" + raw : raw);
    if (url.protocol !== "https:" || url.username || url.password ||
        (url.port && url.port !== "443") || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return "";
    return url.href;
  } catch (_) { return ""; }
}
module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }
  const title = clean(req.query && req.query.title);
  const year = clean(req.query && req.query.year, 4);
  if (!title || title.length < 2 || !/^[\p{L}\p{N}\s'’.,&:;!?+()/_\-–—]+$/u.test(title)) {
    return res.status(400).json({ error: "INVALID_TITLE" });
  }
  if (year && !/^\d{4}$/.test(year)) return res.status(400).json({ error: "INVALID_YEAR" });
  const token = process.env.KODIK_API_TOKEN;
  if (!token) {
    return res.status(503).json({
      error: "KODIK_NOT_CONFIGURED",
      message: "Для Kodik нужен API-токен. Он должен храниться только в переменных окружения Vercel Preview."
    });
  }
  try {
    const url = new URL(API_BASE);
    url.searchParams.set("token", token);
    url.searchParams.set("title", title);
    url.searchParams.set("limit", "50");
    url.searchParams.set("with_seasons", "true");
    const upstream = await fetch(url.href, {
      method: "GET",
      headers: { accept: "application/json", "user-agent": "AfterDark/1.0 source discovery" },
      signal: AbortSignal.timeout(7000)
    });
    if (!upstream.ok) {
      return res.status(upstream.status === 401 || upstream.status === 403 ? 502 : 503).json({
        error: "KODIK_UPSTREAM_ERROR",
        message: upstream.status === 401 || upstream.status === 403
          ? "Kodik отклонил API-токен или доступ к API."
          : "Kodik временно не отвечает."
      });
    }
    const payload = await upstream.json();
    const rows = Array.isArray(payload && payload.results) ? payload.results : [];
    const wanted = normalize(title);
    const sources = [];
    for (const item of rows) {
      const itemTitle = clean(item && item.title, 180);
      const originalTitle = clean(item && item.title_orig, 180);
      const aliases = [itemTitle, originalTitle, clean(item && item.other_title, 400)]
        .flatMap(value => value.split(/[\/|;]/)).map(normalize).filter(Boolean);
      const matchesTitle = aliases.some(name => name === wanted ||
        name.startsWith(wanted + " ") || wanted.startsWith(name + " "));
      const itemYear = item && item.year != null ? String(item.year).slice(0, 4) : "";
      if (!matchesTitle || (year && itemYear && year !== itemYear)) continue;
      const translation = item && item.translation || {};
      const kind = String(translation.type || "").toLowerCase();
      if (kind && kind !== "voice") continue;
      const embedUrl = safeEmbed(item && item.link || "");
      if (!embedUrl || sources.some(source => source.embedUrl === embedUrl)) continue;
      sources.push({
        provider: "Kodik",
        embedUrl,
        title: itemTitle || title,
        year: itemYear || null,
        translation: clean(translation.title, 100) || "Озвучка не указана",
        quality: clean(item && item.quality, 40),
        type: clean(item && item.type, 40)
      });
      if (sources.length >= 24) break;
    }
    sources.sort((a, b) => {
      const aVoice = /рус|ru|дубляж|многоголос|одноголос|lostfilm|кубик/i.test(a.translation) ? 0 : 1;
      const bVoice = /рус|ru|дубляж|многоголос|одноголос|lostfilm|кубик/i.test(b.translation) ? 0 : 1;
      return aVoice - bVoice;
    });
    return res.status(200).json({
      provider: "Kodik",
      sources,
      message: sources.length ? "" : "Kodik не нашёл точного совпадения с озвучкой для этого названия."
    });
  } catch (error) {
    return res.status(502).json({
      error: "KODIK_UNAVAILABLE",
      message: "Не удалось связаться с Kodik. Попробуй ещё раз позже."
    });
  }
};
