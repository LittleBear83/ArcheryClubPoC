import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getAchievementRowProps, isAchievementRowSelected } from "./achievementTableSelection.js";

const rows = [
  { id: 10, archerUsername: "member", bowType: "Recurve" },
  { id: 11, archerUsername: "member", bowType: "Barebow" },
  { id: 12, archerUsername: "other", bowType: "Compound" },
];

test("all of the signed-in member's bowstyle rows start selected", () => {
  assert.deepEqual(rows.filter((row) => isAchievementRowSelected(row, "MEMBER", null)).map((row) => row.id), [10, 11]);
  assert.deepEqual(rows.filter((row) => isAchievementRowSelected(row, "", null)), []);
});

test("click, Enter and Space choose one stable row ID across sorting", () => {
  let selectedId = null;
  const select = (id) => { selectedId = id; };
  getAchievementRowProps(rows[2], "member", selectedId, select).onClick();
  assert.equal(selectedId, 12);
  const sorted = [...rows].sort((a, b) => b.bowType.localeCompare(a.bowType));
  assert.deepEqual(sorted.filter((row) => isAchievementRowSelected(row, "member", selectedId)).map((row) => row.id), [12]);

  const event = { key: "Enter", preventDefault() {} };
  getAchievementRowProps(rows[0], "member", selectedId, select).onKeyDown(event);
  assert.equal(selectedId, 10);
  getAchievementRowProps(rows[1], "member", selectedId, select).onKeyDown({ ...event, key: " " });
  assert.deepEqual(rows.filter((row) => isAchievementRowSelected(row, "member", selectedId)).map((row) => row.id), [11]);
  assert.equal(getAchievementRowProps(rows[1], "member", selectedId, select)["aria-selected"], true);
  assert.equal(getAchievementRowProps(rows[0], "member", selectedId, select)["aria-selected"], false);
});

test("keyboard arrows move row focus without changing selection", () => {
  let focused = false;
  const props = getAchievementRowProps(rows[0], "member", 12, () => assert.fail("unexpected selection"));
  assert.equal(props.tabIndex, 0);
  props.onKeyDown({ key: "ArrowDown", currentTarget: { nextElementSibling: { focus() { focused = true; } } }, preventDefault() {} });
  assert.equal(focused, true);
});

test("both tables keep horizontal scrolling and sticky grouped headings on mobile", async () => {
  const css = await readFile(new URL("../../App.css", import.meta.url), "utf8");
  assert.match(css, /\.outdoor-table-scroll\s*\{[^}]*overflow-x: auto;[^}]*overflow-y: auto;[^}]*max-height:/s);
  assert.match(css, /\.outdoor-table-matrix thead\s*\{[^}]*position: sticky;[^}]*top: 0;/s);
  assert.match(css, /@media \(max-width: 960px\)\s*\{[\s\S]*?\.outdoor-table-scroll\s*\{\s*overflow-x: scroll;/);
  assert.match(css, /@media \(max-width: 640px\)\s*\{[\s\S]*?\.outdoor-table-matrix\s*\{\s*min-width: 1060px;/);
});

test("Indoor and Outdoor tables both use the shared selectable grid rows", async () => {
  for (const page of ["IndoorTablePage.tsx", "OutdoorTablePage.tsx"]) {
    const source = await readFile(new URL(page, import.meta.url), "utf8");
    assert.match(source, /useAchievementRowSelection\(actorUsername\)/);
    assert.match(source, /role="grid" aria-multiselectable="true"/);
    assert.match(source, /<tr key=\{\w+\.id\} \{\.\.\.rowSelectionProps\(\w+\)\}/);
  }
});
