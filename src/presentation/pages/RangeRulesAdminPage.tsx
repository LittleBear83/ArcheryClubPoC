import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRangeRules, updateRangeRules, type RangeRulesRecord } from "../../api/rangeRulesApi";
import { getDefaultRangeRulesContent } from "../../../shared/rangeRulesDefaults.js";
import { Button } from "../components/Button";
import { SectionPanel } from "../components/SectionPanel";
import { StatusMessagePanel } from "../components/StatusMessagePanel";

type RangeRulesAdminPageProps = {
  currentUserProfile: unknown;
};

const rangeRulesQueryKeys = {
  detail: (actorUsername: string) => ["range-rules", actorUsername] as const,
};

function createDraftFromRules(rangeRules: RangeRulesRecord): RangeRulesRecord {
  return {
    indoorRules: [...(rangeRules.indoorRules ?? [])],
    outdoorRules: [...(rangeRules.outdoorRules ?? [])],
    outdoorLaneRules: (rangeRules.outdoorLaneRules ?? []).map((entry) => ({ ...entry })),
    updatedAtDate: rangeRules.updatedAtDate ?? "",
    updatedAtTime: rangeRules.updatedAtTime ?? "",
    updatedByUsername: rangeRules.updatedByUsername ?? "",
  };
}

export function RangeRulesAdminPage({
  currentUserProfile,
}: RangeRulesAdminPageProps) {
  const actorUsername =
    (currentUserProfile as { auth?: { username?: string | null } } | null)?.auth
      ?.username ?? "";
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<RangeRulesRecord>(() =>
    createDraftFromRules(getDefaultRangeRulesContent()),
  );
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: rangeRulesQueryKeys.detail(actorUsername),
    queryFn: () => getRangeRules(currentUserProfile),
    enabled: Boolean(actorUsername),
  });

  const rangeRules = useMemo(
    () => data?.rangeRules ?? createDraftFromRules(getDefaultRangeRulesContent()),
    [data?.rangeRules],
  );

  useEffect(() => {
    setDraft(createDraftFromRules(rangeRules));
  }, [rangeRules]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateRangeRules(currentUserProfile, {
        indoorRules: draft.indoorRules,
        outdoorRules: draft.outdoorRules,
        outdoorLaneRules: draft.outdoorLaneRules,
      }),
    onMutate: () => {
      setSaveError("");
      setSaveSuccess("");
    },
    onSuccess: async () => {
      setSaveSuccess("Range rules updated successfully.");
      await queryClient.invalidateQueries({
        queryKey: rangeRulesQueryKeys.detail(actorUsername),
      });
    },
    onError: (error: Error) => {
      setSaveError(error.message);
    },
  });

  const handleRuleChange = (
    section: "indoorRules" | "outdoorRules",
    index: number,
    value: string,
  ) => {
    setDraft((current) => ({
      ...current,
      [section]: current[section].map((rule, ruleIndex) =>
        ruleIndex === index ? value : rule,
      ),
    }));
  };

  const addRule = (section: "indoorRules" | "outdoorRules") => {
    setDraft((current) => ({
      ...current,
      [section]: [...current[section], ""],
    }));
  };

  const removeRule = (section: "indoorRules" | "outdoorRules", index: number) => {
    setDraft((current) => ({
      ...current,
      [section]: current[section].filter((_, ruleIndex) => ruleIndex !== index),
    }));
  };

  const handleLaneRuleChange = (
    index: number,
    field: "lanes" | "distance",
    value: string,
  ) => {
    setDraft((current) => ({
      ...current,
      outdoorLaneRules: current.outdoorLaneRules.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry,
      ),
    }));
  };

  const addLaneRule = () => {
    setDraft((current) => ({
      ...current,
      outdoorLaneRules: [...current.outdoorLaneRules, { lanes: "", distance: "" }],
    }));
  };

  const removeLaneRule = (index: number) => {
    setDraft((current) => ({
      ...current,
      outdoorLaneRules: current.outdoorLaneRules.filter(
        (_, entryIndex) => entryIndex !== index,
      ),
    }));
  };

  return (
    <div className="profile-page range-rules-page">
      <SectionPanel className="profile-form" title="Range Rules Admin">
        <p>
          Update the rules shown on the member-facing range rules page. Changes are
          saved for all members.
        </p>

        <StatusMessagePanel
          error={saveError}
          loading={isLoading || saveMutation.isPending}
          loadingLabel={saveMutation.isPending ? "Saving range rules..." : "Loading range rules..."}
          success={saveSuccess}
        />

        <div className="range-rules-editor-grid">
          <div className="range-rules-editor-card">
            <div className="range-rules-editor-header">
              <h4>Indoor Rules</h4>
              <Button onClick={() => addRule("indoorRules")} size="sm" variant="secondary">
                Add Rule
              </Button>
            </div>
            {draft.indoorRules.map((rule, index) => (
              <div key={`indoor-${index}`} className="range-rules-editor-row">
                <textarea
                  className="range-rules-editor-textarea"
                  onChange={(event) =>
                    handleRuleChange("indoorRules", index, event.target.value)
                  }
                  rows={2}
                  value={rule}
                />
                <Button
                  className="range-rules-remove-button"
                  onClick={() => removeRule("indoorRules", index)}
                  size="sm"
                  variant="danger"
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>

          <div className="range-rules-editor-card">
            <div className="range-rules-editor-header">
              <h4>Outdoor Rules</h4>
              <Button onClick={() => addRule("outdoorRules")} size="sm" variant="secondary">
                Add Rule
              </Button>
            </div>
            {draft.outdoorRules.map((rule, index) => (
              <div key={`outdoor-${index}`} className="range-rules-editor-row">
                <textarea
                  className="range-rules-editor-textarea"
                  onChange={(event) =>
                    handleRuleChange("outdoorRules", index, event.target.value)
                  }
                  rows={2}
                  value={rule}
                />
                <Button
                  className="range-rules-remove-button"
                  onClick={() => removeRule("outdoorRules", index)}
                  size="sm"
                  variant="danger"
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="range-rules-editor-card range-rules-editor-card--wide">
          <div className="range-rules-editor-header">
            <h4>Outdoor Lane Table</h4>
            <Button onClick={addLaneRule} size="sm" variant="secondary">
              Add Lane Row
            </Button>
          </div>
          {draft.outdoorLaneRules.map((entry, index) => (
            <div key={`lane-${index}`} className="range-rules-lane-row">
              <input
                className="profile-input"
                onChange={(event) =>
                  handleLaneRuleChange(index, "lanes", event.target.value)
                }
                placeholder="Lanes"
                type="text"
                value={entry.lanes}
              />
              <input
                className="profile-input"
                onChange={(event) =>
                  handleLaneRuleChange(index, "distance", event.target.value)
                }
                placeholder="Maximum distance"
                type="text"
                value={entry.distance}
              />
              <Button
                className="range-rules-remove-button"
                onClick={() => removeLaneRule(index)}
                size="sm"
                variant="danger"
              >
                Remove
              </Button>
            </div>
          ))}
        </div>

        <div className="range-rules-editor-actions">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            Save Range Rules
          </Button>
        </div>
      </SectionPanel>
    </div>
  );
}
