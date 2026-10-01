import { useMemo, useState } from "react";
import { Button } from "../../components/Button";
import { SectionPanel } from "../../components/SectionPanel";
import { formatDate } from "../../../utils/dateTime";
import {
  BOW_TYPE_DISCIPLINE_MAPPINGS,
  OUTDOOR_252_COLUMNS,
  OUTDOOR_ACHIEVEMENT_COLUMNS,
  countCompletedSignOffs,
  isAward252Complete,
  normalizeAwardSignOffDates,
  type Outdoor252SignOffFieldKey,
  type OutdoorAchievementDateFieldKey,
  type ProfileOutdoorTableDraft,
} from "./outdoorTableProfileUtils";

type ProfileOutdoorAchievementsSectionProps = {
  canManageOutdoorAchievements: boolean;
  canManageMembers: boolean;
  entries: ProfileOutdoorTableDraft[];
  error: string;
  goldenRecordsFetchedAt: string;
  goldenRecordsOutdoorHandicapsByBowType: Record<
    string,
    { achieved: string; handicap: number | null }
  >;
  isLoading: boolean;
  isSavingByBowType: Record<string, boolean>;
  onAward252SignOffDateChange: (
    bowType: string,
    field: Outdoor252SignOffFieldKey,
    index: number,
    value: string,
  ) => void;
  onAchievementDateChange: (
    bowType: string,
    field: OutdoorAchievementDateFieldKey,
    value: string,
  ) => void;
  onSave: (bowType: string) => void;
};

function formatHandicapValue(value: number | null | undefined) {
  return value === null || value === undefined || Number.isNaN(value) ? "" : String(value);
}

function formatAchievedDate(value: string | null | undefined) {
  return value ? formatDate(value) : "";
}

