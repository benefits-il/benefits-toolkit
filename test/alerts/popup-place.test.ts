import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { popupPlaceFile } from "../../src/core/paths";
import { clearPopupPlace, hasPopupPlace } from "../../src/features/alerts/services/popup-place";

test("Back to corner deletes the spot the popup was dropped on, and no spot is fine", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "benefit-place-"));
  const before = process.env.BENEFITS_TOOLKIT_HOME;
  process.env.BENEFITS_TOOLKIT_HOME = home;
  try {
    assert.equal(popupPlaceFile(), path.join(home, "state", "popup-place.json"));
    assert.equal(hasPopupPlace(), false);
    await clearPopupPlace();
    fs.mkdirSync(path.dirname(popupPlaceFile()), { recursive: true });
    fs.writeFileSync(popupPlaceFile(), '{"x":180,"y":260,"side":"left","vdir":"down"}');
    assert.equal(hasPopupPlace(), true);
    await clearPopupPlace();
    assert.equal(hasPopupPlace(), false);
  } finally {
    if (before === undefined) delete process.env.BENEFITS_TOOLKIT_HOME;
    else process.env.BENEFITS_TOOLKIT_HOME = before;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
