import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("home and reporting feature styles load through App.css while responsive overrides remain", async () => {
  const [app, home, reporting] = await Promise.all([
    readFile(new URL("../../App.css", import.meta.url), "utf8"),
    readFile(new URL("./home/home.css", import.meta.url), "utf8"),
    readFile(new URL("./reporting/reporting.css", import.meta.url), "utf8"),
  ]);
  assert.match(app, /@import "\.\/presentation\/pages\/home\/home\.css"/);
  assert.match(app, /@import "\.\/presentation\/pages\/reporting\/reporting\.css"/);
  assert.match(home, /\.home-range-presence-field select:focus/);
  assert.match(reporting, /\.reporting-page--mobile \.reporting-filter-form--mobile/);
  assert.match(reporting, /\.reporting-mobile-row-card/);
  assert.doesNotMatch(app, /\.home-range-presence-field select:focus/);
  assert.doesNotMatch(app, /\.reporting-page--mobile \.reporting-filter-form--mobile/);
  assert.match(app, /@media[\s\S]*\.reporting-table/);
});
