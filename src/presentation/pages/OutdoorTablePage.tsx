import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/Button";
import { SectionPanel } from "../components/SectionPanel";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import {
  createOutdoorTableEntry,
  deleteOutdoorTableEntry,
  listOutdoorTableDashboard,
  listOutdoorTableMembers,
  updateOutdoorTableEntry,
  type OutdoorTableEntryPayload,
  type OutdoorTableMemberOption,
} from "../../api/outdoorTableApi";
import type { OutdoorTableEntry, UserProfile } from "../../types/app";
import { hasPermission } from "../../utils/userProfile";

type OutdoorTablePageProps = {
  currentUserProfile: UserProfile | null;
};

type OutdoorTableDraft = OutdoorTableEntryPayload & {
  id: number | null;
  handicapText: string;
};

type BooleanFieldKey = keyof Pick<
  OutdoorTableEntryPayload,
  | "archer3rd"
  | "archer2nd"
  | "archer1st"
  | "bowman3rd"
  | "bowman2nd"
  | "bowman1st"
  | "masterBowman"
  | "grandMasterBowman"
  | "eliteMasterBowman"
  | "award25220"
  | "award25230"
  | "award25240"
  | "award25250"
  | "award25260"
  | "award25280"
  | "award252100"
  | "cloutWhite20"
  | "cloutWhite30"
  | "cloutWhite40"
  | "cloutWhite50"
  | "cloutWhite60"
  | "cloutWhite7080"
  | "cloutWhite90100"
>;

const CURRENT_YEAR = new Date().getFullYear();
const BOW_OPTIONS = ["Rec", "Comp", "B/bow", "L/bow", "Flat"] as const;
const ACHIEVEMENT_COLUMNS: Array<{
  key: BooleanFieldKey;
  label: string;
  tone: "archer" | "bowman" | "master";
}> = [
  { key: "archer3rd", label: "Archer 3rd", tone: "archer" },
  { key: "archer2nd", label: "Archer 2nd", tone: "archer" },
  { key: "archer1st", label: "Archer 1st", tone: "archer" },
  { key: "bowman3rd", label: "Bowman 3rd", tone: "bowman" },
  { key: "bowman2nd", label: "Bowman 2nd", tone: "bowman" },
  { key: "bowman1st", label: "Bowman 1st", tone: "bowman" },
  { key: "masterBowman", label: "Master Bowman", tone: "master" },
  { key: "grandMasterBowman", label: "Grand Master Bowman", tone: "master" },
  { key: "eliteMasterBowman", label: "Elite Master Bowman", tone: "master" },
];
const AWARD_252_COLUMNS: Array<{ key: BooleanFieldKey; label: string }> = [
  { key: "award25220", label: "20" },
  { key: "award25230", label: "30" },
  { key: "award25240", label: "40" },
  { key: "award25250", label: "50" },
  { key: "award25260", label: "60" },
  { key: "award25280", label: "80" },
  { key: "award252100", label: "100" },
];
const CLOUT_COLUMNS: Array<{ key: BooleanFieldKey; label: string }> = [
  { key: "cloutWhite20", label: "20" },
  { key: "cloutWhite30", label: "30" },
  { key: "cloutWhite40", label: "40" },
  { key: "cloutWhite50", label: "50" },
  { key: "cloutWhite60", label: "60" },
  { key: "cloutWhite7080", label: "70/80" },
  { key: "cloutWhite90100", label: "90/100" },
];

function buildEmptyDraft(seasonYear: number): OutdoorTableDraft {
  return {
    id: null,
    seasonYear,
    archerUsername: "",
    bowType: "",
    handicap: null,
    handicapText: "",
    archer3rd: false,
    archer2nd: false,
    archer1st: false,
    bowman3rd: false,
    bowman2nd: false,
    bowman1st: false,
    masterBowman: false,
    grandMasterBowman: false,
    eliteMasterBowman: false,
    award25220: false,
    award25230: false,
    award25240: false,
    award25250: false,
    award25260: false,
    award25280: false,
    award252100: false,
    cloutWhite20: false,
    cloutWhite30: false,
    cloutWhite40: false,
    cloutWhite50: false,
    cloutWhite60: false,
    cloutWhite7080: false,
    cloutWhite90100: false,
  };
}

