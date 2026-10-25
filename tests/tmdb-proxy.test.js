const test = require("node:test");
const assert = require("node:assert/strict");

const vercelHandler = require("../api/tmdb.js");
const netlifyHandler = require("../netlify/functions/tmdb.js").handler;

function mockVercelRequest({ method = "GET", url = "/api/tmdb?path=%2Fsearch%2Fmulti&query=arrival" } = {}) {
  const response = {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = JSON.stringify(value); return this; },
    send(value) { this.body = value; return this; }
  };
  return {
    req: { method, url },
    res: response
  };
}

test("TMDB proxy refuses requests until a server-side token is configured", async () => {
  const oldToken = process.env.TMDB_BEARER_TOKEN;
  const oldFetch = global.fetch;
  delete process.env.TMDB_BEARER_TOKEN;
  try {
    const { req, res } = mockVercelRequest();
    await vercelHandler(req, res);
    assert.equal(res.statusCode, 503);
    assert.match(res.body, /TMDB_PROXY_NOT_CONFIGURED/);

    const netlify = await netlifyHandler({
      httpMethod: "GET",
      rawUrl: "https://example.test/.netlify/functions/tmdb?path=%2Fsearch%2Fmulti"
    });
    assert.equal(netlify.statusCode, 503);
    assert.match(netlify.body, /TMDB_PROXY_NOT_CONFIGURED/);
  } finally {
    if (oldToken === undefined) delete process.env.TMDB_BEARER_TOKEN;
    else process.env.TMDB_BEARER_TOKEN = oldToken;
    global.fetch = oldFetch;
  }
});

test("Vercel proxy rejects unsupported methods and paths", async () => {
  const oldToken = process.env.TMDB_BEARER_TOKEN;
  const oldFetch = global.fetch;
  process.env.TMDB_BEARER_TOKEN = "test-token";
  global.fetch = async () => ({ status: 200, headers: { get: () => "application/json" }, text: async () => "{}" });
  try {
    const method = mockVercelRequest({ method: "POST" });
    await vercelHandler(method.req, method.res);
    assert.equal(method.res.statusCode, 405);

    const path = mockVercelRequest({ url: "/api/tmdb?path=%2Fconfiguration" });
    await vercelHandler(path.req, path.res);
    assert.equal(path.res.statusCode, 400);
    assert.match(path.res.body, /TMDB_PATH_NOT_ALLOWED/);

    const credits = mockVercelRequest({ url: "/api/tmdb?path=%2Fmovie%2F123%2Fcredits" });
    await vercelHandler(credits.req, credits.res);
    assert.equal(credits.res.statusCode, 200);
  } finally {
    if (oldToken === undefined) delete process.env.TMDB_BEARER_TOKEN;
    else process.env.TMDB_BEARER_TOKEN = oldToken;
    global.fetch = oldFetch;
  }
});

test("Vercel proxy forwards an allowlisted request using only the server token", async () => {
  const oldToken = process.env.TMDB_BEARER_TOKEN;
  const oldFetch = global.fetch;
  process.env.TMDB_BEARER_TOKEN = "server-only-test-token";
  let captured;
  global.fetch = async (url, options) => {
    captured = { url: String(url), options };
    return {
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => '{"results":[]}'
    };
  };
  try {
    const { req, res } = mockVercelRequest();
    await vercelHandler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, '{"results":[]}');
    assert.match(captured.url, /^https:\/\/api\.themoviedb\.org\/3\/search\/multi\?/);
    assert.match(captured.url, /query=arrival/);
    assert.equal(captured.options.headers.Authorization, "Bearer server-only-test-token");
    assert.equal(captured.options.method, "GET");
  } finally {
    if (oldToken === undefined) delete process.env.TMDB_BEARER_TOKEN;
    else process.env.TMDB_BEARER_TOKEN = oldToken;
    global.fetch = oldFetch;
  }
});

test("Netlify proxy rejects unsupported paths", async () => {
  const oldToken = process.env.TMDB_BEARER_TOKEN;
  process.env.TMDB_BEARER_TOKEN = "test-token";
  try {
    const response = await netlifyHandler({
      httpMethod: "GET",
      rawUrl: "https://example.test/.netlify/functions/tmdb?path=%2Fadmin"
    });
    assert.equal(response.statusCode, 400);
    assert.match(response.body, /TMDB_PATH_NOT_ALLOWED/);
  } finally {
    if (oldToken === undefined) delete process.env.TMDB_BEARER_TOKEN;
    else process.env.TMDB_BEARER_TOKEN = oldToken;
  }
});

test("browser bundle does not contain a TMDB bearer token", async () => {
  const fs = require("node:fs");
  const script = fs.readFileSync(require.resolve("../script.js"), "utf8");
  assert.doesNotMatch(script, /TMDB_API_KEY\s*=/);
  assert.doesNotMatch(script, /api\.themoviedb\.org\/3/);
  assert.match(script, /const API="\/api\/tmdb"/);
});
