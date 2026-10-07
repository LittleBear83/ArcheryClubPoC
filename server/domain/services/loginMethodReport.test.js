import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { buildLoginMethodReport, resolveDashboardPeriod } from "./loginMethodReport.js";
import { createLoginMethodReportingGateway } from "../../infrastructure/persistence/loginMethodReportingGateway.js";
import { registerReportingDashboardRoutes } from "../../presentation/http/registerReportingDashboardRoutes.js";

test("login methods group phone password logins as Website, calculate percentages and disclose unknown history", () => {
  const report = buildLoginMethodReport([
    { login_method: "rfid", count: "4" }, { login_method: "mobile-app", count: "1" },
    { login_method: "password", count: "2" }, { login_method: "password-mobile", count: "1" },
    { login_method: "legacy", count: "3" },
  ], resolveDashboardPeriod("all"));
  assert.equal(report.total, 8);
  assert.deepEqual(report.methods.map(({ count, percentage }) => [count, percentage]), [[4, 50], [1, 12.5], [3, 37.5]]);
  assert.equal(report.excludedOtherCount, 3);
});

test("empty and zero-category reports keep all three methods and finite percentages", () => {
  for (const rows of [[], [{ login_method: "rfid", count: 7 }]]) {
    const report = buildLoginMethodReport(rows, resolveDashboardPeriod());
    assert.deepEqual(report.methods.map((entry) => entry.method), ["rfid", "mobile", "website"]);
    assert.equal(report.methods[1].count, 0);
    assert.equal(report.methods[1].percentage, 0);
    assert.ok(report.methods.every((entry) => Number.isFinite(entry.percentage)));
  }
});

test("dashboard periods use inclusive UTC calendar days across leap days and year boundaries", () => {
  const now = new Date("2024-03-01T23:59:00Z");
  for (const [period, start] of [["7d", "2024-02-24"], ["30d", "2024-02-01"], ["90d", "2023-12-03"], ["year", "2024-01-01"], ["all", null]]) {
    assert.deepEqual(resolveDashboardPeriod(period, now), { key: period, startDate: start, endDate: "2024-03-01", endDateExclusive: "2024-03-02" });
  }
  assert.equal(resolveDashboardPeriod("year", new Date("2026-01-01T00:00:00Z")).startDate, "2026-01-01");
  for (const period of ["bad", "", [], "1d"]) assert.throws(() => resolveDashboardPeriod(period), /Choose/);
});

test("SQLite aggregates successful history only, respects boundaries and does not count RFID replay or failed audit attempts", async (t) => {
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.exec("CREATE TABLE login_events (id INTEGER PRIMARY KEY, login_method TEXT, logged_in_date TEXT, sync_event_id TEXT UNIQUE); CREATE TABLE audit_events (action TEXT, status_code INTEGER)");
  const insert = db.prepare("INSERT INTO login_events (login_method, logged_in_date, sync_event_id) VALUES (?, ?, ?) ON CONFLICT(sync_event_id) DO NOTHING");
  insert.run("rfid", "2026-09-29", "scan-1");
  insert.run("rfid", "2026-09-29", "scan-1");
  insert.run("mobile-app", "2026-10-05", "mobile-1");
  insert.run("password-mobile", "2026-10-05", "web-1");
  insert.run("password", "2026-09-28", "before");
  insert.run("password", "2026-10-06", "future");
  db.prepare("INSERT INTO audit_events VALUES (?, ?)").run("login_failed", 401);
  const gateway = createLoginMethodReportingGateway({ databaseEngine: "sqlite", db });
  const period = resolveDashboardPeriod("7d", new Date("2026-10-05T12:00:00Z"));
  const report = buildLoginMethodReport(await gateway.countByMethod(period), period);
  assert.equal(report.total, 3);
  assert.deepEqual(report.methods.map((entry) => entry.count), [1, 1, 1]);
  assert.deepEqual(report.methods.map((entry) => entry.percentage), [33.33, 33.33, 33.33]);
  const all = resolveDashboardPeriod("all", new Date("2026-10-05T12:00:00Z"));
  assert.equal(buildLoginMethodReport(await gateway.countByMethod(all), all).total, 4);
});

test("PostgreSQL dashboard queries use bounded dates without an optional OR predicate", async () => {
  const calls = [];
  const gateway = createLoginMethodReportingGateway({
    databaseEngine: "postgres",
    pool: { async query(sql, values) { calls.push({ sql, values }); return { rows: [] }; } },
  });
  await gateway.countByMethod(resolveDashboardPeriod("7d", new Date("2026-10-05T12:00:00Z")));
  await gateway.countByMethod(resolveDashboardPeriod("all", new Date("2026-10-05T12:00:00Z")));
  assert.deepEqual(calls.map(({ values }) => values), [
    ["2026-09-29", "2026-10-06"], ["2026-10-06"],
  ]);
  assert.match(calls[0].sql, /logged_in_date >= \$1 AND logged_in_date < \$2/);
  assert.match(calls[1].sql, /logged_in_date < \$1/);
  assert.ok(calls.every(({ sql }) => !/\bOR\b/.test(sql)));
});

test("dashboard route enforces Reporting permission before querying and validates presets", async () => {
  let handler, calls = 0;
  registerReportingDashboardRoutes({ app: { get(_path, callback) { handler = callback; } },
    getActorUser: (req) => req.actor, actorHasPermission: (actor, permission) => actor?.permissions?.includes(permission),
    PERMISSIONS: { VIEW_REPORTS: "view_reports" }, now: () => new Date("2026-10-05T12:00:00Z"),
    loginMethodReportingGateway: { async countByMethod() { calls++; return [{ login_method: "rfid", count: 2 }]; } },
  });
  const request = async (actor, period) => {
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ actor, query: { period } }, response);
    return response;
  };
  assert.equal((await request(null, "all")).statusCode, 403);
  assert.equal((await request({ permissions: [] }, "all")).statusCode, 403);
  const actor = { permissions: ["view_reports"] };
  assert.equal((await request(actor, "invalid")).statusCode, 400);
  assert.equal(calls, 0);
  const result = await request(actor, "7d");
  assert.equal(result.body.success, true);
  assert.equal(result.body.report.total, 2);
  assert.equal(result.body.report.period.startDate, "2026-09-29");
});