function buildDraftFromEntry(entry: OutdoorTableEntry): OutdoorTableDraft {
  return {
    id: entry.id,
    seasonYear: entry.seasonYear,
    archerUsername: entry.archerUsername,
    bowType: entry.bowType,
    handicap: entry.handicap,
    handicapText: entry.handicap === null ? "" : String(entry.handicap),
    archer3rd: entry.archer3rd,
    archer2nd: entry.archer2nd,
    archer1st: entry.archer1st,
    bowman3rd: entry.bowman3rd,
    bowman2nd: entry.bowman2nd,
    bowman1st: entry.bowman1st,
    masterBowman: entry.masterBowman,
    grandMasterBowman: entry.grandMasterBowman,
    eliteMasterBowman: entry.eliteMasterBowman,
    award25220: entry.award25220,
    award25230: entry.award25230,
    award25240: entry.award25240,
    award25250: entry.award25250,
    award25260: entry.award25260,
    award25280: entry.award25280,
    award252100: entry.award252100,
    cloutWhite20: entry.cloutWhite20,
    cloutWhite30: entry.cloutWhite30,
    cloutWhite40: entry.cloutWhite40,
    cloutWhite50: entry.cloutWhite50,
    cloutWhite60: entry.cloutWhite60,
    cloutWhite7080: entry.cloutWhite7080,
    cloutWhite90100: entry.cloutWhite90100,
  };
}

function toPayload(draft: OutdoorTableDraft): OutdoorTableEntryPayload {
  return {
    seasonYear: draft.seasonYear,
    archerUsername: draft.archerUsername,
    bowType: draft.bowType,
    handicap: draft.handicap,
    archer3rd: draft.archer3rd,
    archer2nd: draft.archer2nd,
    archer1st: draft.archer1st,
    bowman3rd: draft.bowman3rd,
    bowman2nd: draft.bowman2nd,
    bowman1st: draft.bowman1st,
    masterBowman: draft.masterBowman,
    grandMasterBowman: draft.grandMasterBowman,
    eliteMasterBowman: draft.eliteMasterBowman,
    award25220: draft.award25220,
    award25230: draft.award25230,
    award25240: draft.award25240,
    award25250: draft.award25250,
    award25260: draft.award25260,
    award25280: draft.award25280,
    award252100: draft.award252100,
    cloutWhite20: draft.cloutWhite20,
    cloutWhite30: draft.cloutWhite30,
    cloutWhite40: draft.cloutWhite40,
    cloutWhite50: draft.cloutWhite50,
    cloutWhite60: draft.cloutWhite60,
    cloutWhite7080: draft.cloutWhite7080,
    cloutWhite90100: draft.cloutWhite90100,
  };
}

function getMemberDisplayName(members: OutdoorTableMemberOption[], username: string) {
  return members.find((member) => member.username === username)?.fullName ?? username;
}

function getActiveCount(entry: OutdoorTableEntry, keys: BooleanFieldKey[]) {
  return keys.reduce((total, key) => total + (entry[key] ? 1 : 0), 0);
}

