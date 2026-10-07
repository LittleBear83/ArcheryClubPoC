import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { LoginMethodChartCard } from "./LoginMethodChartCard";
import { DashboardPeriodFilter } from "./DashboardPeriodFilter";
import { loginMethodQueryOptions, type LoginMethodReport } from "../../../../api/reportingDashboardApi";

const report: LoginMethodReport = {
  period: { key: "30d", startDate: "2026-09-06", endDate: "2026-10-05", endDateExclusive: "2026-10-06" },
  total: 10, excludedOtherCount: 0,
  methods: [{ method: "rfid", label: "RFID", count: 9, percentage: 90 }, { method: "mobile", label: "Mobile", count: 1, percentage: 10 }, { method: "website", label: "Website", count: 0, percentage: 0 }],
};

test("chart renders all categories as keyboard/touch-accessible text, including zero values", () => {
  const html = renderToStaticMarkup(<LoginMethodChartCard report={report} periodLabel="Last 30 days" />);
  for (const label of ["RFID", "Mobile", "Website", "90%", "10%", "0%", "Member login methods", "total access events", "Last 30 days"]) assert.ok(html.includes(label), label);
  assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 3);
  assert.match(html, /aria-describedby=/);
  assert.match(html, /not unique people or range visits/);
});

test("zero totals show the empty state and retain all textual categories", () => {
  const empty = { ...report, total: 0, methods: report.methods.map((entry) => ({ ...entry, count: 0, percentage: 0 })) };
  const html = renderToStaticMarkup(<LoginMethodChartCard report={empty} periodLabel="All time" />);
  assert.match(html, /No recorded login activity/);
  assert.match(html, /Select a category to inspect its values/);
  assert.doesNotMatch(html, /Hover a slice/);
  assert.doesNotMatch(html, /NaN|Infinity/);
  for (const label of ["RFID", "Mobile", "Website"]) assert.ok(html.includes(label));
});

test("dashboard filter exposes every supported period", () => {
  const html = renderToStaticMarkup(<DashboardPeriodFilter period="30d" onChange={() => {}} />);
  for (const label of ["Last 7 days", "Last 30 days", "Last 90 days", "This year", "All time"]) assert.ok(html.includes(label));
  assert.match(html, /for=/);
});

test("period changes refresh the query and keep actor/period caches separate", async (t) => {
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    urls.push(url);
    return new Response(JSON.stringify({ success: true, report }), { headers: { "content-type": "application/json" } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  t.after(() => client.clear());
  const observer = new QueryObserver(client, loginMethodQueryOptions("captain", "7d"));
  const unsubscribe = observer.subscribe(() => {});
  t.after(unsubscribe);
  await observer.refetch();
  observer.setOptions(loginMethodQueryOptions("captain", "90d"));
  await observer.refetch();
  assert.ok(urls.some((url) => url.endsWith("period=7d")));
  assert.ok(urls.some((url) => url.endsWith("period=90d")));
  assert.notDeepEqual(loginMethodQueryOptions("captain", "7d").queryKey, loginMethodQueryOptions("other", "7d").queryKey);
});
