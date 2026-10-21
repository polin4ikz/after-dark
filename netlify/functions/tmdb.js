// Server-side TMDB proxy for Netlify.
// Configure TMDB_BEARER_TOKEN in Netlify environment variables. Never commit it.
const ALLOWED_PATHS = [
  /^\/search\/multi$/,
  /^\/discover\/(movie|tv)$/,
  /^\/(movie|tv)\/\d+$/
];

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    "X-Content-Type-Options": "nosniff"
  };

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: { ...headers, Allow: "GET" }, body: JSON.stringify({ error: "METHOD_NOT_ALLOWED" }) };
  }

  const token = process.env.TMDB_BEARER_TOKEN;
  if (!token) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: "TMDB_PROXY_NOT_CONFIGURED" }) };
  }

  const requestUrl = new URL(event.rawUrl || "https://after-dark.invalid/api/tmdb");
  const path = requestUrl.searchParams.get("path") || "";
  if (!ALLOWED_PATHS.some((pattern) => pattern.test(path))) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "TMDB_PATH_NOT_ALLOWED" }) };
  }

  const params = new URLSearchParams();
  for (const [key, value] of requestUrl.searchParams.entries()) {
    if (key === "path") continue;
    if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(key) || value.length > 500) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "INVALID_QUERY_PARAMETER" }) };
    }
    params.append(key, value);
  }

  try {
    const upstreamUrl = `https://api.themoviedb.org/3${path}${params.size ? `?${params.toString()}` : ""}`;
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, accept: "application/json" }
    });
    return {
      statusCode: upstream.status,
      headers: { ...headers, "Content-Type": upstream.headers.get("content-type") || headers["Content-Type"] },
      body: await upstream.text()
    };
  } catch (error) {
    console.error("TMDB upstream request failed", error);
    return { statusCode: 502, headers, body: JSON.stringify({ error: "TMDB_UPSTREAM_UNAVAILABLE" }) };
  }
};
