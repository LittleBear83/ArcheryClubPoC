import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/Button";
import { MobileKeyValueList } from "../components/mobile/MobileKeyValueList";
import { MobileSectionHeader } from "../components/mobile/MobileSectionHeader";
import { SectionPanel } from "../components/SectionPanel";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import { Modal } from "../components/Modal";
import { useIsMobile } from "../hooks/useIsMobile";
import {
  listCommitteeRoles,
  updateOwnCommitteeRoleBlurb,
} from "../../api/committeeApi";
import {
  formatMemberDisplayName,
  formatMemberDisplayUsername,
} from "../../utils/userProfile";

type CommitteeMember = {
  username: string;
  fullName: string;
  userType?: string;
};

type CommitteeRole = {
  id: number;
  title: string;
  summary: string;
  responsibilities?: string;
  personalBlurb?: string;
  photoDataUrl?: string | null;
  assignedMember?: CommitteeMember | null;
};

function getRoleBlurb(role: CommitteeRole) {
  if (role.personalBlurb?.trim()) {
    return role.personalBlurb.trim();
  }

  const assignedName = role.assignedMember
    ? formatMemberDisplayName(role.assignedMember)
    : "This role";

  return role.assignedMember
    ? `${assignedName} helps lead this area of club life and gives members a clear point of contact for ${role.title.toLowerCase()} matters.`
    : `This role supports the day-to-day running of the club and is ready to be assigned when a member takes responsibility for ${role.title.toLowerCase()}.`;
}

type CommitteeRolesResponse = {
  success: true;
  roles?: CommitteeRole[];
  members?: CommitteeMember[];
};

const committeeQueryKeys = {
  roles: (actorUsername: string) => ["committee-roles", actorUsername] as const,
};

