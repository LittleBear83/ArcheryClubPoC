import { Button } from "../../components/Button";
import { findHandicapReferenceScores } from "./handicapLookup";
import type { useRecordsPageState } from "./useRecordsPageState";

type RecordsPageState = ReturnType<typeof useRecordsPageState>;

export function HandicapReferencePanel({ state }: { state: RecordsPageState }) {
  const { bowDisciplineOptions, comparisonTables, groupedVisibleTables,
    handicapFamilies, handicapFilter, handicapTablesError, handicapTablesLoaded,
    handicapTablesLoading, handleBowDisciplineChange, handleFamilyChange,
    handleHandicapFilterChange, handleTableChange, selectedBowDiscipline,
    selectedFamily, selectedRound, selectedTable,
    sourceRevision, sourceTitle } = state;
  const hasLookup = handicapFilter.trim() !== "";
  const lookup = selectedTable
    ? findHandicapReferenceScores(handicapFilter, selectedTable, comparisonTables)
    : { status: "empty" as const };

  return <section className="records-page-panel records-handicap-panel" aria-labelledby="handicap-finder-title">
    <div className="records-handicap-header">
      <div>
        <h3 id="handicap-finder-title">Find a reference score</h3>
        <p className="records-page-panel-copy">Choose a round to see scores for your saved handicap, or enter another value.</p>
      </div>
      <p className="records-handicap-source">{sourceTitle}{sourceRevision ? ` (${sourceRevision})` : ""}</p>
    </div>

    {handicapTablesLoading ? <p role="status">Loading handicap tables...</p> : null}
    {handicapTablesError ? <p className="profile-error" role="alert">{handicapTablesError}</p> : null}

    {handicapTablesLoaded && selectedFamily && selectedTable ? <>
      <div className="records-handicap-controls">
        <label className="records-field">Table family
          <select value={selectedFamily.familyKey} onChange={(event) => handleFamilyChange(event.target.value)}>
            {handicapFamilies.map((family) => <option key={family.familyKey} value={family.familyKey}>
              {family.familyTitle}
            </option>)}
          </select>
        </label>
        <label className="records-field">Bow discipline
          <select value={selectedBowDiscipline} onChange={(event) => handleBowDisciplineChange(event.target.value)}>
            {bowDisciplineOptions.map((option) => <option key={option.value} value={option.value}>
              {option.label}
            </option>)}
          </select>
        </label>
        <label className="records-field">Round table
          <select value={selectedRound?.groupKey ?? ""} onChange={(event) => handleTableChange(event.target.value)}>
            {groupedVisibleTables.map((group) => <option key={group.groupKey} value={group.groupKey}>
              {group.label}
            </option>)}
          </select>
        </label>
        <div className="records-handicap-filter">
          <label className="records-field">Your handicap
            <input type="number" min="0" step="1" inputMode="numeric" value={handicapFilter}
              onChange={(event) => handleHandicapFilterChange(event.target.value)} placeholder="Enter a value" />
          </label>
          {hasLookup ? <Button type="button" variant="ghost"
            onClick={() => handleHandicapFilterChange("")}>Clear</Button> : null}
        </div>
      </div>

      {hasLookup ? <div className="records-handicap-result" role="status">
        {lookup.status === "invalid" ? <p>Enter a whole-number handicap.</p> : lookup.status === "missing"
          ? <p>No reference score for that handicap in this table.</p> : lookup.status === "found" ? <>
          <p className="records-handicap-result-heading">Reference scores for handicap {lookup.handicap}</p>
          <div className="records-handicap-result-grid">
            {lookup.scores.map((entry) => <div className="records-handicap-result-card" key={entry.tableKey}>
              <span>{entry.title}</span>
              <strong>{entry.score ?? "—"}</strong>
            </div>)}
          </div>
        </> : null}
      </div> : <p className="records-handicap-prompt">Enter your handicap above for a quick lookup.</p>}

      <details className="records-handicap-browse">
        <summary>Browse all {selectedTable.rows.length} handicap values</summary>
        <p className="records-handicap-description">{selectedFamily.description}</p>
        <div className="records-handicap-table-wrap">
          <table className="records-score-table records-score-table--comparison">
            <thead><tr><th scope="col">Handicap</th>
              {comparisonTables.map((table) => <th key={table.tableKey} scope="col">{table.title}</th>)}
            </tr></thead>
            <tbody>{selectedTable.rows.map((row) => <tr key={`${selectedTable.tableKey}-${row.handicapValue}`}>
              <th scope="row">{row.handicapValue}</th>
              {comparisonTables.map((table) => <td key={table.tableKey}>
                {table.rows.find((entry) => entry.handicapValue === row.handicapValue)?.referenceScore ?? "—"}
              </td>)}
            </tr>)}</tbody>
          </table>
        </div>
      </details>
    </> : null}
  </section>;
}
