const test = require("node:test");
const assert = require("node:assert/strict");
const handler = require("../api/watchmode.js");

function responseMock() {
  return {
    code: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test("Watchmode proxy validates input before calling the upstream API", async () => {
  const previousKey = process.env.WATCHMODE_API_KEY;
  const previousFetch = global.fetch;
  let called = false;
  try {
    delete process.env.WATCHMODE_API_KEY;
    global.fetch = async () => { called = true; throw new Error("must not call"); };

    let res = responseMock();
    await handler({ method: "GET", url: "/api/watchmode?tmdbId=1&type=movie&region=RU" }, res);
    assert.equal(res.code, 503);
    assert.equal(res.body.error, "WATCHMODE_NOT_CONFIGURED");
    assert.equal(called, false);

    process.env.WATCHMODE_API_KEY = "test-key";
    res = responseMock();
    await handler({ method: "GET", url: "/api/watchmode?tmdbId=bad&type=movie&region=RU" }, res);
    assert.equal(res.code, 400);
    assert.equal(res.body.error, "INVALID_TMDB_ID");
    assert.equal(called, false);

    res = responseMock();
    await handler({ method: "POST", url: "/api/watchmode" }, res);
    assert.equal(res.code, 405);
    assert.equal(res.headers.Allow, "GET");
    assert.equal(called, false);
  } finally {
    if (previousKey === undefined) delete process.env.WATCHMODE_API_KEY;
    else process.env.WATCHMODE_API_KEY = previousKey;
    global.fetch = previousFetch;
  }
});

test("Watchmode proxy uses TMDB IDs server-side and returns only HTTPS provider links", async () => {
  const previousKey = process.env.WATCHMODE_API_KEY;
  const previousFetch = global.fetch;
  let calledUrl;
  let calledOptions;
  try {
    process.env.WATCHMODE_API_KEY = "test-key";
    global.fetch = async (url, options) => {
      calledUrl = new URL(url);
      calledOptions = options;
      return {
        ok: true,
        status: 200,
        json: async () => [
          { name: "Example Stream", type: "sub", web_url: "https://stream.example/watch/123", price: null, format: "HD" },
          { name: "Bad link", type: "free", web_url: "javascript:alert(1)" },
          { name: "Missing link", type: "rent" }
        ]
      };
    };

    const res = responseMock();
    await handler({ method: "GET", url: "/api/watchmode?tmdbId=1396&type=tv&region=DE" }, res);
    assert.equal(res.code, 200);
    assert.equal(calledUrl.origin, "https://api.watchmode.com");
    assert.equal(calledUrl.pathname, "/v1/title/tv-1396/sources/");
    assert.equal(calledUrl.searchParams.get("regions"), "DE");
    assert.equal(calledOptions.headers["X-API-Key"], "test-key");
    assert.deepEqual(res.body.sources, [{
      name: "Example Stream",
      type: "sub",
      webUrl: "https://stream.example/watch/123",
      price: "",
      format: "HD"
    }]);
  } finally {
    if (previousKey === undefined) delete process.env.WATCHMODE_API_KEY;
    else process.env.WATCHMODE_API_KEY = previousKey;
    global.fetch = previousFetch;
  }
});
