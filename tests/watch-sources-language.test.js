const test = require("node:test");
const assert = require("node:assert/strict");
const { hasRussianAudioHint } = require("../api/watch-sources.js");

test("detects Russian language in Internet Archive metadata", () => {
  assert.equal(hasRussianAudioHint({ language: "Russian" }, { name: "feature.mp4" }), true);
  assert.equal(hasRussianAudioHint({ languages: ["eng", "rus"] }, { name: "feature.mp4" }), true);
  assert.equal(hasRussianAudioHint({ audio_language: "ru-RU" }, { name: "feature.mp4" }), true);
});

test("detects Russian tags in video file names", () => {
  assert.equal(hasRussianAudioHint({}, { name: "feature.russian.mp4" }), true);
  assert.equal(hasRussianAudioHint({}, { name: "feature.[ru].mp4" }), true);
});

test("does not claim Russian audio when metadata does not identify it", () => {
  assert.equal(hasRussianAudioHint({ language: "English" }, { name: "feature.mp4" }), false);
  assert.equal(hasRussianAudioHint({}, { name: "feature.mp4" }), false);
  assert.equal(hasRussianAudioHint({ language: "French" }, { name: "rural_film.mp4" }), false);
});