export function OutdoorTablePage({ currentUserProfile }: OutdoorTablePageProps) {
  const queryClient = useQueryClient();
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const canManageOutdoorTable = hasPermission(currentUserProfile, "manage_members");
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [draft, setDraft] = useState<OutdoorTableDraft>(() => buildEmptyDraft(CURRENT_YEAR));
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const dashboardQuery = useQuery({
    queryKey: ["outdoor-table", selectedYear, actorUsername],
    queryFn: () => listOutdoorTableDashboard(currentUserProfile, selectedYear),
    enabled: Boolean(actorUsername),
  });
  const membersQuery = useQuery({
    queryKey: ["outdoor-table-members", actorUsername],
    queryFn: () => listOutdoorTableMembers(currentUserProfile),
    enabled: canManageOutdoorTable && Boolean(actorUsername),
  });

  const rows = useMemo(() => dashboardQuery.data?.rows ?? [], [dashboardQuery.data?.rows]);
  const availableYears = useMemo(() => {
    const years = dashboardQuery.data?.availableYears ?? [];
    return Array.from(new Set([CURRENT_YEAR, selectedYear, ...years])).sort(
      (left, right) => right - left,
    );
  }, [dashboardQuery.data?.availableYears, selectedYear]);
  const memberOptions = useMemo(
    () => membersQuery.data?.members ?? [],
    [membersQuery.data?.members],
  );

  useEffect(() => {
    if (draft.id !== null) {
      return;
    }

    setDraft((currentDraft) => ({
      ...currentDraft,
      seasonYear: selectedYear,
    }));
  }, [draft.id, selectedYear]);

  const persistMutation = useMutation({
    mutationFn: async () => {
      const payload = toPayload(draft);

      if (draft.id === null) {
        return createOutdoorTableEntry(currentUserProfile, payload);
      }

      return updateOutdoorTableEntry(currentUserProfile, draft.id, payload);
    },
    onMutate: () => {
      setError("");
      setSuccess("");
    },
    onSuccess: async (result) => {
      setSuccess(
        `Outdoor table updated for ${result.entry.archerName || getMemberDisplayName(memberOptions, result.entry.archerUsername)} (${result.entry.bowType}).`,
      );
      setSelectedYear(result.entry.seasonYear);
      setDraft(buildEmptyDraft(result.entry.seasonYear));
      await queryClient.invalidateQueries({
        queryKey: ["outdoor-table"],
      });
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (draft.id === null) {
        throw new Error("Choose a row before trying to remove it.");
      }

      return deleteOutdoorTableEntry(currentUserProfile, draft.id);
    },
    onMutate: () => {
      setError("");
      setSuccess("");
    },
    onSuccess: async () => {
      setSuccess("Outdoor table row removed.");
      setDraft(buildEmptyDraft(selectedYear));
      await queryClient.invalidateQueries({
        queryKey: ["outdoor-table"],
      });
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message);
    },
  });

  const handleTextChange =
    (field: "archerUsername" | "bowType" | "handicapText") =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const nextValue = event.target.value;

      setDraft((currentDraft) => ({
        ...currentDraft,
        [field]: nextValue,
        handicap:
          field === "handicapText"
            ? nextValue.trim() === ""
              ? null
              : Number.parseInt(nextValue, 10)
            : currentDraft.handicap,
      }));
    };

  const handleYearChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextYear = Number.parseInt(event.target.value, 10);

    if (!Number.isInteger(nextYear)) {
      return;
    }

    setSelectedYear(nextYear);
    setSuccess("");
    setError("");
  };

  const handleDraftYearChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextYear = Number.parseInt(event.target.value, 10);

    setDraft((currentDraft) => ({
      ...currentDraft,
      seasonYear: Number.isInteger(nextYear) ? nextYear : currentDraft.seasonYear,
    }));
  };

  const handleBooleanChange = (field: BooleanFieldKey) => () => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      [field]: !currentDraft[field],
    }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void persistMutation.mutateAsync();
  };

  const resetDraft = () => {
    setDraft(buildEmptyDraft(selectedYear));
    setError("");
    setSuccess("");
  };

  return (
    <div className="profile-page outdoor-table-page">
      <p>
        Keep the club&apos;s outdoor classification and award table in one place, with a
        desktop view that matches the paper table layout as closely as possible.
      </p>

      <StatusMessagePanel
        error={error}
        loading={dashboardQuery.isLoading || membersQuery.isLoading}
        loadingLabel="Loading outdoor table..."
        success={success}
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
          {canManageOutdoorTable ? (
            <div className="outdoor-table-toolbar-actions">
              <Button onClick={resetDraft} type="button">
                {draft.id === null ? "Clear Form" : "Add New Row"}
              </Button>
            </div>
          ) : null}
        </div>
      </SectionPanel>

      {canManageOutdoorTable ? (
        <SectionPanel className="profile-form outdoor-table-form-panel" title="Edit Table Row">
          <form className="left-align-form outdoor-table-form" onSubmit={handleSubmit}>
            <div className="outdoor-table-form-grid">
              <label>
                Season Year
                <input
                  type="number"
                  min="2020"
                  max="2100"
                  value={draft.seasonYear}
                  onChange={handleDraftYearChange}
                  required
                />
              </label>

              <label>
                Archer
                <select
                  value={draft.archerUsername}
                  onChange={handleTextChange("archerUsername")}
                  required
                >
                  <option value="">Select member</option>
                  {memberOptions.map((member) => (
                    <option key={member.username} value={member.username}>
                      {member.fullName}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Bow
                <select value={draft.bowType} onChange={handleTextChange("bowType")} required>
                  <option value="">Select bow</option>
                  {BOW_OPTIONS.map((bowType) => (
                    <option key={bowType} value={bowType}>
                      {bowType}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Handicap
                <input
                  type="number"
                  min="0"
                  max="150"
                  value={draft.handicapText}
                  onChange={handleTextChange("handicapText")}
                />
              </label>
            </div>

            <div className="outdoor-table-checkbox-groups">
              <section className="outdoor-table-checkbox-card">
                <h3>Previous Achievements</h3>
                <div className="outdoor-table-checkbox-grid">
                  {ACHIEVEMENT_COLUMNS.map((column) => (
                    <label key={column.key} className="outdoor-table-checkbox">
                      <input
                        type="checkbox"
                        checked={draft[column.key]}
                        onChange={handleBooleanChange(column.key)}
                      />
                      <span>{column.label}</span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="outdoor-table-checkbox-card">
                <h3>252</h3>
                <div className="outdoor-table-checkbox-grid outdoor-table-checkbox-grid--compact">
                  {AWARD_252_COLUMNS.map((column) => (
                    <label key={column.key} className="outdoor-table-checkbox">
                      <input
                        type="checkbox"
                        checked={draft[column.key]}
                        onChange={handleBooleanChange(column.key)}
                      />
                      <span>{column.label}</span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="outdoor-table-checkbox-card">
                <h3>Clout White Award</h3>
                <div className="outdoor-table-checkbox-grid outdoor-table-checkbox-grid--compact">
                  {CLOUT_COLUMNS.map((column) => (
                    <label key={column.key} className="outdoor-table-checkbox">
                      <input
                        type="checkbox"
                        checked={draft[column.key]}
                        onChange={handleBooleanChange(column.key)}
                      />
                      <span>{column.label}</span>
                    </label>
                  ))}
                </div>
              </section>
            </div>

            <div className="outdoor-table-form-actions">
              <Button disabled={persistMutation.isPending} type="submit">
                {draft.id === null ? "Add Row" : "Save Changes"}
              </Button>
              {draft.id !== null ? (
                <>
                  <Button disabled={deleteMutation.isPending} onClick={resetDraft} type="button">
                    Cancel Edit
                  </Button>
                  <Button
                    className="outdoor-table-delete-button"
                    disabled={deleteMutation.isPending}
                    onClick={() => void deleteMutation.mutateAsync()}
                    type="button"
                  >
                    Delete Row
                  </Button>
                </>
              ) : null}
            </div>
          </form>
        </SectionPanel>
      ) : null}

      <SectionPanel className="outdoor-table-sheet-panel" title="Outdoor Table">
        <div className="outdoor-table-sheet-copy">
          <p>
            {canManageOutdoorTable
              ? "Click a table row to edit it."
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
                  <th className="outdoor-table-title-cell" colSpan={4}>
                    Selby Outdoor Table {selectedYear}
                  </th>
                  <th className="outdoor-table-legend-cell" colSpan={ACHIEVEMENT_COLUMNS.length}>
                    Denotes previous achievements
                  </th>
                  <th
                    className="outdoor-table-group-cell outdoor-table-group-cell--252"
                    colSpan={AWARD_252_COLUMNS.length}
                  >
                    252
                  </th>
                  <th
                    className="outdoor-table-group-cell outdoor-table-group-cell--clout"
                    colSpan={CLOUT_COLUMNS.length}
                  >
                    Clout White Award
                  </th>
                </tr>
                <tr>
                  <th className="outdoor-table-head outdoor-table-head--name">Surname</th>
                  <th className="outdoor-table-head outdoor-table-head--name">First Name</th>
                  <th className="outdoor-table-head outdoor-table-head--bow">Bow</th>
                  <th className="outdoor-table-head outdoor-table-head--handicap">Handicap</th>
                  {ACHIEVEMENT_COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      className={`outdoor-table-head outdoor-table-head--vertical outdoor-table-head--${column.tone}`}
                    >
                      <span>{column.label}</span>
                    </th>
                  ))}
                  {AWARD_252_COLUMNS.map((column) => (
                    <th key={column.key} className="outdoor-table-head outdoor-table-head--distance">
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
                  <tr
                    key={entry.id}
                    className={draft.id === entry.id ? "outdoor-table-row is-selected" : "outdoor-table-row"}
                    onClick={
                      canManageOutdoorTable
                        ? () => {
                            setDraft(buildDraftFromEntry(entry));
                            setError("");
                            setSuccess("");
                          }
                        : undefined
                    }
                  >
                    <td>{entry.archerSurname}</td>
                    <td>{entry.archerFirstName}</td>
                    <td>{entry.bowType}</td>
                    <td>{entry.handicap ?? ""}</td>
                    {ACHIEVEMENT_COLUMNS.map((column) => (
                      <td
                        key={column.key}
                        className={`outdoor-table-mark outdoor-table-mark--${column.tone} ${
                          entry[column.key] ? "is-active" : ""
                        }`}
                      />
                    ))}
                    {AWARD_252_COLUMNS.map((column) => (
                      <td
                        key={column.key}
                        className={`outdoor-table-mark outdoor-table-mark--252 ${
                          entry[column.key] ? "is-active" : ""
                        }`}
                      />
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

        <div className="outdoor-table-summary-grid">
          {rows.map((entry) => (
            <article key={`summary-${entry.id}`} className="outdoor-table-summary-card">
              <h3>
                {entry.archerName} | {entry.bowType}
              </h3>
              <p>Handicap: {entry.handicap ?? "Not set"}</p>
              <p>
                Previous achievements: {getActiveCount(entry, ACHIEVEMENT_COLUMNS.map((column) => column.key))}
              </p>
              <p>252 badges: {getActiveCount(entry, AWARD_252_COLUMNS.map((column) => column.key))}</p>
              <p>
                Clout white awards: {getActiveCount(entry, CLOUT_COLUMNS.map((column) => column.key))}
              </p>
            </article>
          ))}
        </div>
      </SectionPanel>
    </div>
  );
}
