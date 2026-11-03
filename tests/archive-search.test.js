const test = require("node:test");
const assert = require("node:assert/strict");
const vercelHandler = require("../api/archive-search.js");
const netlifyHandler = require("../netlify/functions/archive-search.js").handler;

function responseMock() {
  return {
    statusCode: 200, headers: {}, body: "",
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = JSON.stringify(value); return this; }
  };
}

test("archive search validates query and method before making network requests", async () => {
  const oldFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; throw new Error("should not call"); };
  try {
    const badMethod = responseMock();
    await vercelHandler({ method: "POST", url: "/api/archive-search?q=Nosferatu" }, badMethod);
    assert.equal(badMethod.statusCode, 405);
    const badQuery = responseMock();
    await vercelHandler({ method: "GET", url: "/api/archive-search?q=%3Cscript%3E" }, badQuery);
    assert.equal(badQuery.statusCode, 400);
    assert.equal(called, false);
  } finally { global.fetch = oldFetch; }
});

test("archive search requests only movie items and sanitizes returned identifiers", async () => {
  const oldFetch = global.fetch;
  let requested;
  global.fetch = async url => {
    requested = new URL(String(url));
    return {
      ok: true,
      json: async () => ({ response: { docs: [
        { identifier: "public-domain-film", title: "Public Domain Film", year: 1930, description: ["A short description"] },
        { identifier: "../unsafe", title: "Unsafe" },
        { identifier: "missing-title" }
      ] } })
    };
  };
  try {
    const res = responseMock();
    await vercelHandler({ method: "GET", url: "/api/archive-search?q=Nosferatu" }, res);
    assert.equal(res.statusCode, 200);
    assert.match(requested.searchParams.get("q"), /mediatype:movies/);
    assert.equal(requested.searchParams.get("rows"), "8");
    assert.deepEqual(JSON.parse(res.body).results, [{
      identifier: "public-domain-film",
      title: "Public Domain Film",
      year: "1930",
      description: "A short description"
    }]);
  } finally { global.fetch = oldFetch; }
});

test("Netlify archive search rejects invalid requests and returns safe error", async () => {
  const oldFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; throw new Error("should not call"); };
  try {
    const res = await netlifyHandler({ httpMethod: "GET", rawUrl: "https://example.test/api/archive-search?q=" });
    assert.equal(res.statusCode, 400);
    assert.equal(called, false);
  } finally { global.fetch = oldFetch; }
});
