import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/Button";
import { MobileKeyValueList } from "../components/mobile/MobileKeyValueList";
import { MobileSectionHeader } from "../components/mobile/MobileSectionHeader";
import { SectionPanel } from "../components/SectionPanel";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import { useIsMobile } from "../hooks/useIsMobile";
import {
  formatMemberDisplayName,
  formatMemberDisplayUsername,
  hasPermission,
} from "../../utils/userProfile";
import {
  createCommitteeRole,
  deleteCommitteeRole,
  listCommitteeRoles,
  updateCommitteeRole,
} from "../../api/committeeApi";

type CommitteeMember = {
  username: string;
  fullName: string;
  userType?: string;
};

type CommitteeRole = {
  id: number;
  roleKey: string;
  title: string;
  summary: string;
  responsibilities?: string;
  personalBlurb?: string;
  photoDataUrl?: string | null;
  assignedMember?: CommitteeMember | null;
};

type CommitteeRolesResponse = {
  success: true;
  roles?: CommitteeRole[];
  members?: CommitteeMember[];
};

type CommitteeRoleDraft = {
  title: string;
  summary: string;
  responsibilities: string;
  personalBlurb: string;
  photoDataUrl: string | null;
  assignedUsername: string;
};

const committeeQueryKeys = {
  roles: (actorUsername: string) => ["committee-roles", actorUsername] as const,
};

const createOptionValue = "__create__";
const MAX_COMMITTEE_PHOTO_DIMENSION_PX = 1200;
const TARGET_COMMITTEE_PHOTO_DATA_URL_LENGTH = 850_000;
const MIN_COMMITTEE_PHOTO_QUALITY = 0.45;
const COMMITTEE_PHOTO_QUALITY_STEP = 0.1;

const emptyDraft: CommitteeRoleDraft = {
  title: "",
  summary: "",
  responsibilities: "",
  personalBlurb: "",
  photoDataUrl: null,
  assignedUsername: "",
};

function buildDraft(role: CommitteeRole): CommitteeRoleDraft {
  return {
    title: role.title ?? "",
    summary: role.summary ?? "",
    responsibilities: role.responsibilities ?? role.summary ?? "",
    personalBlurb: role.personalBlurb ?? "",
    photoDataUrl: role.photoDataUrl ?? null,
    assignedUsername: role.assignedMember?.username ?? "",
  };
}

function loadImageFromFile(file: File) {
  const objectUrl = URL.createObjectURL(file);

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("The selected image could not be read."));
    };
    image.src = objectUrl;
  });
}

function calculateScaledDimensions(width: number, height: number, maxDimension: number) {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }

  if (width >= height) {
    return {
      width: maxDimension,
      height: Math.max(1, Math.round((height / width) * maxDimension)),
    };
  }

  return {
    width: Math.max(1, Math.round((width / height) * maxDimension)),
    height: maxDimension,
  };
}

async function buildCompressedImageDataUrl(file: File) {
  const image = await loadImageFromFile(file);
  let maxDimension = MAX_COMMITTEE_PHOTO_DIMENSION_PX;

  while (maxDimension >= 400) {
    const { width, height } = calculateScaledDimensions(
      image.naturalWidth,
      image.naturalHeight,
      maxDimension,
    );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Image upload is not supported in this browser.");
    }

    context.drawImage(image, 0, 0, width, height);

    for (
      let quality = 0.9;
      quality >= MIN_COMMITTEE_PHOTO_QUALITY;
      quality -= COMMITTEE_PHOTO_QUALITY_STEP
    ) {
      const roundedQuality = Number(quality.toFixed(2));
      const dataUrl = canvas.toDataURL("image/webp", roundedQuality);

      if (dataUrl.length <= TARGET_COMMITTEE_PHOTO_DATA_URL_LENGTH) {
        return dataUrl;
      }
    }

    maxDimension = Math.round(maxDimension * 0.75);
  }

  throw new Error(
    "The selected image is still too large after compression. Please choose a smaller photo.",
  );
}

