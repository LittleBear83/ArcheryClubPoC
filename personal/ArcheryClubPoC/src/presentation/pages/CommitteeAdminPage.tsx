import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/Button";
import { SectionPanel } from "../components/SectionPanel";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import { hasPermission } from "../../utils/userProfile";
import { fetchApi } from "../../lib/api";

type CommitteeMember = {
  username: string;
  fullName: string;
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

const emptyDraft: CommitteeRoleDraft = {
  title: "",
  summary: "",
  responsibilities: "",
  personalBlurb: "",
  photoDataUrl: null,
  assignedUsername: "",
};

function buildHeaders(currentUserProfile) {
  return {
    "Content-Type": "application/json",
    "x-actor-username": currentUserProfile?.auth?.username ?? "",
  };
}

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

function readImageAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("The selected image could not be read."));
    };
    reader.onerror = () => reject(new Error("The selected image could not be read."));
    reader.readAsDataURL(file);
  });
}

export function CommitteeAdminPage({ currentUserProfile }) {
  const [drafts, setDrafts] = useState<Record<number, CommitteeRoleDraft>>({});
  const [createDraft, setCreateDraft] = useState<CommitteeRoleDraft>(emptyDraft);
  const [selectedRoleId, setSelectedRoleId] = useState<string>(createOptionValue);
  const [savingRoleId, setSavingRoleId] = useState<number | null>(null);
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
      fetchApi<CommitteeRolesResponse>("/api/committee-roles", {
        headers: buildHeaders(currentUserProfile),
        cache: "no-store",
      }),
    enabled: canManageCommitteeRoles && Boolean(actorUsername),
  });

  const roles = data?.roles ?? [];
  const members = data?.members ?? [];

  useEffect(() => {
    setDrafts(
      Object.fromEntries(roles.map((role) => [role.id, buildDraft(role)])),
    );
  }, [roles]);

  useEffect(() => {
    if (
      selectedRoleId !== createOptionValue &&
      !roles.some((role) => String(role.id) === selectedRoleId)
    ) {
      setSelectedRoleId(createOptionValue);
    }
  }, [roles, selectedRoleId]);

  const selectedRole = useMemo(
    () =>
      selectedRoleId === createOptionValue
        ? null
        : roles.find((role) => String(role.id) === selectedRoleId) ?? null,
    [roles, selectedRoleId],
  );

  const activeDraft = selectedRole
    ? drafts[selectedRole.id] ?? buildDraft(selectedRole)
    : createDraft;
  const isCreateMode = !selectedRole;
  const isSavingCurrent = selectedRole ? savingRoleId === selectedRole.id : isCreating;

  const saveRoleMutation = useMutation({
    mutationFn: async ({ roleId, draft }: { roleId: number; draft: CommitteeRoleDraft }) =>
      fetchApi<{ success: true; role: CommitteeRole }>(`/api/committee-roles/${roleId}`, {
        method: "PUT",
        headers: buildHeaders(currentUserProfile),
        cache: "no-store",
        body: JSON.stringify(draft),
      }),
    onMutate: ({ roleId }) => {
      setSavingRoleId(roleId);
      setError("");
      setMessage("");
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: committeeQueryKeys.roles(actorUsername),
      });
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
      fetchApi<{ success: true; role: CommitteeRole }>("/api/committee-roles", {
        method: "POST",
        headers: buildHeaders(currentUserProfile),
        cache: "no-store",
        body: JSON.stringify(draft),
      }),
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
      const dataUrl = await readImageAsDataUrl(file);
      handleActiveDraftChange("photoDataUrl", dataUrl);
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

  if (!canManageCommitteeRoles) {
    return <p>You do not have permission to manage committee roles.</p>;
  }

  return (
    <div className="profile-page">
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
              value={selectedRoleId}
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

        <article className="committee-admin-card">
          <div className="committee-admin-editor left-align-form">
            <div className="committee-admin-photo-column">
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

            <div className="committee-admin-fields">
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
                      {member.fullName} ({member.username})
                    </option>
                  ))}
                </select>
              </label>
              <div className="committee-admin-actions">
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
              </div>
            </div>
          </div>
        </article>
      </SectionPanel>
    </div>
  );
}
