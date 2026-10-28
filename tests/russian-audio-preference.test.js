const test = require("node:test");
const assert = require("node:assert/strict");
const { findRussianAudioTrackIndex } = require("../venom-watch-page.js");

test("prefers Russian audio tracks by language code", () => {
  assert.equal(findRussianAudioTrackIndex([
    { lang: "en", name: "English" },
    { lang: "ru-RU", name: "Russian" }
  ]), 1);
});

test("recognizes Russian HLS attributes and localized labels", () => {
  assert.equal(findRussianAudioTrackIndex([
    { attrs: { LANGUAGE: "rus" }, name: "Track 1" },
    { labels: [{ text: "Русская озвучка" }] }
  ]), 0);
  assert.equal(findRussianAudioTrackIndex([
    { lang: "en", labels: [{ text: "English" }] },
    { lang: "und", labels: [{ text: "Русский" }] }
  ]), 1);
});

test("does not mistake English tracks or unrelated language codes for Russian", () => {
  assert.equal(findRussianAudioTrackIndex([
    { lang: "en", name: "English" },
    { lang: "fr", name: "French" },
    { lang: "pt", name: "Português" }
  ]), -1);
  assert.equal(findRussianAudioTrackIndex([
    { lang: "en", name: "Track from Brazil" }
  ]), -1);
});

test("handles missing or malformed track lists", () => {
  assert.equal(findRussianAudioTrackIndex(null), -1);
  assert.equal(findRussianAudioTrackIndex([null, {}, "ru"]), -1);
});

test("recognizes alternate language metadata used by external players", () => {
  assert.equal(findRussianAudioTrackIndex([
    { languageCode: "en", title: "English" },
    { languageCode: "ru", title: "Dubbed version" }
  ]), 1);
  assert.equal(findRussianAudioTrackIndex([
    { attrs: { NAME: "Русская дорожка" } }
  ]), 0);
  assert.equal(findRussianAudioTrackIndex([
    { labels: [{ label: "Russian audio" }] }
  ]), 0);
});
