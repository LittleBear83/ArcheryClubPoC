import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listIndoorTable, INDOOR_CLASSIFICATION_COLUMNS, INDOOR_SCORE_COLUMNS } from "../../api/indoorTableApi";
import { SectionPanel } from "../components/SectionPanel";
import type { UserProfile } from "../../types/app";

export function IndoorTablePage({ currentUserProfile }: { currentUserProfile: UserProfile | null }) {
  const year = new Date().getFullYear();
  const [sort, setSort] = useState<"name" | "bow">("name");
  const [descending, setDescending] = useState(false);
  const query = useQuery({ queryKey: ["indoor-table", year, currentUserProfile?.auth?.username],
    queryFn: () => listIndoorTable(currentUserProfile, year), enabled: Boolean(currentUserProfile?.auth?.username) });
  const rows = useMemo(() => [...(query.data?.rows ?? [])].sort((a, b) => {
    const left = sort === "name" ? `${a.archerSurname} ${a.archerFirstName}` : a.bowType;
    const right = sort === "name" ? `${b.archerSurname} ${b.archerFirstName}` : b.bowType;
    return left.localeCompare(right) * (descending ? -1 : 1);
  }), [query.data?.rows, sort, descending]);
  const toggle = (column: "name" | "bow") => { if (sort === column) setDescending(!descending); else { setSort(column); setDescending(false); } };
  return <div className="profile-page outdoor-table-page">
    <p>Indoor handicaps, classifications and score awards for the current season.</p>
    <SectionPanel className="outdoor-table-sheet-panel" title="Indoor Table">
      <p>Indoor progress is managed from each member profile.</p>
      {query.isLoading ? <p>Loading indoor table...</p> : query.isError ? <p role="alert">Could not load indoor achievements.</p>
        : rows.length === 0 ? <p>No indoor table rows have been added for {year} yet.</p> : <>
          <p className="outdoor-table-scroll-hint">Scroll sideways to view the full table on smaller screens.</p>
          <div className="outdoor-table-scroll">
            <table className="outdoor-table-matrix indoor-table-matrix">
              <thead><tr>
                <th className="outdoor-table-title-cell" colSpan={3}>Indoor Table {year}</th>
                <th className="outdoor-table-legend-cell" colSpan={INDOOR_CLASSIFICATION_COLUMNS.length}>Indoor Classifications</th>
                <th className="outdoor-table-group-cell outdoor-table-group-cell--252" colSpan={INDOOR_SCORE_COLUMNS.length}>Indoor Scores / Awards</th>
              </tr><tr>
                <th className="outdoor-table-head outdoor-table-head--name" aria-sort={sort === "name" ? (descending ? "descending" : "ascending") : "none"}><button type="button" className="outdoor-table-sort" onClick={() => toggle("name")}>Name</button></th>
                <th className="outdoor-table-head outdoor-table-head--bow" aria-sort={sort === "bow" ? (descending ? "descending" : "ascending") : "none"}><button type="button" className="outdoor-table-sort" onClick={() => toggle("bow")}>Bowstyle</button></th>
                <th className="outdoor-table-head outdoor-table-head--handicap">Handicap</th>
                {INDOOR_CLASSIFICATION_COLUMNS.map((column) => <th key={column.key} className={`outdoor-table-head outdoor-table-head--vertical outdoor-table-head--${column.key.startsWith("archer") ? "archer" : column.key.startsWith("bowman") ? "bowman" : "master"}`}><span>{column.label}</span></th>)}
                {INDOOR_SCORE_COLUMNS.map((score) => <th key={score} className="outdoor-table-head outdoor-table-head--distance">{score}</th>)}
              </tr></thead><tbody>
                {rows.map((row) => <tr key={row.id} className="outdoor-table-row">
                  <td>{row.archerName}</td><td>{row.bowType}</td><td>{row.handicap ?? ""}</td>
                  {INDOOR_CLASSIFICATION_COLUMNS.map((column) => <td key={column.key} title={row.classifications[column.key] || undefined} className={`outdoor-table-mark outdoor-table-mark--${column.key.startsWith("archer") ? "archer" : column.key.startsWith("bowman") ? "bowman" : "master"} ${row.classifications[column.key] ? "is-active" : ""}`}>{row.classifications[column.key] ? "✓" : ""}</td>)}
                  {INDOOR_SCORE_COLUMNS.map((score) => <td key={score} title={row.scores[String(score)] || undefined} className={`outdoor-table-mark outdoor-table-mark--252 ${row.scores[String(score)] ? "is-active" : ""}`}>{row.scores[String(score)] ? "✓" : ""}</td>)}
                </tr>)}
              </tbody></table>
          </div>
        </>}
    </SectionPanel>
  </div>;
}
