import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SectionPanel } from "../components/SectionPanel";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import { Modal } from "../components/Modal";
import { listCommitteeRoles } from "../../api/committeeApi";
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
  const [selectedRole, setSelectedRole] = useState<CommitteeRole | null>(null);
  const actorUsername = currentUserProfile?.auth?.username ?? "";

  const { data, isLoading } = useQuery({
    queryKey: committeeQueryKeys.roles(actorUsername),
    queryFn: () =>
      listCommitteeRoles<CommitteeRolesResponse>(currentUserProfile),
    enabled: Boolean(actorUsername),
  });

  const roles = data?.roles ?? [];

  return (
    <div className="profile-page">
      <p>
        Committee roles for the archery club, ordered from senior governance roles
        through to associate member positions.
      </p>

      <StatusMessagePanel
        error=""
        loading={isLoading}
        loadingLabel="Loading committee roles..."
        success=""
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
                onClick={() => setSelectedRole(role)}
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
        onClose={() => setSelectedRole(null)}
        title={selectedRole?.title ?? "Committee Role"}
        contentClassName="modal-content--wide"
      >
        {selectedRole ? (
          <div className="committee-role-modal">
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
                <p className="committee-role-summary">{selectedRole.summary}</p>
                <p className="committee-role-member">
                  <strong>Assigned member:</strong>{" "}
                  {selectedRole.assignedMember
                    ? `${formatMemberDisplayName(selectedRole.assignedMember)} (${formatMemberDisplayUsername(selectedRole.assignedMember)})`
                    : "Unassigned"}
                </p>
              </div>
            </div>

            <div className="committee-role-modal-grid">
              <section className="committee-role-section">
                <h5>Responsibilities</h5>
                <p>{selectedRole.responsibilities?.trim() || selectedRole.summary}</p>
              </section>

              <section className="committee-role-section">
                <h5>Personal Blurb</h5>
                <p>{getRoleBlurb(selectedRole)}</p>
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
