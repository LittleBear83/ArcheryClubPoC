import { Button } from "../../components/Button";
import { SectionPanel } from "../../components/SectionPanel";
import {
  OUTDOOR_252_COLUMNS,
  OUTDOOR_ACHIEVEMENT_COLUMNS,
  countCompletedSignOffs,
  isAward252Complete,
  normalizeAwardSignOffDates,
  type Outdoor252SignOffFieldKey,
  type OutdoorBooleanFieldKey,
  type ProfileOutdoorTableDraft,
} from "./outdoorTableProfileUtils";

type ProfileOutdoorAchievementsSectionProps = {
  canManageMembers: boolean;
  entries: ProfileOutdoorTableDraft[];
  error: string;
  isLoading: boolean;
  isSavingByBowType: Record<string, boolean>;
  onAward252SignOffDateChange: (
    bowType: string,
    field: Outdoor252SignOffFieldKey,
    index: number,
    value: string,
  ) => void;
  onBooleanChange: (bowType: string, field: OutdoorBooleanFieldKey) => void;
  onHandicapChange: (bowType: string, value: string) => void;
  onSave: (bowType: string) => void;
  seasonYear: number;
};

export function ProfileOutdoorAchievementsSection({
  canManageMembers,
  entries,
  error,
  isLoading,
  isSavingByBowType,
  onAward252SignOffDateChange,
  onBooleanChange,
  onHandicapChange,
  onSave,
  seasonYear,
}: ProfileOutdoorAchievementsSectionProps) {
  return (
    <SectionPanel
      className="profile-form"
      title={`Outdoor Achievements ${seasonYear}`}
    >
      <div className="profile-outdoor-section-copy">
        <p>
          Previous achievements and 252 progression are now managed per bow
          discipline here on the member profile.
        </p>
        {!canManageMembers ? (
          <p>This section is read-only.</p>
        ) : null}
        {error ? <p className="profile-error">{error}</p> : null}
      </div>

      {isLoading ? (
        <p>Loading outdoor achievements...</p>
      ) : entries.length === 0 ? (
        <p>Add a discipline to the member profile before recording outdoor achievements.</p>
      ) : (
        <div className="profile-outdoor-grid">
          {entries.map((entry) => (
            <article key={entry.bowType} className="profile-outdoor-card">
              <div className="profile-outdoor-card-header">
                <div>
                  <h3>{entry.discipline}</h3>
                  <p>{entry.isExistingEntry ? "Existing outdoor row" : "No outdoor row yet"}</p>
                </div>
                <label className="profile-outdoor-handicap">
                  <span>Handicap</span>
                  <input
                    type="number"
                    min="0"
                    max="150"
                    value={entry.handicapText}
                    onChange={(event) => onHandicapChange(entry.bowType, event.target.value)}
                    disabled={!canManageMembers || Boolean(isSavingByBowType[entry.bowType])}
                  />
                </label>
              </div>

              <div className="profile-outdoor-achievement-grid">
                {OUTDOOR_ACHIEVEMENT_COLUMNS.map((column) => (
                  <label
                    key={`${entry.bowType}-${column.key}`}
                    className="outdoor-table-checkbox outdoor-table-checkbox--tile"
                  >
                    <input
                      type="checkbox"
                      checked={entry[column.key]}
                      onChange={() => onBooleanChange(entry.bowType, column.key)}
                      disabled={!canManageMembers || Boolean(isSavingByBowType[entry.bowType])}
                    />
                    <span>{column.label}</span>
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
                          {countCompletedSignOffs(entry[column.signOffKey])}/3 qualifying rounds
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
                                !canManageMembers || Boolean(isSavingByBowType[entry.bowType])
                              }
                            />
                          </label>
                        ),
                      )}
                    </div>
                  </article>
                ))}
              </div>

              {canManageMembers ? (
                <div className="profile-outdoor-card-actions">
                  <Button
                    type="button"
                    onClick={() => onSave(entry.bowType)}
                    disabled={Boolean(isSavingByBowType[entry.bowType])}
                  >
                    {isSavingByBowType[entry.bowType]
                      ? "Saving..."
                      : entry.isExistingEntry
                        ? "Save Outdoor Progress"
                        : "Create Outdoor Row"}
                  </Button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </SectionPanel>
  );
}
