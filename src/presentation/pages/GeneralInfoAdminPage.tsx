import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getGeneralInfo, updateGeneralInfo, type GeneralInfoRecord } from "../../api/generalInfoApi";
import { Button } from "../components/Button";
import { SectionPanel } from "../components/SectionPanel";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import { hasPermission } from "../../utils/userProfile";
import { getDefaultGeneralInfoContent } from "../../../shared/generalInfoDefaults.js";

type GeneralInfoAdminPageProps = {
  currentUserProfile: unknown;
};

const generalInfoQueryKeys = {
  detail: (actorUsername: string) => ["general-info", actorUsername] as const,
};

function createDraftFromGeneralInfo(generalInfo: GeneralInfoRecord): GeneralInfoRecord {
  return {
    introParagraphs: [...(generalInfo.introParagraphs ?? [])],
    quickFacts: [...(generalInfo.quickFacts ?? [])],
    facilities: [...(generalInfo.facilities ?? [])],
    beginners: [...(generalInfo.beginners ?? [])],
    clubLife: [...(generalInfo.clubLife ?? [])],
    updatedAtDate: generalInfo.updatedAtDate ?? "",
    updatedAtTime: generalInfo.updatedAtTime ?? "",
    updatedByUsername: generalInfo.updatedByUsername ?? "",
  };
}

type GeneralInfoListKey =
  | "introParagraphs"
  | "quickFacts"
  | "facilities"
  | "beginners"
  | "clubLife";

const GENERAL_INFO_SECTIONS: Array<{
  key: GeneralInfoListKey;
  title: string;
  addLabel: string;
  rows: number;
}> = [
  { key: "introParagraphs", title: "Intro Paragraphs", addLabel: "Add Paragraph", rows: 4 },
  { key: "quickFacts", title: "At A Glance", addLabel: "Add Fact", rows: 2 },
  { key: "facilities", title: "Facilities", addLabel: "Add Facility", rows: 2 },
  { key: "beginners", title: "Beginners And Membership", addLabel: "Add Item", rows: 2 },
  { key: "clubLife", title: "Club Life", addLabel: "Add Item", rows: 2 },
];

export function GeneralInfoAdminPage({
  currentUserProfile,
}: GeneralInfoAdminPageProps) {
  const actorUsername =
    (currentUserProfile as { auth?: { username?: string | null } } | null)?.auth?.username ?? "";
  const canManageGeneralInfo = hasPermission(currentUserProfile, "manage_range_rules");
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<GeneralInfoRecord>(() =>
    createDraftFromGeneralInfo(getDefaultGeneralInfoContent()),
  );
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: generalInfoQueryKeys.detail(actorUsername),
    queryFn: () => getGeneralInfo(currentUserProfile),
    enabled: canManageGeneralInfo && Boolean(actorUsername),
  });

  const generalInfo = useMemo(
    () => data?.generalInfo ?? createDraftFromGeneralInfo(getDefaultGeneralInfoContent()),
    [data?.generalInfo],
  );

  useEffect(() => {
    setDraft(createDraftFromGeneralInfo(generalInfo));
  }, [generalInfo]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateGeneralInfo(currentUserProfile, {
        introParagraphs: draft.introParagraphs,
        quickFacts: draft.quickFacts,
        facilities: draft.facilities,
        beginners: draft.beginners,
        clubLife: draft.clubLife,
      }),
    onMutate: () => {
      setSaveError("");
      setSaveSuccess("");
    },
    onSuccess: async () => {
      setSaveSuccess("General information updated successfully.");
      await queryClient.invalidateQueries({
        queryKey: generalInfoQueryKeys.detail(actorUsername),
      });
    },
    onError: (error: Error) => {
      setSaveError(error.message);
    },
  });

  const handleListChange = (section: GeneralInfoListKey, index: number, value: string) => {
    setDraft((current) => ({
      ...current,
      [section]: current[section].map((entry, entryIndex) =>
        entryIndex === index ? value : entry,
      ),
    }));
  };

  const addListEntry = (section: GeneralInfoListKey) => {
    setDraft((current) => ({
      ...current,
      [section]: [...current[section], ""],
    }));
  };

  const removeListEntry = (section: GeneralInfoListKey, index: number) => {
    setDraft((current) => ({
      ...current,
      [section]: current[section].filter((_, entryIndex) => entryIndex !== index),
    }));
  };

  if (!canManageGeneralInfo) {
    return <p>You do not have permission to update the general information page.</p>;
  }

  return (
    <div className="profile-page range-rules-page">
      <SectionPanel className="profile-form" title="General Information Admin">
        <p>
          Update the content shown on the member-facing general information page.
          Changes are saved for all members.
        </p>

        <StatusMessagePanel
          error={saveError}
          loading={isLoading || saveMutation.isPending}
          loadingLabel={saveMutation.isPending ? "Saving general information..." : "Loading general information..."}
          success={saveSuccess}
        />

        <div className="range-rules-editor-grid">
          {GENERAL_INFO_SECTIONS.map((section) => (
            <div key={section.key} className="range-rules-editor-card">
              <div className="range-rules-editor-header">
                <h4>{section.title}</h4>
                <Button
                  onClick={() => addListEntry(section.key)}
                  size="sm"
                  variant="secondary"
                >
                  {section.addLabel}
                </Button>
              </div>
              {draft[section.key].map((entry, index) => (
                <div key={`${section.key}-${index}`} className="range-rules-editor-row">
                  <textarea
                    className="range-rules-editor-textarea"
                    onChange={(event) =>
                      handleListChange(section.key, index, event.target.value)
                    }
                    rows={section.rows}
                    value={entry}
                  />
                  <Button
                    className="range-rules-remove-button"
                    onClick={() => removeListEntry(section.key, index)}
                    size="sm"
                    variant="danger"
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="range-rules-editor-actions">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            Save General Information
          </Button>
        </div>
      </SectionPanel>
    </div>
  );
}