export function ProfileOutdoorAchievementsSection({
  canManageOutdoorAchievements,
  canManageMembers,
  entries,
  error,
  goldenRecordsFetchedAt,
  goldenRecordsOutdoorHandicapsByBowType,
  isLoading,
  isSavingByBowType,
  onAward252SignOffDateChange,
  onAchievementDateChange,
  onSave,
}: ProfileOutdoorAchievementsSectionProps) {
  const [collapsedBowTypes, setCollapsedBowTypes] = useState<Record<string, boolean>>({});
  const hasMultipleDisciplines = entries.length > 1;
  const bowLabelsByType = useMemo(
    () =>
      new Map<string, string>(
        BOW_TYPE_DISCIPLINE_MAPPINGS.map((mapping) => [mapping.bowType, mapping.label]),
      ),
    [],
  );
  const entriesByPreferredOrder = useMemo(() => {
    const order = new Map<string, number>(
      BOW_TYPE_DISCIPLINE_MAPPINGS.map((mapping, index) => [mapping.bowType, index]),
    );

    return [...entries].sort(
      (left, right) => (order.get(left.bowType) ?? 999) - (order.get(right.bowType) ?? 999),
    );
  }, [entries]);

  return (
    <SectionPanel className="profile-form" title="Outdoor Achievements">
      <div className="profile-outdoor-section-copy">
        <p>
          Previous achievements and 252 progression are managed per bow discipline here on the
          member profile.
        </p>
        {!canManageMembers ? <p>This section is read-only.</p> : null}
        {canManageMembers && !canManageOutdoorAchievements ? (
          <p>Members cannot sign off their own outdoor achievements.</p>
        ) : null}
        {error ? <p className="profile-error">{error}</p> : null}
      </div>

      {isLoading ? (
        <p>Loading outdoor achievements...</p>
      ) : entries.length === 0 ? (
        <p>Add a discipline to the member profile before recording outdoor achievements.</p>
      ) : (
        <div className="profile-outdoor-grid">
          {entriesByPreferredOrder.map((entry) => {
            const isCollapsed =
              hasMultipleDisciplines && (collapsedBowTypes[entry.bowType] ?? true);
            const bowLabel = bowLabelsByType.get(entry.bowType) ?? entry.discipline;
            const goldenRecordsOutdoorHandicap =
              goldenRecordsOutdoorHandicapsByBowType[entry.bowType] ?? null;
            const displayedOutdoorHandicap =
              goldenRecordsOutdoorHandicap?.handicap ?? entry.handicap ?? null;
            const displayedOutdoorHandicapAchieved =
              goldenRecordsOutdoorHandicap?.achieved ?? "";
            return (
              <article key={entry.bowType} className="profile-outdoor-card">
                <div className="profile-outdoor-card-header">
                  <div className="profile-outdoor-card-heading">
                    <div className="profile-outdoor-card-title-row">
                      <h3>{bowLabel}</h3>
                      {hasMultipleDisciplines ? (
                        <Button
                          type="button"
                          variant="unstyled"
                          className="profile-outdoor-collapse-button"
                          onClick={() =>
                            setCollapsedBowTypes((current) => ({
                              ...current,
                              [entry.bowType]: !(current[entry.bowType] ?? true),
                            }))
                          }
                          aria-expanded={!isCollapsed}
                          aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${bowLabel} achievements`}
                        >
                          {isCollapsed ? "v" : "^"}
                        </Button>
                      ) : null}
                    </div>
                    <p>{entry.isExistingEntry ? "Existing outdoor row" : "No outdoor row yet"}</p>
                  </div>

                  <div className="profile-outdoor-handicap-summary">
                    <div className="profile-outdoor-handicap-row">
                      <span>Outdoor Handicap</span>
                      <strong>{formatHandicapValue(displayedOutdoorHandicap)}</strong>
                    </div>
                    {displayedOutdoorHandicapAchieved ? (
                      <small className="profile-outdoor-handicap-source">
                        Achieved on {formatAchievedDate(displayedOutdoorHandicapAchieved)}
                      </small>
                    ) : entry.handicap !== null && entry.handicap !== undefined ? (
                      <small className="profile-outdoor-handicap-source">
                        Synced to the current outdoor table row.
                      </small>
                    ) : null}
                  </div>
                </div>

                {!isCollapsed ? (
                  <>
                    <div className="profile-outdoor-achievement-grid">
                      {OUTDOOR_ACHIEVEMENT_COLUMNS.map((column) => (
                        <label
                          key={`${entry.bowType}-${column.dateKey}`}
                          className="profile-outdoor-achievement-field"
                        >
                          <span>{column.label}</span>
                          <input
                            type="date"
                            value={entry[column.dateKey]}
                            onChange={(event) =>
                              onAchievementDateChange(
                                entry.bowType,
                                column.dateKey,
                                event.target.value,
                              )
                            }
                            disabled={
                              !canManageOutdoorAchievements ||
                              Boolean(isSavingByBowType[entry.bowType])
                            }
                          />
                        </label>
                      ))}
                    </div>

                    <div className="profile-outdoor-252-grid">
                      {OUTDOOR_252_COLUMNS.map((column) => (
                        <article
                          key={`${entry.bowType}-${column.awardKey}`}
                          className="outdoor-table-252-card"
                        >
                          <div className="outdoor-table-252-card-header">
                            <div>
                              <h4>{column.label}</h4>
                              <p>
                                {countCompletedSignOffs(entry[column.signOffKey])}/3 qualifying
                                rounds
                              </p>
                            </div>
                            <span
                              className={`outdoor-table-status-pill ${
                                isAward252Complete(entry, column.awardKey, column.signOffKey)
                                  ? "is-complete"
                                  : "is-pending"
                              }`}
                            >
                              {isAward252Complete(entry, column.awardKey, column.signOffKey)
                                ? "Awarded"
                                : "In progress"}
                            </span>
                          </div>
                          <div className="outdoor-table-252-signoffs">
                            {normalizeAwardSignOffDates(entry[column.signOffKey]).map(
                              (signOffDate, index) => (
                                <label
                                  key={`${entry.bowType}-${column.signOffKey}-${index}`}
                                  className="outdoor-table-252-signoff-row"
                                >
                                  <span>Round {index + 1}</span>
                                  <input
                                    type="date"
                                    value={signOffDate}
                                    onChange={(event) =>
                                    onAward252SignOffDateChange(
                                      entry.bowType,
                                      column.signOffKey,
                                      index,
                                      event.target.value,
                                    )
                                  }
                                  disabled={
                                      !canManageOutdoorAchievements ||
                                      Boolean(isSavingByBowType[entry.bowType])
                                    }
                                  />
                                </label>
                              ),
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                ) : null}

                {canManageMembers || canManageOutdoorAchievements ? (
                  <div className="profile-outdoor-card-actions">
                    {canManageOutdoorAchievements ? (
                      <Button
                        type="button"
                        onClick={() => onSave(entry.bowType)}
                        disabled={Boolean(isSavingByBowType[entry.bowType])}
                      >
                        {isSavingByBowType[entry.bowType] ? "Saving..." : "Save"}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <p className="profile-outdoor-footnote">
        {goldenRecordsFetchedAt
          ? `All records shown here are from Golden Records, and are correct as of ${formatDate(goldenRecordsFetchedAt)}.`
          : "All records shown here are from Golden Records."}
      </p>
    </SectionPanel>
  );
}
