const test = require("node:test");
const assert = require("node:assert/strict");
const vercelHandler = require("../api/tmdb-image.js");
const netlifyHandler = require("../netlify/functions/tmdb-image.js").handler;

function mockResponse() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = JSON.stringify(value); return this; },
    send(value) { this.body = value; return this; }
  };
}

test("image proxy rejects methods and arbitrary paths before fetching", async () => {
  const oldFetch = global.fetch;
  global.fetch = async () => { throw new Error("fetch must not run"); };
  try {
    const methodRes = mockResponse();
    await vercelHandler({ method: "POST", url: "/api/tmdb-image?path=%2Fw780%2Fabc.jpg" }, methodRes);
    assert.equal(methodRes.statusCode, 405);
    const pathRes = mockResponse();
    await vercelHandler({ method: "GET", url: "/api/tmdb-image?path=https%3A%2F%2Fevil.test%2Fimage.jpg" }, pathRes);
    assert.equal(pathRes.statusCode, 400);
    assert.match(pathRes.body, /TMDB_IMAGE_PATH_NOT_ALLOWED/);
  } finally { global.fetch = oldFetch; }
});

test("Vercel image proxy fetches only the fixed TMDB image host and returns cached image bytes", async () => {
  const oldFetch = global.fetch;
  let capturedUrl;
  global.fetch = async (url) => {
    capturedUrl = String(url);
    return { ok: true, status: 200, headers: { get: name => name === "content-type" ? "image/jpeg" : null }, arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer };
  };
  try {
    const res = mockResponse();
    await vercelHandler({ method: "GET", url: "/api/tmdb-image?path=%2Fw780%2Fposter_01.jpg" }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["Content-Type"], "image/jpeg");
    assert.equal(res.headers["Cache-Control"], "public, s-maxage=86400, stale-while-revalidate=604800");
    assert.equal(capturedUrl, "https://image.tmdb.org/t/p/w780/poster_01.jpg");
    assert.deepEqual([...res.body], [1, 2, 3]);
  } finally { global.fetch = oldFetch; }
});

test("Netlify image proxy rejects arbitrary paths and supports binary image responses", async () => {
  const oldFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, headers: { get: name => name === "content-type" ? "image/webp" : null }, arrayBuffer: async () => Uint8Array.from([7, 8]).buffer });
  try {
    const bad = await netlifyHandler({ httpMethod: "GET", rawUrl: "https://example.test/api/tmdb-image?path=%2Fdownload%2Fsecret.jpg" });
    assert.equal(bad.statusCode, 400);
    const good = await netlifyHandler({ httpMethod: "GET", rawUrl: "https://example.test/api/tmdb-image?path=%2Fw500%2Fposter.webp" });
    assert.equal(good.statusCode, 200);
    assert.equal(good.isBase64Encoded, true);
    assert.equal(Buffer.from(good.body, "base64").toString("hex"), "0708");
    assert.equal(good.headers["Content-Type"], "image/webp");
  } finally { global.fetch = oldFetch; }
});