export function CommitteeOrgChartPage({ currentUserProfile }) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [blurbDraft, setBlurbDraft] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const actorUsername = currentUserProfile?.auth?.username ?? "";

  const { data, isLoading } = useQuery({
    queryKey: committeeQueryKeys.roles(actorUsername),
    queryFn: () =>
      listCommitteeRoles<CommitteeRolesResponse>(currentUserProfile),
    enabled: Boolean(actorUsername),
  });

  const roles = data?.roles ?? [];
  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) ?? null,
    [roles, selectedRoleId],
  );
  const canEditSelectedRoleBlurb =
    Boolean(selectedRole?.assignedMember?.username) &&
    selectedRole?.assignedMember?.username === actorUsername;

  useEffect(() => {
    setBlurbDraft(selectedRole?.personalBlurb ?? "");
    setMessage("");
    setError("");
  }, [selectedRole?.id, selectedRole?.personalBlurb]);

  const saveBlurbMutation = useMutation({
    mutationFn: async ({ roleId, personalBlurb }: { roleId: number; personalBlurb: string }) =>
      updateOwnCommitteeRoleBlurb<CommitteeRole>(currentUserProfile, roleId, personalBlurb),
    onMutate: () => {
      setMessage("");
      setError("");
    },
    onSuccess: async (result) => {
      setBlurbDraft(result.role.personalBlurb ?? "");
      setMessage("Personal blurb updated.");
      await queryClient.invalidateQueries({
        queryKey: committeeQueryKeys.roles(actorUsername),
      });
    },
    onError: (saveError: Error) => {
      setError(saveError.message);
    },
  });

  return (
    <div
      className={[
        "profile-page",
        isMobile ? "committee-org-page--mobile" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <p>
        Committee roles for the archery club, ordered from senior governance roles
        through to associate member positions.
      </p>

      <StatusMessagePanel
        error={error}
        loading={isLoading}
        loadingLabel="Loading committee roles..."
        success={message}
      />

      {data ? (
        <SectionPanel
          className="profile-form committee-roles-panel"
          title="Committee Roles"
          titleClassName="committee-roles-title"
        >
          <div className="committee-role-card-grid">
            {roles.map((role) => (
              <button
                key={role.id}
                type="button"
                className="committee-role-card committee-role-card-button"
                onClick={() => setSelectedRoleId(role.id)}
              >
                <div className="committee-role-card-header">
                  {role.photoDataUrl ? (
                    <img
                      src={role.photoDataUrl}
                      alt={`${role.title} profile`}
                      className="committee-role-photo"
                    />
                  ) : (
                    <div
                      className="committee-role-photo-placeholder"
                      aria-hidden="true"
                    >
                      <span>Photo</span>
                    </div>
                  )}
                  <div className="committee-role-heading">
                    <h4>{role.title}</h4>
                    <p className="committee-role-summary committee-role-summary--compact">
                      {role.summary}
                    </p>
                  </div>
                </div>

                <div className="committee-role-card-meta">
                  <p
                    className={[
                      "committee-role-member",
                      role.assignedMember ? "" : "committee-role-member--unassigned",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <strong>Member:</strong>{" "}
                    {role.assignedMember
                      ? formatMemberDisplayName(role.assignedMember)
                      : "Unassigned"}
                  </p>
                  <span className="committee-role-card-cta">View details</span>
                </div>
              </button>
            ))}
          </div>
        </SectionPanel>
      ) : null}

      <Modal
        open={Boolean(selectedRole)}
        onClose={() => setSelectedRoleId(null)}
        title={selectedRole?.title ?? "Committee Role"}
        contentClassName={[
          "modal-content--wide",
          isMobile ? "committee-role-modal-sheet" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {selectedRole ? (
          <div
            className={[
              "committee-role-modal",
              isMobile ? "committee-role-modal--mobile" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="committee-role-modal-hero">
              {selectedRole.photoDataUrl ? (
                <img
                  src={selectedRole.photoDataUrl}
                  alt={`${selectedRole.title} profile`}
                  className="committee-role-photo committee-role-photo--large"
                />
              ) : (
                <div
                  className="committee-role-photo-placeholder committee-role-photo-placeholder--large"
                  aria-hidden="true"
                >
                  <span>Photo</span>
                </div>
              )}
              <div className="committee-role-modal-hero-copy">
                {isMobile ? (
                  <>
                    <MobileSectionHeader
                      title={selectedRole.title}
                      description={selectedRole.summary}
                    />
                    <MobileKeyValueList
                      items={[
                        {
                          label: "Member",
                          value: selectedRole.assignedMember
                            ? formatMemberDisplayName(selectedRole.assignedMember)
                            : "Unassigned",
                        },
                        {
                          label: "Username",
                          value: selectedRole.assignedMember
                            ? formatMemberDisplayUsername(selectedRole.assignedMember)
                            : "Not assigned",
                        },
                      ]}
                    />
                  </>
                ) : (
                  <>
                    <p className="committee-role-summary">{selectedRole.summary}</p>
                    <p className="committee-role-member">
                      <strong>Assigned member:</strong>{" "}
                      {selectedRole.assignedMember
                        ? `${formatMemberDisplayName(selectedRole.assignedMember)} (${formatMemberDisplayUsername(selectedRole.assignedMember)})`
                        : "Unassigned"}
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="committee-role-modal-grid">
              <section className="committee-role-section">
                <h5>Responsibilities</h5>
                <p>{selectedRole.responsibilities?.trim() || selectedRole.summary}</p>
              </section>

              <section className="committee-role-section">
                <h5>Personal Blurb</h5>
                {canEditSelectedRoleBlurb ? (
                  <div className="left-align-form">
                    <p>You can update your own committee profile blurb here.</p>
                    <textarea
                      value={blurbDraft}
                      onChange={(event) => setBlurbDraft(event.target.value)}
                      disabled={saveBlurbMutation.isPending}
                    />
                    <Button
                      type="button"
                      onClick={() => {
                        if (!selectedRole) {
                          return;
                        }

                        saveBlurbMutation.mutate({
                          roleId: selectedRole.id,
                          personalBlurb: blurbDraft,
                        });
                      }}
                      disabled={saveBlurbMutation.isPending}
                    >
                      {saveBlurbMutation.isPending ? "Saving..." : "Save personal blurb"}
                    </Button>
                  </div>
                ) : (
                  <p>{getRoleBlurb(selectedRole)}</p>
                )}
              </section>

              <section className="committee-role-section committee-role-section--full">
                <h5>Assigned Member</h5>
                <p className="committee-role-member">
                  {selectedRole.assignedMember
                    ? `${formatMemberDisplayName(selectedRole.assignedMember)} (${formatMemberDisplayUsername(selectedRole.assignedMember)})`
                    : "Unassigned"}
                </p>
              </section>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
