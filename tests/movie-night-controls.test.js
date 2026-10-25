const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "after-dark-final.js"), "utf8");

test("Movie Night uses click controls without a competing pointerdown path", () => {
  assert.match(source, /MOVIE NIGHT — restore filter controls/);
  assert.match(source, /root\.querySelector\("#decideButton"\)\?\.addEventListener\("click"/);
  assert.doesNotMatch(source, /MOVIE NIGHT — pointer-level controls/);
  assert.doesNotMatch(source, /addEventListener\("pointerdown"/);
});

test("Movie Night option handlers keep all filter values wired", () => {
  for (const field of ["filterType", "genre", "year", "rating"]) {
    assert.match(source, new RegExp("button\\.dataset\\." + field));
  }
  assert.match(source, /movieNight\.country=e\.target\.value/);
  assert.match(source, /movieNight\.exclude=e\.target\.checked/);
});
