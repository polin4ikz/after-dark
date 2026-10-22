// Narrow public catalog search for Internet Archive items (Netlify).
const MAX_QUERY_LENGTH = 120;
const SAFE_QUERY = /^[\\p{L}\\p{N}\\s'’.,:!?()&-]+$/u;

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
    "X-Content-Type-Options": "nosniff"
  };
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: { ...headers, Allow: "GET" }, body: JSON.stringify({ error: "METHOD_NOT_ALLOWED" }) };
  }
  const requestUrl = new URL(event.rawUrl || "https://after-dark.invalid/api/archive-search");
  const query = (requestUrl.searchParams.get("q") || "").trim().replace(/\\s+/g, " ");
  if (!query || query.length > MAX_QUERY_LENGTH || !SAFE_QUERY.test(query)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "INVALID_SEARCH_QUERY" }) };
  }
  try {
    const search = new URL("https://archive.org/advancedsearch.php");
    search.searchParams.set("q", 'mediatype:movies AND title:("' + query + '")');
    search.searchParams.set("fl[]", "identifier");
    search.searchParams.append("fl[]", "title");
    search.searchParams.append("fl[]", "year");
    search.searchParams.append("fl[]", "description");
    search.searchParams.set("rows", "8");
    search.searchParams.set("page", "1");
    search.searchParams.set("output", "json");
    search.searchParams.set("sort[]", "downloads desc");
    const upstream = await fetch(search, { headers: { accept: "application/json" } });
    if (!upstream.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: "ARCHIVE_SEARCH_UNAVAILABLE" }) };
    const data = await upstream.json();
    const docs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
    const results = docs.filter(item =>
      item && typeof item.identifier === "string" &&
      /^[A-Za-z0-9._-]{1,120}$/.test(item.identifier) &&
      typeof item.title === "string"
    ).map(item => ({
      identifier: item.identifier,
      title: item.title.slice(0, 300),
      year: String(item.year || "").slice(0, 4),
      description: typeof item.description === "string"
        ? item.description.slice(0, 240)
        : Array.isArray(item.description) ? String(item.description[0] || "").slice(0, 240) : ""
    }));
    return { statusCode: 200, headers, body: JSON.stringify({ results }) };
  } catch (error) {
    console.error("Internet Archive search failed", error);
    return { statusCode: 502, headers, body: JSON.stringify({ error: "ARCHIVE_SEARCH_UNAVAILABLE" }) };
  }
};
