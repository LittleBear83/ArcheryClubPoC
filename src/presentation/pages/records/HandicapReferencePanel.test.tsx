import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HandicapReferencePanel } from "./HandicapReferencePanel";
import type { useRecordsPageState } from "./useRecordsPageState";

type State = ReturnType<typeof useRecordsPageState>;

test("handicap lookup offers score and percentage inputs in its responsive controls", () => {
  const table = { tableKey: "one", title: "Portsmouth", rows: [
    { handicapValue: 12, referenceScore: 200 },
  ] };
  const state = {
    bowDisciplineOptions: [{ value: "recurve", label: "Recurve" }],
    comparisonTables: [table], groupedVisibleTables: [{ groupKey: "portsmouth", label: "Portsmouth" }],
    handicapFamilies: [{ familyKey: "indoor-allowances", familyTitle: "Indoor", description: "" }],
    handicapFilter: "12", handicapTablesError: "", handicapTablesLoaded: true,
    handicapTablesLoading: false, handleBowDisciplineChange: () => {}, handleFamilyChange: () => {},
    handleHandicapFilterChange: () => {}, handleTableChange: () => {}, selectedBowDiscipline: "recurve",
    selectedFamily: { familyKey: "indoor-allowances", familyTitle: "Indoor", description: "" },
    selectedRound: { groupKey: "portsmouth" }, selectedTable: table,
    sourceRevision: "", sourceTitle: "Archery GB",
  } as unknown as State;

  const html = renderToStaticMarkup(<HandicapReferencePanel state={state} />);
  assert.match(html, /class="records-handicap-controls"/);
  assert.match(html, /Archer&#x27;s score/);
  assert.match(html, /Allowance %/);
  assert.match(html, /step="any" inputMode="decimal" value="100"/);
  assert.match(html, /Reference scores for handicap 12/);
  assert.doesNotMatch(html, /Adjusted score:/);
});
