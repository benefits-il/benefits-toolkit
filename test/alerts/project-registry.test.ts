import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cleanDisplayName,
  DISPLAY_NAME_MAX,
  findProject,
  normalizeFolder,
  projectKey,
  ProjectRecord,
} from "../../src/features/alerts/services/project-registry";

function record(folder: string, name = folder): ProjectRecord {
  return {
    folder,
    name,
    color: null,
    sounds: {},
    cli: null,
    editor: "vscode",
    pid: 1,
    focused: false,
    updatedAt: "",
  };
}

test("normalizeFolder unifies slashes, case and trailing separators", () => {
  assert.equal(normalizeFolder("C:\\Users\\Ben\\Repo\\"), "c:/users/ben/repo");
  assert.equal(normalizeFolder("c:/users/ben/repo"), "c:/users/ben/repo");
  assert.equal(normalizeFolder("/Users/ben/repo/"), "/users/ben/repo");
});

test("projectKey is the same for spellings of the same folder", () => {
  assert.equal(projectKey("C:\\Users\\Ben\\Repo"), projectKey("c:/users/ben/repo/"));
  assert.notEqual(projectKey("C:\\Users\\Ben\\Repo"), projectKey("C:\\Users\\Ben\\Repo2"));
  assert.match(projectKey("x"), /^[0-9a-f]{16}$/);
});

test("findProject matches the folder itself and any subfolder", () => {
  const records = [record("C:\\work\\shop")];
  assert.equal(findProject(records, "c:\\work\\shop")?.folder, "C:\\work\\shop");
  assert.equal(findProject(records, "C:/work/shop/apps/web")?.folder, "C:\\work\\shop");
});

test("findProject does not match a sibling that shares a prefix", () => {
  assert.equal(findProject([record("C:\\work\\shop")], "C:\\work\\shop-admin"), undefined);
});

test("findProject prefers the deepest containing folder", () => {
  const records = [record("C:\\work"), record("C:\\work\\shop"), record("C:\\other")];
  assert.equal(findProject(records, "C:\\work\\shop\\src")?.folder, "C:\\work\\shop");
});

test("findProject handles Hebrew folder names", () => {
  const records = [record("C:\\Users\\ben\\Desktop\\לקוחות\\אתר")];
  assert.equal(findProject(records, "c:\\users\\ben\\desktop\\לקוחות\\אתר\\src")?.name, "C:\\Users\\ben\\Desktop\\לקוחות\\אתר");
});

test("findProject returns nothing for an empty cwd", () => {
  assert.equal(findProject([record("C:\\work")], ""), undefined);
});

test("cleanDisplayName tidies a typed popup name and treats blank as none", () => {
  assert.equal(cleanDisplayName("  Shop   front \n"), "Shop front");
  assert.equal(cleanDisplayName("\t"), undefined);
  assert.equal(cleanDisplayName(""), undefined);
  assert.equal(cleanDisplayName("חנות · ראשי"), "חנות · ראשי");
  assert.equal(cleanDisplayName("x".repeat(DISPLAY_NAME_MAX + 10))?.length, DISPLAY_NAME_MAX);
});
