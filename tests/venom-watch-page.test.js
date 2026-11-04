const test = require("node:test");
const assert = require("node:assert/strict");
const { findRussianAudioTrackIndex, chooseRussianArchiveCandidate } = require("../venom-watch-page.js");

test("detects Russian audio from common HLS, DASH, and native track metadata", () => {
  assert.equal(findRussianAudioTrackIndex([{ lang: "en" }, { lang: "ru" }]), 1);
  assert.equal(findRussianAudioTrackIndex([{ language: "eng" }, { language: "rus" }]), 1);
  assert.equal(findRussianAudioTrackIndex([{ attrs: { LANGUAGE: "ru-RU" } }]), 0);
  assert.equal(findRussianAudioTrackIndex([{ labels: [{ text: "Русская озвучка" }] }]), 0);
  assert.equal(findRussianAudioTrackIndex([{ name: "Russian" }]), 0);
});

test("does not mistake unrelated language labels for Russian", () => {
  assert.equal(findRussianAudioTrackIndex([{ lang: "en" }, { lang: "de", name: "German" }]), -1);
  assert.equal(findRussianAudioTrackIndex(null), -1);
  assert.equal(findRussianAudioTrackIndex([null, "ru", {}]), -1);
});

test("only selects one exact open-licensed candidate with Russian metadata", () => {
  const russian = { id: "1", confidence: "high", russianAudioLikely: true };
  const unknown = { id: "2", confidence: "high", russianAudioLikely: false };
  assert.equal(chooseRussianArchiveCandidate([russian]), russian);
  assert.equal(chooseRussianArchiveCandidate([unknown]), null);
  assert.equal(chooseRussianArchiveCandidate([{ ...russian, id: "3" }, russian]), null);
  assert.equal(chooseRussianArchiveCandidate([{ ...russian, confidence: "medium" }]), null);
  assert.equal(chooseRussianArchiveCandidate(null), null);
});
