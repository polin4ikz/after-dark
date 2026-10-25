// Resolve verified, openly licensed full-length films from Internet Archive.
// A catalog hit alone is never considered playable: metadata must expose an explicit
// public-domain/Creative Commons license and a video file with a plausible feature runtime.
const MAX_QUERY_LENGTH = 120;
const SAFE_QUERY = /^[\p{L}\p{N}\s'’.,&:;!?+()/_\-–—]+$/u;
const VIDEO_FORMATS = /\b(mpeg4|h\.264|webm|quicktime)\b/i;
const MIN_DURATION_SECONDS = 40 * 60;

function parseDuration(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value || "").trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  const parts = text.split(":").map(Number);
  if (parts.length < 2 || parts.some(n => !Number.isFinite(n) || n < 0)) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function hasOpenLicense(metadata) {
  const candidates = [
    metadata && metadata.licenseurl,
    metadata && metadata.license,
    metadata && metadata.rights
  ].flat().filter(value => typeof value === "string").join(" ").toLowerCase();
  return /public.?domain|creativecommons\.org\/(licenses|publicdomain)/i.test(candidates);
}

function normalizeTitle(value) {
  return String(value || "").toLocaleLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("UPSTREAM_UNAVAILABLE");
  return response.json();
}

async function resolveCandidate(item) {
  if (!item || typeof item.identifier !== "string" || !/^[A-Za-z0-9._-]{1,120}$/.test(item.identifier)) return null;
  const data = await fetchJson("https://archive.org/metadata/" + encodeURIComponent(item.identifier));
  const metadata = data && data.metadata || {};
  if (!hasOpenLicense(metadata)) return null;
  const files = Array.isArray(data.files) ? data.files : [];
  const playable = files.find(file => {
    if (!file || typeof file.name !== "string" || !VIDEO_FORMATS.test(String(file.format || "").trim())) return false;
    // Prefer browser-friendly files so the site can use its own video controls.
    const browserPlayable = /\.(mp4|m4v|webm)$/i.test(file.name);
    if (!browserPlayable) return false;
    const duration = parseDuration(file.length || file.runtime || file.duration);
    return duration >= MIN_DURATION_SECONDS && !/sample|preview|trailer|teaser|thumb/i.test(file.name);
  });
  if (!playable) return null;
  const title = String(metadata.title || item.title || "").slice(0, 300);
  const year = String(metadata.year || item.year || "").slice(0, 4);
  const duration = parseDuration(playable.length || playable.runtime || playable.duration);
  const wanted = normalizeTitle(item._wantedTitle);
  const actual = normalizeTitle(title);
  const requestedYear = String(item._wantedYear || "").slice(0, 4);
  const titleWithYear = normalizeTitle(String(item._wantedTitle || "") + " " + requestedYear);
  const exactTitle = Boolean(wanted && (actual === wanted || (requestedYear && actual === titleWithYear)));
  const titleMatch = exactTitle || Boolean(wanted && (actual.startsWith(wanted + " ") || wanted.startsWith(actual + " ")));
  if (!titleMatch) return null;
  if (requestedYear && year && requestedYear !== year) return null;
  return {
    provider: "Internet Archive",
    identifier: item.identifier,
    title,
    year,
    durationSeconds: Math.round(duration),
    licenseUrl: String(metadata.licenseurl || metadata.license || metadata.rights || "").slice(0, 500),
    embedUrl: "https://archive.org/embed/" + encodeURIComponent(item.identifier),
    directUrl: "https://archive.org/download/" + encodeURIComponent(item.identifier) + "/" + playable.name.split("/").map(encodeURIComponent).join("/"),
    format: String(playable.format || "").slice(0, 80),
    confidence: exactTitle && (!requestedYear || !year || requestedYear === year) ? "high" : "review"
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=900");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }
  const requestUrl = new URL(req.url, "https://after-dark.invalid");
  const query = (requestUrl.searchParams.get("q") || "").trim().replace(/\s+/g, " ");
  const year = (requestUrl.searchParams.get("year") || "").trim();
  if (!query || query.length > MAX_QUERY_LENGTH || !SAFE_QUERY.test(query) || (year && !/^\d{4}$/.test(year))) {
    return res.status(400).json({ error: "INVALID_SEARCH_QUERY" });
  }
  try {
    const search = new URL("https://archive.org/advancedsearch.php");
    search.searchParams.set("q", 'mediatype:movies AND title:("' + query + '") AND (licenseurl:"https://creativecommons.org/publicdomain/mark/1.0/" OR licenseurl:"https://creativecommons.org/publicdomain/zero/1.0/" OR licenseurl:"https://creativecommons.org/licenses/by/4.0/" OR licenseurl:"https://creativecommons.org/licenses/by-sa/4.0/")');
    for (const field of ["identifier", "title", "year"]) search.searchParams.append("fl[]", field);
    search.searchParams.set("rows", "8");
    search.searchParams.set("page", "1");
    search.searchParams.set("output", "json");
    search.searchParams.set("sort[]", "downloads desc");
    const data = await fetchJson(search);
    const docs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
    const candidates = docs
      .filter(item => item && typeof item.identifier === "string" && typeof item.title === "string")
      .map(item => ({ ...item, _wantedTitle: query, _wantedYear: year }));
    const settled = await Promise.allSettled(candidates.map(resolveCandidate));
    const results = settled.filter(item => item.status === "fulfilled" && item.value)
      .map(item => item.value)
      .sort((a, b) => (a.confidence === "high" ? 0 : 1) - (b.confidence === "high" ? 0 : 1));
    return res.status(200).json({ results, checked: candidates.length });
  } catch (error) {
    console.error("Internet Archive source resolution failed", error);
    return res.status(502).json({ error: "WATCH_SOURCE_SEARCH_UNAVAILABLE" });
  }
};

module.exports.parseDuration = parseDuration;
module.exports.hasOpenLicense = hasOpenLicense;
module.exports.normalizeTitle = normalizeTitle;
