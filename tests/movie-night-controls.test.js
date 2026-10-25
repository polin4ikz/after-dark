const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "after-dark-final.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("Movie Night has one JavaScript path for DECIDE; reveal safety does not trigger it", () => {
  const safetyStart = source.indexOf("MOVIE NIGHT — reveal and modal safety");
  const safetyEnd = source.indexOf("MOVIE NIGHT — direct result button handlers");
  assert.ok(safetyStart >= 0 && safetyEnd > safetyStart);
  const safetyBlock = source.slice(safetyStart, safetyEnd);
  assert.doesNotMatch(safetyBlock, /addEventListener\(["']click["'][\s\S]*?decideMovie/);
  assert.match(html, /id="decideButton"[^>]*onclick="decideMovie\(\)"/);
  assert.doesNotMatch(source, /MOVIE NIGHT — pointer-level controls/);
  assert.doesNotMatch(source, /addEventListener\(["']pointerdown["']/);
});

test("Movie Night filter state remains wired for every option and secondary filter", () => {
  const controlsStart = source.indexOf("MOVIE NIGHT — restore filter controls");
  assert.ok(controlsStart >= 0);
  const controls = source.slice(controlsStart);
  for (const field of ["filterType", "genre", "year", "rating"]) {
    assert.match(controls, new RegExp("button\\.dataset\\." + field));
  }
  assert.match(controls, /movieNight\.country=e\.target\.value/);
  assert.match(controls, /movieNight\.exclude=e\.target\.checked/);
  assert.match(html, /id="decideButton"/);
});
