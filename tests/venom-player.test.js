const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeSource, filmKey } = require("../venom-player.js");

test("accepts secure direct HLS, DASH, and file URLs", () => {
  assert.deepEqual(normalizeSource("https://cdn.example/video/master.m3u8", "hls"), {
    kind: "hls", url: "https://cdn.example/video/master.m3u8"
  });
  assert.deepEqual(normalizeSource("https://cdn.example/video/manifest.mpd", "dash"), {
    kind: "dash", url: "https://cdn.example/video/manifest.mpd"
  });
  assert.deepEqual(normalizeSource("https://cdn.example/video/movie.mp4", "file"), {
    kind: "file", url: "https://cdn.example/video/movie.mp4"
  });
});

test("rejects non-HTTPS, credentials, unusual ports, and invalid source types", () => {
  for (const [url, kind] of [
    ["http://cdn.example/movie.mp4", "file"],
    ["javascript:alert(1)", "file"],
    ["https://user:pass@cdn.example/movie.mp4", "file"],
    ["https://cdn.example:8443/movie.mp4", "file"],
    ["https://cdn.example/movie.mp4", "iframe"],
    ["", "hls"]
  ]) assert.throws(() => normalizeSource(url, kind), Error);
});

test("distinguishes movie and series source keys", () => {
  assert.equal(filmKey({ tmdbId: 123, type: "film" }), "movie:123");
  assert.equal(filmKey({ tmdbId: 123, type: "series" }), "tv:123");
  assert.equal(filmKey({ id: 456, media_type: "tv" }), "tv:456");
  assert.equal(filmKey({}), "");
});
