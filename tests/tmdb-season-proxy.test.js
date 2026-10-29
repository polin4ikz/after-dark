const test = require("node:test");
const assert = require("node:assert/strict");

const handler = require("../api/tmdb.js");

function responseRecorder() {
  return {
    headers: {},
    code: 200,
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    send(body) { this.body = body; return this; },
    json(body) { this.body = body; return this; }
  };
}

test("TMDB proxy allows only numeric TV season routes", async () => {
  const oldToken = process.env.TMDB_BEARER_TOKEN;
  const oldFetch = global.fetch;
  process.env.TMDB_BEARER_TOKEN = "test-token";
  let requestedUrl = "";
  let authorization = "";
  global.fetch = async (url, options) => {
    requestedUrl = String(url);
    authorization = options.headers.Authorization;
    return {
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify({ season_number: 2, episodes: [{ episode_number: 1 }] })
    };
  };
  try {
    const res = responseRecorder();
    await handler({ method: "GET", url: "/api/tmdb?path=" + encodeURIComponent("/tv/1399/season/2") }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(JSON.parse(res.body).episodes, [{ episode_number: 1 }]);
    assert.match(requestedUrl, /api\.themoviedb\.org\/3\/tv\/1399\/season\/2$/);
    assert.equal(authorization, "Bearer test-token");
  } finally {
    global.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.TMDB_BEARER_TOKEN;
    else process.env.TMDB_BEARER_TOKEN = oldToken;
  }
});

test("TMDB proxy rejects malformed season routes before making a request", async () => {
  const oldToken = process.env.TMDB_BEARER_TOKEN;
  const oldFetch = global.fetch;
  process.env.TMDB_BEARER_TOKEN = "test-token";
  let called = false;
  global.fetch = async () => { called = true; throw new Error("should not fetch"); };
  try {
    const res = responseRecorder();
    await handler({ method: "GET", url: "/api/tmdb?path=" + encodeURIComponent("/tv/1399/season/999/../../movie/550") }, res);
    assert.equal(res.code, 400);
    assert.deepEqual(res.body, { error: "TMDB_PATH_NOT_ALLOWED" });
    assert.equal(called, false);
  } finally {
    global.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.TMDB_BEARER_TOKEN;
    else process.env.TMDB_BEARER_TOKEN = oldToken;
  }
});
