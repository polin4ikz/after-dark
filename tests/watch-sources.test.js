const test = require("node:test");
const assert = require("node:assert/strict");
const handler = require("../api/watch-sources.js");
const { parseDuration, hasOpenLicense, normalizeTitle } = handler;

function responseMock() {
  return {
    statusCode: 200, headers: {}, body: "",
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = JSON.stringify(value); return this; }
  };
}

test("parses durations and normalizes title comparisons", () => {
  assert.equal(parseDuration("1:32:10"), 5530);
  assert.equal(parseDuration("42:00"), 2520);
  assert.equal(parseDuration("120"), 120);
  assert.equal(normalizeTitle("Amélie (2001)"), "amelie 2001");
});

test("only treats explicit public-domain or Creative Commons metadata as open licensed", () => {
  assert.equal(hasOpenLicense({ licenseurl: "https://creativecommons.org/licenses/by/4.0/" }), true);
  assert.equal(hasOpenLicense({ rights: "Public Domain" }), true);
  assert.equal(hasOpenLicense({ description: "free to watch" }), false);
  assert.equal(hasOpenLicense({}), false);
});

test("validates request before querying external services", async () => {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; throw new Error("should not call"); };
  try {
    const wrongMethod = responseMock();
    await handler({ method: "POST", url: "/api/watch-sources?q=Nosferatu" }, wrongMethod);
    assert.equal(wrongMethod.statusCode, 405);
    const badQuery = responseMock();
    await handler({ method: "GET", url: "/api/watch-sources?q=%3Cscript%3E" }, badQuery);
    assert.equal(badQuery.statusCode, 400);
    assert.equal(called, false);
  } finally { global.fetch = originalFetch; }
});

test("returns only exact-title full-length videos with an explicit open license", async () => {
  const originalFetch = global.fetch;
  global.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === "archive.org" && url.pathname === "/advancedsearch.php") {
      return { ok: true, json: async () => ({ response: { docs: [
        { identifier: "licensed-feature", title: "Nosferatu (1922)", year: "1922" },
        { identifier: "no-rights", title: "Nosferatu", year: "1922" },
        { identifier: "short-video", title: "Nosferatu", year: "1922" },
        { identifier: "../unsafe", title: "Nosferatu", year: "1922" }
      ] } }) };
    }
    const id = url.pathname.split("/").pop();
    const common = { title: "Nosferatu (1922)", year: "1922" };
    const files = id === "short-video"
      ? [{ name: "movie.mp4", format: "MPEG4", length: "00:02:00" }]
      : [{ name: "movie.mp4", format: "512Kb MPEG4", length: "1:34:00" }];
    const metadata = id === "licensed-feature"
      ? { ...common, licenseurl: "https://creativecommons.org/licenses/by/4.0/" }
      : id === "no-rights" ? common : { ...common, rights: "Public Domain" };
    return { ok: true, json: async () => ({ metadata, files }) };
  };
  try {
    const res = responseMock();
    await handler({ method: "GET", url: "/api/watch-sources?q=Nosferatu&year=1922" }, res);
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.results.length, 1);
    assert.equal(body.results[0].identifier, "licensed-feature");
    assert.equal(body.results[0].confidence, "high");
    assert.equal(body.results[0].embedUrl, "https://archive.org/embed/licensed-feature");
    assert.equal(body.results[0].durationSeconds, 5640);
  } finally { global.fetch = originalFetch; }
});

test("accepts common punctuation in movie titles", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ response: { docs: [] } }) });
  try {
    const res = responseMock();
    await handler({ method: "GET", url: "/api/watch-sources?q=Spider-Man%3A%20Across%20the%20Spider-Verse" }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body).results, []);
  } finally { global.fetch = originalFetch; }
});
