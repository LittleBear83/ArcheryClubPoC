import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportingErrors, ReportingFilters, ReportingSummaryCards } from "./ReportingSharedSections";
import type { useReportingPageState } from "./useReportingPageState";

type State = ReturnType<typeof useReportingPageState>;

const state = {
  startDate: "2026-10-01", endDate: "2026-10-21", minStartDate: "2025-10-21", maxEndDate: "2026-10-21",
  includeMembers: true, includeGuests: false, hasDataSource: true, isFetching: false,
  setStartDate: () => {}, setEndDate: () => {}, setIncludeMembers: () => {}, setIncludeGuests: () => {}, handleExport: () => {},
  data: { members: 3, nonMembers: 1, guests: 0, total: 4 },
  rangeLabel: "1 October to 21 October",
  attendanceBreakdown: { membershipStatuses: [], programmeTypes: [] },
} as unknown as State;

test("shared filters retain source selection and mobile export layout", () => {
  const desktop = renderToStaticMarkup(<ReportingFilters state={state} />);
  const mobile = renderToStaticMarkup(<ReportingFilters state={state} mobile />);
  for (const html of [desktop, mobile]) {
    assert.match(html, /aria-label="Included data sources"/);
    assert.match(html, /checked=""/);
    assert.match(html, /Date from/);
    assert.match(html, /Date to/);
    assert.match(html, /Export CSV/);
    assert.match(html, /Portal accounts/);
  }
  assert.match(desktop, /reporting-export-panel/);
  assert.match(mobile, /mobile-action-bar/);
  assert.match(mobile, /reporting-filter-form--mobile/);
  assert.doesNotMatch(desktop, /reporting-filter-form--mobile/);
  assert.match(renderToStaticMarkup(<ReportingFilters state={{ ...state, isFetching: true } as State} />), /disabled=""/);
});

test("shared reporting feedback and summary retain counts and error text", () => {
  const summary = renderToStaticMarkup(<ReportingSummaryCards state={state} />);
  assert.match(summary, /Member access events/);
  assert.match(summary, /Non-member logins/);
  assert.match(summary, /<strong>1<\/strong>/);
  assert.match(summary, /Guest logins/);
  assert.match(summary, /Total access events/);
  const errors = renderToStaticMarkup(<ReportingErrors state={{ ...state, hasDataSource: false, error: new Error("Unavailable") } as State} />);
  assert.match(errors, /Select portal accounts, guests, or both/);
  assert.match(errors, /Unavailable/);
});
