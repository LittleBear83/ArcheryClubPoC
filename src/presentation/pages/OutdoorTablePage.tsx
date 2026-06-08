import { useMemo, useState, type ChangeEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { SectionPanel } from "../components/SectionPanel";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
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

export function OutdoorTablePage({ currentUserProfile }: OutdoorTablePageProps) {
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const canManageOutdoorTable = hasPermission(currentUserProfile, "manage_members");
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);

  const dashboardQuery = useQuery({
    queryKey: ["outdoor-table", selectedYear, actorUsername],
    queryFn: () => listOutdoorTableDashboard(currentUserProfile, selectedYear),
    enabled: Boolean(actorUsername),
  });

  const rows = useMemo(() => dashboardQuery.data?.rows ?? [], [dashboardQuery.data?.rows]);
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
                  <th className="outdoor-table-head outdoor-table-head--name">Surname</th>
                  <th className="outdoor-table-head outdoor-table-head--name">First Name</th>
                  <th className="outdoor-table-head outdoor-table-head--bow">Bow</th>
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
