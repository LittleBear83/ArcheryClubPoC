import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { SectionPanel } from "../../components/SectionPanel";
import { formatDate } from "../../../utils/dateTime";
import { createIndoorTableEntry, INDOOR_CLASSIFICATION_COLUMNS, INDOOR_SCORE_COLUMNS,
  listIndoorTable, updateIndoorTableEntry, type IndoorTableEntry, type IndoorTablePayload } from "../../../api/indoorTableApi";
import type { UserProfile } from "../../../types/app";

const BOWS = [
  { discipline: "Recurve Bow", bowType: "Rec", label: "Recurve" },
  { discipline: "Compound Bow", bowType: "Comp", label: "Compound" },
  { discipline: "Bare Bow", bowType: "B/bow", label: "Barebow" },
  { discipline: "Long Bow", bowType: "L/bow", label: "Longbow" },
];

export function ProfileIndoorAchievementsSection({ currentUserProfile, username, disciplines, canManage,
  goldenRecordsHandicaps }: { currentUserProfile: UserProfile | null; username: string; disciplines: string[];
    canManage: boolean; goldenRecordsHandicaps: Record<string, { achieved: string; handicap: number | null }> }) {
  const year = new Date().getFullYear();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["indoor-table", year, currentUserProfile?.auth?.username],
    queryFn: () => listIndoorTable(currentUserProfile, year), enabled: Boolean(username && currentUserProfile?.auth?.username) });
  const [drafts, setDrafts] = useState<Record<string, IndoorTablePayload>>({});
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [collapsedBowTypes, setCollapsedBowTypes] = useState<Record<string, boolean>>({});
  const visibleBows = BOWS.filter((bow) => disciplines?.includes(bow.discipline));
  const hasMultipleDisciplines = visibleBows.length > 1;
  const rows = useMemo(() => (query.data?.rows ?? []).filter((row) => row.archerUsername === username),
    [query.data?.rows, username]);
  useEffect(() => {
    const next: Record<string, IndoorTablePayload> = {};
    for (const bow of BOWS.filter((item) => disciplines?.includes(item.discipline))) {
      const row = rows.find((entry) => entry.bowType === bow.bowType);
      next[bow.bowType] = { seasonYear: year, archerUsername: username, bowType: bow.bowType,
        handicap: row?.handicap ?? goldenRecordsHandicaps[bow.bowType]?.handicap ?? null,
        classifications: { ...(row?.classifications ?? {}) }, scores: { ...(row?.scores ?? {}) } };
    }
    setDrafts(next);
  // Refresh drafts only when the loaded table or selected member changes.
  }, [rows, username, disciplines, goldenRecordsHandicaps, year]);
  const editable = canManage && currentUserProfile?.auth?.username?.toLowerCase() !== username.toLowerCase();
  function update(bowType: string, change: Partial<IndoorTablePayload>) {
    setDrafts((current) => ({ ...current, [bowType]: { ...current[bowType], ...change } }));
  }
  async function save(bowType: string, row?: IndoorTableEntry) {
    const draft = drafts[bowType]; if (!draft) return;
    setSaving(bowType); setMessage("");
    try {
      if (row) await updateIndoorTableEntry(currentUserProfile, row.id, draft);
      else await createIndoorTableEntry(currentUserProfile, draft);
      await queryClient.invalidateQueries({ queryKey: ["indoor-table"] });
      setMessage(`${bowType} indoor achievements saved.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save indoor achievements."); }
    finally { setSaving(""); }
  }
  return <SectionPanel className="profile-form" title="Indoor Achievements">
    <div className="profile-outdoor-section-copy">
      <p>Record each indoor classification or score award by its achievement date. Golden Records indoor handicaps are imported when synced.</p>
      {!editable && canManage ? <p>Members cannot sign off their own indoor achievements.</p> : null}
      {message ? <p role="status">{message}</p> : null}
    </div>
    {query.isLoading ? <p>Loading indoor achievements...</p> : query.isError ? <p role="alert">Could not load indoor achievements.</p>
      : visibleBows.length === 0 ? <p>Add a discipline to this profile before recording indoor achievements.</p>
      : <div className="profile-outdoor-grid">
        {visibleBows.map((bow) => {
        const row = rows.find((entry) => entry.bowType === bow.bowType);
        const draft = drafts[bow.bowType];
        if (!draft) return null;
        const isCollapsed = hasMultipleDisciplines && (collapsedBowTypes[bow.bowType] ?? true);
        return <article key={bow.bowType} className="profile-outdoor-card">
          <div className="profile-outdoor-card-header">
            <div className="profile-outdoor-card-heading">
              <div className="profile-outdoor-card-title-row">
                <h3>{bow.label}</h3>
                {hasMultipleDisciplines ? (
                  <Button
                    type="button"
                    variant="unstyled"
                    className="profile-outdoor-collapse-button"
                    onClick={() => setCollapsedBowTypes((current) => ({
                      ...current,
                      [bow.bowType]: !(current[bow.bowType] ?? true),
                    }))}
                    aria-expanded={!isCollapsed}
                    aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${bow.label} indoor achievements`}
                  >
                    {isCollapsed ? "v" : "^"}
                  </Button>
                ) : null}
              </div>
              <p>{row ? "Existing indoor row" : "No indoor row yet"}</p>
            </div>
            <div className="profile-outdoor-handicap-summary">
              {editable ? (
                <label className="profile-outdoor-handicap-row">
                  <span>Indoor Handicap</span>
                  <input
                    className="profile-indoor-handicap-input"
                    type="number"
                    min="0"
                    max="150"
                    value={draft.handicap ?? ""}
                    onChange={(event) => update(bow.bowType, {
                      handicap: event.target.value === "" ? null : Number(event.target.value),
                    })}
                  />
                </label>
              ) : (
                <div className="profile-outdoor-handicap-row">
                  <span>Indoor Handicap</span>
                  <strong>{draft.handicap ?? ""}</strong>
                </div>
              )}
              {goldenRecordsHandicaps[bow.bowType]?.achieved &&
                goldenRecordsHandicaps[bow.bowType]?.handicap === draft.handicap ? (
                <small className="profile-outdoor-handicap-source">
                  Achieved on {formatDate(goldenRecordsHandicaps[bow.bowType].achieved)}
                </small>
              ) : null}
            </div>
          </div>
          {!isCollapsed ? <>
          <div className="profile-indoor-achievement-grid">
            {INDOOR_CLASSIFICATION_COLUMNS.map((column) => <label key={column.key}>{column.label}
              <input type="date" value={draft.classifications[column.key] ?? ""} disabled={!editable}
                onChange={(event) => update(bow.bowType, { classifications: { ...draft.classifications, [column.key]: event.target.value } })} />
            </label>)}
          </div>
          <h4 className="profile-indoor-awards-heading">Indoor Scores / Awards</h4>
          <div className="profile-indoor-achievement-grid">
            {INDOOR_SCORE_COLUMNS.map((score) => <label key={score}>{score}
              <input type="date" value={draft.scores[String(score)] ?? ""} disabled={!editable}
                onChange={(event) => update(bow.bowType, { scores: { ...draft.scores, [score]: event.target.value } })} />
            </label>)}
          </div>
          </> : null}
          {editable ? (
            <div className="profile-outdoor-card-actions">
              <Button type="button" onClick={() => void save(bow.bowType, row)} disabled={saving === bow.bowType}>
                {saving === bow.bowType ? "Saving..." : "Save"}
              </Button>
            </div>
          ) : null}
        </article>;
        })}
      </div>}
  </SectionPanel>;
}
