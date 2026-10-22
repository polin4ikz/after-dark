const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeEmbedUrl, filmKey } = require("../watch-player.js");

test("normalizes official YouTube embed, short, and watch links", () => {
  const expected = "https://www.youtube-nocookie.com/embed/abcdefghijk?playsinline=1";
  assert.deepEqual(normalizeEmbedUrl("https://www.youtube.com/embed/abcdefghijk"), { provider: "youtube", url: expected });
  assert.deepEqual(normalizeEmbedUrl("https://youtu.be/abcdefghijk"), { provider: "youtube", url: expected });
  assert.deepEqual(normalizeEmbedUrl("https://www.youtube.com/watch?v=abcdefghijk"), { provider: "youtube", url: expected });
});

test("normalizes Vimeo and Archive.org embed links", () => {
  assert.deepEqual(normalizeEmbedUrl("https://vimeo.com/123456"), { provider: "vimeo", url: "https://player.vimeo.com/video/123456" });
  assert.deepEqual(normalizeEmbedUrl("https://player.vimeo.com/video/123456"), { provider: "vimeo", url: "https://player.vimeo.com/video/123456" });
  assert.deepEqual(normalizeEmbedUrl("https://archive.org/details/public-domain-film"), { provider: "archive", url: "https://archive.org/embed/public-domain-film" });
});

test("rejects unsupported, insecure, and malformed URLs", () => {
  for (const url of [
    "javascript:alert(1)",
    "http://www.youtube.com/embed/abcdefghijk",
    "https://youtube.com.evil.test/embed/abcdefghijk",
    "https://evil.test/embed/abcdefghijk",
    "https://www.youtube.com/embed/short",
    "https://vimeo.com/not-a-number",
    "https://archive.org/download/file.mp4"
  ]) assert.throws(() => normalizeEmbedUrl(url), Error, url);
});

test("rejects credentials and nonstandard ports", () => {
  assert.throws(() => normalizeEmbedUrl("https://user:pass@vimeo.com/123456"));
  assert.throws(() => normalizeEmbedUrl("https://vimeo.com:8443/123456"));
});

test("builds distinct source keys for movies and series", () => {
  assert.equal(filmKey({ tmdbId: 123, type: "film" }), "movie:123");
  assert.equal(filmKey({ tmdbId: 123, type: "series" }), "tv:123");
  assert.equal(filmKey({ id: 456, media_type: "tv" }), "tv:456");
  assert.equal(filmKey({}), "");
});

test("restores only valid supported sources from local storage", () => {
  const { SOURCE_CACHE, SOURCE_STORAGE_KEY, restoreSourceCache } = require("../watch-player.js");
  const originalStorage = global.localStorage;
  const values = new Map();
  global.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  try {
    SOURCE_CACHE.clear();
    values.set(SOURCE_STORAGE_KEY, JSON.stringify({
      "movie:123": { provider: "youtube", url: "https://www.youtube-nocookie.com/embed/abcdefghijk?playsinline=1" },
      "tv:456": { provider: "evil", url: "https://evil.example/embed/abcdefghijk" },
      "not-an-id": { provider: "youtube", url: "https://www.youtube-nocookie.com/embed/abcdefghijk?playsinline=1" }
    }));
    restoreSourceCache();
    assert.deepEqual(SOURCE_CACHE.get("movie:123"), {
      provider: "youtube",
      url: "https://www.youtube-nocookie.com/embed/abcdefghijk?playsinline=1"
    });
    assert.equal(SOURCE_CACHE.has("tv:456"), false);
    assert.equal(SOURCE_CACHE.has("not-an-id"), false);
  } finally {
    SOURCE_CACHE.clear();
    if (originalStorage === undefined) delete global.localStorage;
    else global.localStorage = originalStorage;
  }
});

test("persists the normalized source map without failing when storage is unavailable", () => {
  const { SOURCE_CACHE, SOURCE_STORAGE_KEY, persistSourceCache } = require("../watch-player.js");
  const originalStorage = global.localStorage;
  const values = new Map();
  global.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  try {
    SOURCE_CACHE.clear();
    SOURCE_CACHE.set("movie:123", {
      provider: "vimeo",
      url: "https://player.vimeo.com/video/123456"
    });
    persistSourceCache();
    assert.deepEqual(JSON.parse(values.get(SOURCE_STORAGE_KEY)), {
      "movie:123": { provider: "vimeo", url: "https://player.vimeo.com/video/123456" }
    });
    global.localStorage = { getItem: () => null, setItem: () => { throw new Error("storage disabled"); } };
    assert.doesNotThrow(persistSourceCache);
  } finally {
    SOURCE_CACHE.clear();
    if (originalStorage === undefined) delete global.localStorage;
    else global.localStorage = originalStorage;
  }
});
