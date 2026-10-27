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


test("resolver does not mistake unrelated page links for a video player", () => {
  const { extractPlayerUrl } = require("../api/resolve-film-player.js");
  const html = '<html><body><a href="https://go.microsoft.com/fwlink/?linkid=868923">continue</a><a href="https://example.com/about">about</a></body></html>';
  assert.equal(extractPlayerUrl(html, "https://example.com/film"), null);
});

test("resolver prefers an explicit iframe player URL", () => {
  const { extractPlayerUrl } = require("../api/resolve-film-player.js");
  const html = '<html><body><a href="https://example.com/about">about</a><iframe src="https://player.example.net/embed/film-123"></iframe></body></html>';
  assert.equal(extractPlayerUrl(html, "https://example.com/film"), "https://player.example.net/embed/film-123");
});

test("resolver rejects player-named images and prefers direct video media", () => {
  const { extractPlayerUrl } = require("../api/resolve-film-player.js");
  const html = '<html><body><img src="https://images.justwatch.com/icon/339998382/s100/ottstudioplayer.jpeg"><script>const poster="https://images.justwatch.com/icon/1/s100/film-player.png";</script><video><source src="https://cdn.example/media/feature.mp4"></video></body></html>';
  assert.equal(extractPlayerUrl(html, "https://example.com/film"), "https://cdn.example/media/feature.mp4");
});

test("resolver returns no player when a page only exposes poster images", () => {
  const { extractPlayerUrl } = require("../api/resolve-film-player.js");
  const html = '<html><body><img src="https://images.justwatch.com/icon/339998382/s100/ottstudioplayer.jpeg"></body></html>';
  assert.equal(extractPlayerUrl(html, "https://example.com/film"), null);
});

test("resolver rejects editorial iframe pages that only mention streaming", () => {
  const { extractPlayerUrl } = require("../api/resolve-film-player.js");
  const html = '<html><body><iframe src="https://guides.justwatch.com/it/ordine-film-nosferatu-streaming"></iframe><iframe src="https://www.justwatch.com/us/provider/amazon-prime-video"></iframe><img src="https://images.justwatch.com/icon/339998382/s100/ottstudioplayer.jpeg"></body></html>';
  assert.equal(extractPlayerUrl(html, "https://example.com/film"), null);
});
