import { useMemo, useState, type ChangeEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { SectionPanel } from "../components/SectionPanel";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import { MobileCardList } from "../components/mobile/MobileCardList";
import { MobileKeyValueList } from "../components/mobile/MobileKeyValueList";
import { useIsMobile } from "../hooks/useIsMobile";
import { listOutdoorTableDashboard } from "../../api/outdoorTableApi";
import type { UserProfile } from "../../types/app";
import { hasPermission } from "../../utils/userProfile";
import {
  OUTDOOR_252_COLUMNS,
  OUTDOOR_ACHIEVEMENT_COLUMNS,
  countCompletedSignOffs,
  isAward252Complete,
} from "./profile/outdoorTableProfileUtils";

type OutdoorTablePageProps = {
  currentUserProfile: UserProfile | null;
};

const CURRENT_YEAR = new Date().getFullYear();
const CLOUT_COLUMNS = [
  { key: "cloutWhite20", label: "20" },
  { key: "cloutWhite30", label: "30" },
  { key: "cloutWhite40", label: "40" },
  { key: "cloutWhite50", label: "50" },
  { key: "cloutWhite60", label: "60" },
  { key: "cloutWhite7080", label: "70/80" },
  { key: "cloutWhite90100", label: "90/100" },
] as const;

type OutdoorTableSortColumn = "archerSurname" | "bowType";

const SORT_INDICATORS: Record<"asc" | "desc", string> = {
  asc: "▲",
  desc: "▼",
};

export function OutdoorTablePage({ currentUserProfile }: OutdoorTablePageProps) {
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const canManageOutdoorTable = hasPermission(currentUserProfile, "manage_members");
  const isMobile = useIsMobile();
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [sortConfig, setSortConfig] = useState<{
    column: OutdoorTableSortColumn;
    direction: "asc" | "desc";
  }>({
    column: "archerSurname",
    direction: "asc",
  });

  const dashboardQuery = useQuery({
    queryKey: ["outdoor-table", selectedYear, actorUsername],
    queryFn: () => listOutdoorTableDashboard(currentUserProfile, selectedYear),
    enabled: Boolean(actorUsername),
  });

  const rows = useMemo(() => {
    const unsortedRows = dashboardQuery.data?.rows ?? [];

    return [...unsortedRows].sort((left, right) => {
      const leftPrimary = String(left[sortConfig.column] ?? "");
      const rightPrimary = String(right[sortConfig.column] ?? "");
      const primaryComparison = leftPrimary.localeCompare(rightPrimary, undefined, {
        sensitivity: "base",
      });

      if (primaryComparison !== 0) {
        return sortConfig.direction === "asc" ? primaryComparison : primaryComparison * -1;
      }

      const surnameComparison = left.archerSurname.localeCompare(right.archerSurname, undefined, {
        sensitivity: "base",
      });

      if (surnameComparison !== 0) {
        return surnameComparison;
      }

      const firstNameComparison = left.archerFirstName.localeCompare(
        right.archerFirstName,
        undefined,
        { sensitivity: "base" },
      );

      if (firstNameComparison !== 0) {
        return firstNameComparison;
      }

      return left.bowType.localeCompare(right.bowType, undefined, {
        sensitivity: "base",
      });
    });
  }, [dashboardQuery.data?.rows, sortConfig]);
  const availableYears = useMemo(() => {
    const years = dashboardQuery.data?.availableYears ?? [];
    return Array.from(new Set([CURRENT_YEAR, selectedYear, ...years])).sort(
      (left, right) => right - left,
    );
  }, [dashboardQuery.data?.availableYears, selectedYear]);

  const handleYearChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextYear = Number.parseInt(event.target.value, 10);

    if (Number.isInteger(nextYear)) {
      setSelectedYear(nextYear);
    }
  };

  const toggleSort = (column: OutdoorTableSortColumn) => {
    setSortConfig((current) => ({
      column,
      direction:
        current.column === column && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const getSortAria = (column: OutdoorTableSortColumn) => {
    if (sortConfig.column !== column) {
      return "none";
    }

    return sortConfig.direction === "asc" ? "ascending" : "descending";
  };

  const getSortLabel = (label: string, column: OutdoorTableSortColumn) => {
    const isActive = sortConfig.column === column;
    const indicator = isActive ? SORT_INDICATORS[sortConfig.direction] : "";

    return indicator ? `${label} ${indicator}` : label;
  };

  const getAchievementSummary = (entry: (typeof rows)[number]) => {
    const completedLabels = OUTDOOR_ACHIEVEMENT_COLUMNS.filter((column) => entry[column.key]).map(
      (column) => column.label,
    );

    return completedLabels.length > 0 ? completedLabels.join(", ") : "None recorded";
  };

  const getSightMarksSummary = (entry: (typeof rows)[number]) => {
    const completedLabels = CLOUT_COLUMNS.filter((column) => entry[column.key]).map(
      (column) => `${column.label}y`,
    );

    return completedLabels.length > 0 ? completedLabels.join(", ") : "None agreed";
  };

  return (
    <div className="profile-page outdoor-table-page">
      <p>
        Keep the club&apos;s outdoor classification and award table in one place, with a
        desktop view that matches the paper table layout as closely as possible.
      </p>

      <StatusMessagePanel
        error=""
        loading={dashboardQuery.isLoading}
        loadingLabel="Loading outdoor table..."
        success=""
      />

      <SectionPanel
        className="outdoor-table-toolbar-panel"
        title={`Selby Outdoor Table ${selectedYear}`}
      >
        <div className="outdoor-table-toolbar">
          <label>
            Viewing Season
            <select value={selectedYear} onChange={handleYearChange}>
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
        </div>
      </SectionPanel>

      <SectionPanel className="outdoor-table-sheet-panel" title="Outdoor Table">
        <div className="outdoor-table-sheet-copy">
          <p>
            {canManageOutdoorTable
              ? "Outdoor progress is now managed from each member profile."
              : "This is a read-only view of the current outdoor table."}
          </p>
        </div>

        {rows.length === 0 ? (
          <p>No outdoor table rows have been added for {selectedYear} yet.</p>
        ) : isMobile ? (
          <MobileCardList className="outdoor-table-mobile-list">
            {rows.map((entry) => (
              <article key={entry.id} className="outdoor-table-mobile-card">
                <div className="outdoor-table-mobile-card-header">
                  <div>
                    <h3>{entry.archerName || `${entry.archerFirstName} ${entry.archerSurname}`.trim()}</h3>
                    <p>{entry.bowType}</p>
                  </div>
                  <span className="outdoor-table-mobile-handicap">
                    HC {entry.handicap ?? "-"}
                  </span>
                </div>

                <MobileKeyValueList
                  items={[
                    { label: "Surname", value: entry.archerSurname || "-" },
                    { label: "First name", value: entry.archerFirstName || "-" },
                    { label: "Previous", value: getAchievementSummary(entry) },
                    { label: "Sight marks", value: getSightMarksSummary(entry) },
                  ]}
                />

                <div className="outdoor-table-mobile-252-block">
                  <h4>252 Progress</h4>
                  <div className="outdoor-table-mobile-252-grid">
                    {OUTDOOR_252_COLUMNS.map((column) => {
                      const isComplete = isAward252Complete(
                        entry,
                        column.awardKey,
                        column.signOffKey,
                      );

                      return (
                        <div
                          key={`${entry.id}-${column.awardKey}`}
                          className={`outdoor-table-mobile-252-chip ${
                            isComplete ? "is-complete" : "is-pending"
                          }`}
                        >
                          <strong>{column.label}</strong>
                          <span>{countCompletedSignOffs(entry[column.signOffKey])}/3</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </article>
            ))}
          </MobileCardList>
        ) : (
          <div className="outdoor-table-scroll">
            <table className="outdoor-table-matrix">
              <thead>
                <tr>
                  <th className="outdoor-table-title-cell" colSpan={3}>
                    Selby Outdoor Table {selectedYear}
                  </th>
                  <th
                    className="outdoor-table-legend-cell"
                    colSpan={1 + OUTDOOR_ACHIEVEMENT_COLUMNS.length}
                  >
                    Denotes previous achievements
                  </th>
                  <th
                    className="outdoor-table-group-cell outdoor-table-group-cell--252"
                    colSpan={OUTDOOR_252_COLUMNS.length}
                  >
                    252
                  </th>
                  <th
                    className="outdoor-table-group-cell outdoor-table-group-cell--clout"
                    colSpan={CLOUT_COLUMNS.length}
                  >
                    Sight Marks Agreed
                  </th>
                </tr>
                <tr>
                  <th
                    aria-sort={getSortAria("archerSurname")}
                    className="outdoor-table-head outdoor-table-head--name"
                  >
                    <button
                      type="button"
                      className="outdoor-table-sort"
                      onClick={() => toggleSort("archerSurname")}
                    >
                      {getSortLabel("Surname", "archerSurname")}
                    </button>
                  </th>
                  <th className="outdoor-table-head outdoor-table-head--name">First Name</th>
                  <th
                    aria-sort={getSortAria("bowType")}
                    className="outdoor-table-head outdoor-table-head--bow"
                  >
                    <button
                      type="button"
                      className="outdoor-table-sort"
                      onClick={() => toggleSort("bowType")}
                    >
                      {getSortLabel("Bow", "bowType")}
                    </button>
                  </th>
                  <th className="outdoor-table-head outdoor-table-head--handicap">Handicap</th>
                  {OUTDOOR_ACHIEVEMENT_COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      className="outdoor-table-head outdoor-table-head--vertical outdoor-table-head--archer"
                    >
                      <span>{column.label}</span>
                    </th>
                  ))}
                  {OUTDOOR_252_COLUMNS.map((column) => (
                    <th
                      key={column.awardKey}
                      className="outdoor-table-head outdoor-table-head--distance"
                    >
                      {column.label}
                    </th>
                  ))}
                  {CLOUT_COLUMNS.map((column) => (
                    <th key={column.key} className="outdoor-table-head outdoor-table-head--distance">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <tr key={entry.id} className="outdoor-table-row">
                    <td>{entry.archerSurname}</td>
                    <td>{entry.archerFirstName}</td>
                    <td>{entry.bowType}</td>
                    <td>{entry.handicap ?? ""}</td>
                    {OUTDOOR_ACHIEVEMENT_COLUMNS.map((column) => (
                      <td
                        key={column.key}
                        className={`outdoor-table-mark outdoor-table-mark--archer ${
                          entry[column.key] ? "is-active" : ""
                        }`}
                      />
                    ))}
                    {OUTDOOR_252_COLUMNS.map((column) => (
                      <td
                        key={column.awardKey}
                        className={`outdoor-table-mark outdoor-table-mark--252 ${
                          isAward252Complete(entry, column.awardKey, column.signOffKey)
                            ? "is-active"
                            : ""
                        }`}
                      >
                        <span className="outdoor-table-mark-count">
                          {countCompletedSignOffs(entry[column.signOffKey])}/3
                        </span>
                      </td>
                    ))}
                    {CLOUT_COLUMNS.map((column) => (
                      <td
                        key={column.key}
                        className={`outdoor-table-mark outdoor-table-mark--clout ${
                          entry[column.key] ? "is-active" : ""
                        }`}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionPanel>
    </div>
  );
}