export function CommitteeAdminPage({ currentUserProfile }) {
  const isMobile = useIsMobile();
  const [drafts, setDrafts] = useState<Record<number, CommitteeRoleDraft>>({});
  const [createDraft, setCreateDraft] = useState<CommitteeRoleDraft>(emptyDraft);
  const [selectedRoleId, setSelectedRoleId] = useState<string>(createOptionValue);
  const [savingRoleId, setSavingRoleId] = useState<number | null>(null);
  const [deletingRoleId, setDeletingRoleId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const canManageCommitteeRoles = hasPermission(
    currentUserProfile,
    "manage_committee_roles",
  );
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: committeeQueryKeys.roles(actorUsername),
    queryFn: () =>
      listCommitteeRoles<CommitteeRolesResponse>(currentUserProfile),
    enabled: canManageCommitteeRoles && Boolean(actorUsername),
  });

  const roles = useMemo(() => data?.roles ?? [], [data?.roles]);
  const members = useMemo(() => data?.members ?? [], [data?.members]);
  const activeSelectedRoleId =
    selectedRoleId === createOptionValue ||
    roles.some((role) => String(role.id) === selectedRoleId)
      ? selectedRoleId
      : createOptionValue;

  const selectedRole = useMemo(
    () =>
      activeSelectedRoleId === createOptionValue
        ? null
        : roles.find((role) => String(role.id) === activeSelectedRoleId) ?? null,
    [activeSelectedRoleId, roles],
  );

  const activeDraft = selectedRole
    ? drafts[selectedRole.id] ?? buildDraft(selectedRole)
    : createDraft;
  const isCreateMode = !selectedRole;
  const isSavingCurrent = selectedRole
    ? savingRoleId === selectedRole.id || deletingRoleId === selectedRole.id
    : isCreating;

  const saveRoleMutation = useMutation({
    mutationFn: async ({ roleId, draft }: { roleId: number; draft: CommitteeRoleDraft }) =>
      updateCommitteeRole<CommitteeRole>(currentUserProfile, roleId, draft),
    onMutate: ({ roleId }) => {
      setSavingRoleId(roleId);
      setError("");
      setMessage("");
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: committeeQueryKeys.roles(actorUsername),
      });
      setDrafts((current) => ({
        ...current,
        [result.role.id]: buildDraft(result.role),
      }));
      setMessage(`${result.role.title} updated successfully.`);
    },
    onError: (saveError: Error) => {
      setError(saveError.message);
    },
    onSettled: () => {
      setSavingRoleId(null);
    },
  });

  const createRoleMutation = useMutation({
    mutationFn: async (draft: CommitteeRoleDraft) =>
      createCommitteeRole<CommitteeRole>(currentUserProfile, draft),
    onMutate: () => {
      setIsCreating(true);
      setError("");
      setMessage("");
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: committeeQueryKeys.roles(actorUsername),
      });
      setCreateDraft(emptyDraft);
      setSelectedRoleId(String(result.role.id));
      setMessage(`${result.role.title} created successfully.`);
    },
    onError: (createError: Error) => {
      setError(createError.message);
    },
    onSettled: () => {
      setIsCreating(false);
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (role: CommitteeRole) =>
      deleteCommitteeRole(currentUserProfile, role.id),
    onMutate: (_role) => {
      setDeletingRoleId(_role.id);
      setError("");
      setMessage("");
    },
    onSuccess: async (_result, role) => {
      await queryClient.invalidateQueries({
        queryKey: committeeQueryKeys.roles(actorUsername),
      });
      setDrafts((current) => {
        const nextDrafts = { ...current };
        delete nextDrafts[role.id];
        return nextDrafts;
      });
      setSelectedRoleId(createOptionValue);
      setMessage(`${role.title} deleted successfully.`);
    },
    onError: (deleteError: Error) => {
      setError(deleteError.message);
    },
    onSettled: () => {
      setDeletingRoleId(null);
    },
  });

  const handleActiveDraftChange = (
    field: keyof CommitteeRoleDraft,
    value: string | null,
  ) => {
    if (selectedRole) {
      setDrafts((current) => ({
        ...current,
        [selectedRole.id]: {
          ...(current[selectedRole.id] ?? buildDraft(selectedRole)),
          [field]: value,
        },
      }));
      return;
    }

    setCreateDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handlePhotoSelected = async (file?: File | null) => {
    if (!file) {
      return;
    }

    try {
      const dataUrl = await buildCompressedImageDataUrl(file);
      handleActiveDraftChange("photoDataUrl", dataUrl);
      setError("");
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : "Image upload failed.");
    }
  };

  const handleSave = () => {
    if (selectedRole) {
      saveRoleMutation.mutate({
        roleId: selectedRole.id,
        draft: activeDraft,
      });
      return;
    }

    createRoleMutation.mutate(activeDraft);
  };

  const handleDelete = () => {
    if (!selectedRole) {
      return;
    }

    const confirmed = window.confirm(
      `Delete committee position '${selectedRole.title}'?`,
    );

    if (!confirmed) {
      return;
    }

    deleteRoleMutation.mutate(selectedRole);
  };

  if (!canManageCommitteeRoles) {
    return <p>You do not have permission to manage committee roles.</p>;
  }

  return (
    <div
      className={[
        "profile-page",
        isMobile ? "committee-admin-page--mobile" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <p>
        Create and manage committee positions, assign members, and maintain the
        content shown on the committee org chart.
      </p>

      <StatusMessagePanel
        error={error}
        loading={isLoading}
        loadingLabel="Loading committee admin data..."
        success={message}
      />

      <SectionPanel className="profile-form" title="Committee Position Editor">
        <div className="committee-admin-selector left-align-form">
          <label className="committee-admin-selector-field">
            Select position
            <select
              value={activeSelectedRoleId}
              onChange={(event) => setSelectedRoleId(event.target.value)}
              disabled={isLoading}
            >
              <option value={createOptionValue}>Add position</option>
              {roles.map((role) => (
                <option key={role.id} value={String(role.id)}>
                  {role.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <article
          className={[
            "committee-admin-card",
            isMobile ? "committee-admin-card--mobile" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div
            className={[
              "committee-admin-editor",
              "left-align-form",
              isMobile ? "committee-admin-editor--mobile" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div
              className={[
                "committee-admin-photo-column",
                isMobile ? "committee-admin-photo-column--mobile" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {isMobile ? (
                <MobileSectionHeader
                  title={isCreateMode ? "New Position" : "Edit Position"}
                  description={
                    isCreateMode
                      ? "Set up a committee role with member assignment, card copy, and profile details."
                      : "Update the selected committee role and keep the org chart in sync."
                  }
                />
              ) : null}
              {activeDraft.photoDataUrl ? (
                <img
                  src={activeDraft.photoDataUrl}
                  alt={`${activeDraft.title || "Committee role"} profile`}
                  className="committee-admin-photo-preview"
                />
              ) : (
                <div className="committee-role-photo-placeholder committee-role-photo-placeholder--large">
                  <span>Photo</span>
                </div>
              )}
              {isMobile ? (
                <MobileKeyValueList
                  items={[
                    {
                      label: "Mode",
                      value: isCreateMode ? "Create" : "Edit",
                    },
                    {
                      label: "Assigned",
                      value:
                        members.find(
                          (member) => member.username === activeDraft.assignedUsername,
                        )?.fullName ?? "Unassigned",
                    },
                    {
                      label: "Photo",
                      value: activeDraft.photoDataUrl ? "Added" : "Not added",
                    },
                  ]}
                />
              ) : null}
              <label className="committee-admin-file-field">
                <span>Upload profile photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => handlePhotoSelected(event.target.files?.[0] ?? null)}
                  disabled={isSavingCurrent}
                />
              </label>
              {activeDraft.photoDataUrl ? (
                <Button
                  type="button"
                  className="secondary-button"
                  variant="secondary"
                  onClick={() => handleActiveDraftChange("photoDataUrl", null)}
                  disabled={isSavingCurrent}
                >
                  Remove photo
                </Button>
              ) : null}
            </div>

            <div
              className={[
                "committee-admin-fields",
                isMobile ? "committee-admin-fields--mobile" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <label>
                Position title
                <input
                  value={activeDraft.title}
                  onChange={(event) => handleActiveDraftChange("title", event.target.value)}
                  disabled={isSavingCurrent}
                />
              </label>
              <label>
                Card summary
                <input
                  value={activeDraft.summary}
                  onChange={(event) => handleActiveDraftChange("summary", event.target.value)}
                  disabled={isSavingCurrent}
                />
              </label>
              <label>
                Responsibilities
                <textarea
                  value={activeDraft.responsibilities}
                  onChange={(event) =>
                    handleActiveDraftChange("responsibilities", event.target.value)
                  }
                  disabled={isSavingCurrent}
                />
              </label>
              <label>
                Personal blurb
                <textarea
                  value={activeDraft.personalBlurb}
                  onChange={(event) =>
                    handleActiveDraftChange("personalBlurb", event.target.value)
                  }
                  disabled={isSavingCurrent}
                />
              </label>
              <label>
                Assign member
                <select
                  value={activeDraft.assignedUsername}
                  onChange={(event) =>
                    handleActiveDraftChange("assignedUsername", event.target.value)
                  }
                  disabled={isSavingCurrent}
                >
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option key={member.username} value={member.username}>
                      {formatMemberDisplayName(member)} ({formatMemberDisplayUsername(member)})
                    </option>
                  ))}
                </select>
              </label>
              <div
                className={[
                  "committee-admin-actions",
                  isMobile ? "committee-admin-actions--mobile" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={isSavingCurrent}
                >
                  {isCreateMode
                    ? isCreating
                      ? "Creating position..."
                      : "Add position"
                    : savingRoleId === selectedRole?.id
                      ? "Saving..."
                      : "Save changes"}
                </Button>
                {!isCreateMode ? (
                  <Button
                    type="button"
                    variant="danger"
                    onClick={handleDelete}
                    disabled={isSavingCurrent}
                  >
                    {deletingRoleId === selectedRole?.id
                      ? "Deleting..."
                      : "Delete position"}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </article>
      </SectionPanel>
    </div>
  );
}
