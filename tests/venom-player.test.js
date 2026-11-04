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


test("formats playback timestamps for resume status", () => {
  const { formatTime } = require("../venom-player.js");
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(83), "1:23");
  assert.equal(formatTime(3661), "1:01:01");
});

test("saves and reads playback progress independently per title", () => {
  const previousStorage = global.localStorage;
  const values = new Map();
  global.localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
  try {
    const { readProgress, saveProgress } = require("../venom-player.js");
    assert.equal(readProgress("movie:10"), null);
    assert.equal(saveProgress("movie:10", 125.9, 7200), true);
    assert.deepEqual(readProgress("movie:10").time, 125);
    assert.equal(readProgress("movie:10").duration, 7200);
    assert.equal(readProgress("movie:11"), null);
    assert.equal(saveProgress("", 20, 100), false);
  } finally {
    if (previousStorage === undefined) delete global.localStorage;
    else global.localStorage = previousStorage;
  }
});


test("resumes only meaningful unfinished progress", () => {
  const { resumeTimeFor } = require("../venom-player.js");
  assert.equal(resumeTimeFor(null), 0);
  assert.equal(resumeTimeFor({ time: 8, duration: 600 }), 0);
  assert.equal(resumeTimeFor({ time: 120, duration: 600 }), 120);
  assert.equal(resumeTimeFor({ time: 590, duration: 600 }), 0);
  assert.equal(resumeTimeFor({ time: 120, duration: 0 }), 120);
});


test("progress event handler saves periodically, saves pause immediately, and clears on ended", () => {
  const previousStorage = global.localStorage;
  const values = new Map();
  global.localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
  try {
    const { createProgressCapture, readProgress } = require("../venom-player.js");
    const capture = createProgressCapture("movie:20", () => true);
    const media = { currentTime: 30.8, duration: 600 };
    capture({ type: "timeupdate", target: media });
    assert.equal(readProgress("movie:20").time, 30);
    media.currentTime = 35;
    capture({ type: "timeupdate", target: media });
    assert.equal(readProgress("movie:20").time, 30, "timeupdate writes are throttled");
    media.currentTime = 36.4;
    capture({ type: "pause", target: media });
    assert.equal(readProgress("movie:20").time, 36, "pause writes immediately");
    capture({ type: "ended", target: media });
    assert.equal(readProgress("movie:20"), null, "finished playback clears saved progress");
  } finally {
    if (previousStorage === undefined) delete global.localStorage;
    else global.localStorage = previousStorage;
  }
});

test("progress event handler ignores stale playback and invalid media times", () => {
  const previousStorage = global.localStorage;
  const values = new Map();
  global.localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
  try {
    const { createProgressCapture, readProgress } = require("../venom-player.js");
    const capture = createProgressCapture("movie:21", () => false);
    capture({ type: "pause", target: { currentTime: 90, duration: 600 } });
    assert.equal(readProgress("movie:21"), null);
    const activeCapture = createProgressCapture("movie:21", () => true);
    activeCapture({ type: "pause", target: { currentTime: Number.NaN, duration: 600 } });
    assert.equal(readProgress("movie:21"), null);
  } finally {
    if (previousStorage === undefined) delete global.localStorage;
    else global.localStorage = previousStorage;
  }
});
