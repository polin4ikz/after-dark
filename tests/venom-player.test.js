const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeSource, filmKey } = require("../venom-player.js");

test("accepts secure direct HLS, DASH, and file sources", () => {
  assert.deepEqual(normalizeSource("https://media.example/master.m3u8", "hls"), {
    kind: "hls", url: "https://media.example/master.m3u8"
  });
  assert.deepEqual(normalizeSource("https://media.example/manifest.mpd", "dash"), {
    kind: "dash", url: "https://media.example/manifest.mpd"
  });
  assert.deepEqual(normalizeSource("https://media.example/movie.mp4", "file"), {
    kind: "file", url: "https://media.example/movie.mp4"
  });
});

test("rejects invalid, insecure, credentialed, and local sources", () => {
  for (const [url, kind] of [
    ["not a URL", "hls"],
    ["http://media.example/master.m3u8", "hls"],
    ["https://user:pass@media.example/master.m3u8", "hls"],
    ["https://media.example:8443/master.m3u8", "hls"],
    ["https://localhost/master.m3u8", "hls"],
    ["https://media.local/master.m3u8", "hls"],
    ["https://media.example/movie.mp4", "unknown"]
  ]) assert.throws(() => normalizeSource(url, kind), Error);
});

test("creates distinct movie and series source keys", () => {
  assert.equal(filmKey({ tmdbId: 123, type: "film" }), "movie:123");
  assert.equal(filmKey({ tmdbId: 123, type: "series" }), "tv:123");
  assert.equal(filmKey({ id: 456, media_type: "tv" }), "tv:456");
  assert.equal(filmKey({ id: 789, type: "tv" }), "tv:789");
  assert.equal(filmKey({}), "");
});
