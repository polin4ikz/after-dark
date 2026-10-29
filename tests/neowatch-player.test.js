const test = require("node:test");
const assert = require("node:assert/strict");
const handler = require("../api/neowatch-player.js");
const { parseKpId, normalizeTitle, safeEmbedUrl, extractEmbed } = handler;

function responseMock() {
  return {
    statusCode: 200, headers: {}, body: "",
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = JSON.stringify(value); return this; }
  };
}

test("parses KinoPoisk IDs from NeoWatch search IDs", () => {
  assert.equal(parseKpId("kp_77444"), "77444");
  assert.equal(parseKpId("kp-77444"), "77444");
  assert.equal(parseKpId("77444"), "77444");
  assert.equal(parseKpId("javascript:alert(1)"), "");
});

test("normalizes titles and accepts only safe HTTPS embed URLs", () => {
  assert.equal(normalizeTitle("Amélie (2001)"), "amelie 2001");
  assert.equal(safeEmbedUrl("https://player.example/embed/123"), "https://player.example/embed/123");
  assert.equal(safeEmbedUrl("http://player.example/embed/123"), "");
  assert.equal(safeEmbedUrl("https://user:pass@player.example/embed/123"), "");
  assert.equal(safeEmbedUrl("https://127.0.0.1/embed/123"), "");
});

test("extracts a secure iframe source and ignores malformed iframe URLs", () => {
  assert.equal(
    extractEmbed('<iframe src="https://player.example/embed/123?x=1&amp;y=2"></iframe>', "https://api.neome.uk/api/v1/players/collaps/kp/1"),
    "https://player.example/embed/123?x=1&y=2"
  );
  assert.equal(
    extractEmbed('<iframe src="javascript:alert(1)"></iframe><iframe src="http://bad.example/embed"></iframe>', "https://api.neome.uk/"),
    ""
  );
});

test("validates requests before making upstream calls", async () => {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; throw new Error("should not call"); };
  try {
    const wrongMethod = responseMock();
    await handler({ method: "POST", query: { title: "Amelie" } }, wrongMethod);
    assert.equal(wrongMethod.statusCode, 405);
    const badTitle = responseMock();
    await handler({ method: "GET", query: { title: "<script>" } }, badTitle);
    assert.equal(badTitle.statusCode, 400);
    assert.equal(called, false);
  } finally { global.fetch = originalFetch; }
});
