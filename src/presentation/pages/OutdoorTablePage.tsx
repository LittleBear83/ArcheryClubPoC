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
  | "cloutWhite20"
  | "cloutWhite30"
  | "cloutWhite40"
  | "cloutWhite50"
  | "cloutWhite60"
  | "cloutWhite7080"
  | "cloutWhite90100"
>;
type Award252FieldKey = keyof Pick<
  OutdoorTableEntryPayload,
  | "award25220"
  | "award25230"
  | "award25240"
  | "award25250"
  | "award25260"
  | "award25280"
  | "award252100"
>;
type Award252SignOffFieldKey = keyof Pick<
  OutdoorTableEntryPayload,
  | "award25220SignOffDates"
  | "award25230SignOffDates"
  | "award25240SignOffDates"
  | "award25250SignOffDates"
  | "award25260SignOffDates"
  | "award25280SignOffDates"
  | "award252100SignOffDates"
>;

const CURRENT_YEAR = new Date().getFullYear();
const BOW_OPTIONS = ["Rec", "Comp", "B/bow", "L/bow", "Flat"] as const;
const EMPTY_SIGN_OFF_DATES = ["", "", ""];
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
const AWARD_252_COLUMNS: Array<{
  awardKey: Award252FieldKey;
  label: string;
  signOffKey: Award252SignOffFieldKey;
}> = [
  { awardKey: "award25220", label: "20y", signOffKey: "award25220SignOffDates" },
  { awardKey: "award25230", label: "30y", signOffKey: "award25230SignOffDates" },
  { awardKey: "award25240", label: "40y", signOffKey: "award25240SignOffDates" },
  { awardKey: "award25250", label: "50y", signOffKey: "award25250SignOffDates" },
  { awardKey: "award25260", label: "60y", signOffKey: "award25260SignOffDates" },
  { awardKey: "award25280", label: "80y", signOffKey: "award25280SignOffDates" },
  { awardKey: "award252100", label: "100y", signOffKey: "award252100SignOffDates" },
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

function buildEmptyAwardSignOffDates() {
  return [...EMPTY_SIGN_OFF_DATES];
}

function normalizeAwardSignOffDates(value: string[] | null | undefined) {
  const normalizedDates = Array.isArray(value)
    ? value.slice(0, 3).map((entry) => (typeof entry === "string" ? entry : ""))
    : [];

  while (normalizedDates.length < 3) {
    normalizedDates.push("");
  }

  return normalizedDates;
}

function countCompletedSignOffs(signOffDates: string[]) {
  return normalizeAwardSignOffDates(signOffDates).filter(Boolean).length;
}

function getCompleted252Count(
  entry: Pick<OutdoorTableEntryPayload, Award252FieldKey | Award252SignOffFieldKey>,
) {
  return AWARD_252_COLUMNS.reduce(
    (total, column) =>
      total + (isAward252Complete(entry, column.awardKey, column.signOffKey) ? 1 : 0),
    0,
  );
}

function isAward252Complete(
  entry: Pick<OutdoorTableEntryPayload, Award252FieldKey | Award252SignOffFieldKey>,
  awardKey: Award252FieldKey,
  signOffKey: Award252SignOffFieldKey,
) {
  return entry[awardKey] || countCompletedSignOffs(entry[signOffKey]) >= 3;
}

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
    award25220SignOffDates: buildEmptyAwardSignOffDates(),
    award25230SignOffDates: buildEmptyAwardSignOffDates(),
    award25240SignOffDates: buildEmptyAwardSignOffDates(),
    award25250SignOffDates: buildEmptyAwardSignOffDates(),
    award25260SignOffDates: buildEmptyAwardSignOffDates(),
    award25280SignOffDates: buildEmptyAwardSignOffDates(),
    award252100SignOffDates: buildEmptyAwardSignOffDates(),
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
    award25220SignOffDates: normalizeAwardSignOffDates(entry.award25220SignOffDates),
    award25230SignOffDates: normalizeAwardSignOffDates(entry.award25230SignOffDates),
    award25240SignOffDates: normalizeAwardSignOffDates(entry.award25240SignOffDates),
    award25250SignOffDates: normalizeAwardSignOffDates(entry.award25250SignOffDates),
    award25260SignOffDates: normalizeAwardSignOffDates(entry.award25260SignOffDates),
    award25280SignOffDates: normalizeAwardSignOffDates(entry.award25280SignOffDates),
    award252100SignOffDates: normalizeAwardSignOffDates(entry.award252100SignOffDates),
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
  const award25220SignOffDates = normalizeAwardSignOffDates(draft.award25220SignOffDates);
  const award25230SignOffDates = normalizeAwardSignOffDates(draft.award25230SignOffDates);
  const award25240SignOffDates = normalizeAwardSignOffDates(draft.award25240SignOffDates);
  const award25250SignOffDates = normalizeAwardSignOffDates(draft.award25250SignOffDates);
  const award25260SignOffDates = normalizeAwardSignOffDates(draft.award25260SignOffDates);
  const award25280SignOffDates = normalizeAwardSignOffDates(draft.award25280SignOffDates);
  const award252100SignOffDates = normalizeAwardSignOffDates(draft.award252100SignOffDates);

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
    award25220: countCompletedSignOffs(award25220SignOffDates) >= 3,
    award25230: countCompletedSignOffs(award25230SignOffDates) >= 3,
    award25240: countCompletedSignOffs(award25240SignOffDates) >= 3,
    award25250: countCompletedSignOffs(award25250SignOffDates) >= 3,
    award25260: countCompletedSignOffs(award25260SignOffDates) >= 3,
    award25280: countCompletedSignOffs(award25280SignOffDates) >= 3,
    award252100: countCompletedSignOffs(award252100SignOffDates) >= 3,
    award25220SignOffDates,
    award25230SignOffDates,
    award25240SignOffDates,
    award25250SignOffDates,
    award25260SignOffDates,
    award25280SignOffDates,
    award252100SignOffDates,
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

  const handleAward252SignOffDateChange =
    (field: Award252SignOffFieldKey, index: number) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;

      setDraft((currentDraft) => {
        const nextDates = normalizeAwardSignOffDates(currentDraft[field]);
        nextDates[index] = nextValue;
        const linkedAward =
          AWARD_252_COLUMNS.find((column) => column.signOffKey === field)?.awardKey ?? null;
        const nextDraft: OutdoorTableDraft = {
          ...currentDraft,
          [field]: nextDates,
        };

        if (linkedAward) {
          nextDraft[linkedAward] = countCompletedSignOffs(nextDates) >= 3;
        }

        return nextDraft;
      });
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
                <p className="outdoor-table-card-copy">
                  Tick the classifications the archer had already achieved before this season.
                </p>
                <div className="outdoor-table-checkbox-grid outdoor-table-checkbox-grid--achievements">
                  {ACHIEVEMENT_COLUMNS.map((column) => (
                    <label key={column.key} className="outdoor-table-checkbox outdoor-table-checkbox--tile">
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

              <section className="outdoor-table-checkbox-card outdoor-table-checkbox-card--wide">
                <h3>252 Progress</h3>
                <p className="outdoor-table-card-copy">
                  Each distance needs three qualifying rounds of 252 or more before the award is complete.
                </p>
                <div className="outdoor-table-252-grid">
                  {AWARD_252_COLUMNS.map((column) => (
                    <article key={column.awardKey} className="outdoor-table-252-card">
                      <div className="outdoor-table-252-card-header">
                        <div>
                          <h4>{column.label}</h4>
                          <p>
                            {countCompletedSignOffs(draft[column.signOffKey])}/3 qualifying rounds
                          </p>
                        </div>
                        <span
                          className={`outdoor-table-status-pill ${
                            isAward252Complete(draft, column.awardKey, column.signOffKey)
                              ? "is-complete"
                              : "is-pending"
                          }`}
                        >
                          {isAward252Complete(draft, column.awardKey, column.signOffKey)
                            ? "Awarded"
                            : "In progress"}
                        </span>
                      </div>
                      <div className="outdoor-table-252-signoffs">
                        {normalizeAwardSignOffDates(draft[column.signOffKey]).map(
                          (signOffDate, index) => (
                            <label
                              key={`${column.signOffKey}-${index}`}
                              className="outdoor-table-252-signoff-row"
                            >
                              <span>Round {index + 1}</span>
                              <input
                                type="date"
                                value={signOffDate}
                                onChange={handleAward252SignOffDateChange(column.signOffKey, index)}
                              />
                            </label>
                          ),
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="outdoor-table-checkbox-card">
                <h3>Sight Marks Agreed</h3>
                <p className="outdoor-table-card-copy">
                  This now comes from the member profile distance sign-offs for the matching bow style.
                  Update it on the profile page and it will appear here automatically.
                </p>
                <div className="outdoor-table-checkbox-grid outdoor-table-checkbox-grid--compact">
                  {CLOUT_COLUMNS.map((column) => (
                    <label key={column.key} className="outdoor-table-checkbox outdoor-table-checkbox--tile">
                      <input
                        type="checkbox"
                        checked={draft[column.key]}
                        disabled
                        readOnly
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
                    Sight Marks Agreed
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

        <div className="outdoor-table-summary-grid">
          {rows.map((entry) => (
            <article key={`summary-${entry.id}`} className="outdoor-table-summary-card">
              <h3>
                {entry.archerName} | {entry.bowType}
              </h3>
              <p>Handicap: {entry.handicap ?? "Not set"}</p>
              <p>
                Previous achievements:{" "}
                {getActiveCount(entry, ACHIEVEMENT_COLUMNS.map((column) => column.key))}
              </p>
              <p>252 badges: {getCompleted252Count(entry)}</p>
              <p>
                Sight marks agreed: {getActiveCount(entry, CLOUT_COLUMNS.map((column) => column.key))}
              </p>
            </article>
          ))}
        </div>
      </SectionPanel>
    </div>
  );
}
