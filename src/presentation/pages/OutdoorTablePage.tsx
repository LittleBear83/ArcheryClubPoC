import { useMemo, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/Button";
import { SectionPanel } from "../components/SectionPanel";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import {
  listOutdoorTableDashboard,
  triggerGoldenRecordsOutdoorTableSync,
} from "../../api/outdoorTableApi";
import type { UserProfile } from "../../types/app";
import { formatDateTime } from "../../utils/dateTime";
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
  asc: "^",
  desc: "v",
};

function getAchievementColorClass(columnKey: string) {
  if (columnKey.startsWith("bowman")) {
    return "bowman";
  }

  if (columnKey.toLowerCase().includes("master")) {
    return "master";
  }

  return "archer";
}

export function OutdoorTablePage({
  currentUserProfile,
}: OutdoorTablePageProps) {
  const queryClient = useQueryClient();
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const actorRole = String(currentUserProfile?.membership?.role ?? "")
    .trim()
    .toLowerCase();
  const canManageOutdoorTable = hasPermission(
    currentUserProfile,
    "manage_members",
  );
  const canRunGoldenRecordsSync = [
    "admin",
    "developer",
  ].includes(actorRole);
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState("");
  const [syncErrorMessage, setSyncErrorMessage] = useState("");
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
  const goldenRecordsSyncMutation = useMutation({
    mutationFn: () => triggerGoldenRecordsOutdoorTableSync(currentUserProfile),
    onMutate: () => {
      setSyncSuccessMessage("");
      setSyncErrorMessage("");
    },
    onSuccess: async (result) => {
      setSyncSuccessMessage(result.message);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["outdoor-table"] }),
        queryClient.invalidateQueries({ queryKey: ["member-profiles"] }),
      ]);
    },
    onError: (error) => {
      setSyncErrorMessage(
        error instanceof Error
          ? error.message
          : "The Golden Records sync could not be started.",
      );
    },
  });

  const rows = useMemo(() => {
    const unsortedRows = dashboardQuery.data?.rows ?? [];

    return [...unsortedRows].sort((left, right) => {
      const leftPrimary = String(left[sortConfig.column] ?? "");
      const rightPrimary = String(right[sortConfig.column] ?? "");
      const primaryComparison = leftPrimary.localeCompare(
        rightPrimary,
        undefined,
        {
          sensitivity: "base",
        },
      );

      if (primaryComparison !== 0) {
        return sortConfig.direction === "asc"
          ? primaryComparison
          : primaryComparison * -1;
      }

      const surnameComparison = left.archerSurname.localeCompare(
        right.archerSurname,
        undefined,
        {
          sensitivity: "base",
        },
      );

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
  const goldenRecordsSyncInfo = useMemo(() => {
    const fetchedAt = dashboardQuery.data?.goldenRecordsFetchedAt ?? "";

    if (!fetchedAt) {
      return "Golden Records data has not been synced yet.";
    }

    return `Golden Records data last synced on ${formatDateTime(fetchedAt)}.`;
  }, [dashboardQuery.data?.goldenRecordsFetchedAt]);

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
        current.column === column && current.direction === "asc"
          ? "desc"
          : "asc",
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

  return (
    <div className="profile-page outdoor-table-page">
      <p>
        Keep the club&apos;s outdoor classification and award table in one
        place, with a desktop view that matches the paper table layout as
        closely as possible.
      </p>

      <StatusMessagePanel
        error=""
        info={goldenRecordsSyncInfo}
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
          <>
            <p className="outdoor-table-scroll-hint">
              Scroll sideways to view the full table on smaller screens.
            </p>
            <div className="outdoor-table-scroll">
            <table className="outdoor-table-matrix">
              <thead>
                <tr>
                  <th className="outdoor-table-title-cell" colSpan={3}>
                    Outdoor Table {selectedYear}
                  </th>
                  <th
                    className="outdoor-table-legend-cell"
                    colSpan={1 + OUTDOOR_ACHIEVEMENT_COLUMNS.length}
                  >
                    Previous Achievements
                  </th>
                  <th
                    className="outdoor-table-group-cell outdoor-table-group-cell--252"
                    colSpan={OUTDOOR_252_COLUMNS.length}
                  >
                    252 Round Sign-Offs
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
                  <th className="outdoor-table-head outdoor-table-head--name">
                    First Name
                  </th>
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
                  <th className="outdoor-table-head outdoor-table-head--handicap">
                    Handicap
                  </th>
                  {OUTDOOR_ACHIEVEMENT_COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      className={`outdoor-table-head outdoor-table-head--vertical outdoor-table-head--${getAchievementColorClass(
                        column.key,
                      )}`}
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
                    <th
                      key={column.key}
                      className="outdoor-table-head outdoor-table-head--distance"
                    >
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
                        className={`outdoor-table-mark outdoor-table-mark--${getAchievementColorClass(
                          column.key,
                        )} ${
                          entry[column.key] ? "is-active" : ""
                        }`}
                      />
                    ))}
                    {OUTDOOR_252_COLUMNS.map((column) => (
                      <td
                        key={column.awardKey}
                        className={`outdoor-table-mark outdoor-table-mark--252 ${
                          isAward252Complete(
                            entry,
                            column.awardKey,
                            column.signOffKey,
                          )
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
          </>
        )}
      </SectionPanel>

      {canRunGoldenRecordsSync ? (
        <SectionPanel
          className="outdoor-table-sync-panel"
          title="Golden Records Sync"
        >
          <div className="outdoor-table-sync-actions">
            <p className="outdoor-table-sync-copy">
              Run the Golden Records member sync now to refresh the outdoor
              table without waiting for the nightly schedule.
            </p>
            <Button
              onClick={() => goldenRecordsSyncMutation.mutate()}
              disabled={goldenRecordsSyncMutation.isPending}
            >
              {goldenRecordsSyncMutation.isPending
                ? "Running Golden Records Sync..."
                : "Run Golden Records Sync"}
            </Button>
          </div>
          <StatusMessagePanel
            error={syncErrorMessage}
            success={syncSuccessMessage}
          />
        </SectionPanel>
      ) : null}
    </div>
  );
}
