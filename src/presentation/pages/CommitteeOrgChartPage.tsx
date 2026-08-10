import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/Button";
import { MobileKeyValueList } from "../components/mobile/MobileKeyValueList";
import { MobileSectionHeader } from "../components/mobile/MobileSectionHeader";
import { SectionPanel } from "../components/SectionPanel";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import { Modal } from "../components/Modal";
import { useIsMobile } from "../hooks/useIsMobile";
import { subscribeToServerEvent } from "../../lib/serverEvents";
import {
  createCommitteeMinutes,
  listCommitteeMinutes,
  listCommitteeRoles,
  updateOwnCommitteeRoleBlurb,
} from "../../api/committeeApi";
import {
  formatMemberDisplayName,
  formatMemberDisplayUsername,
  hasPermission,
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

type CommitteeMinuteSection = {
  id: string;
  title: string;
  body: string;
};

type CommitteeMinuteAction = {
  id: string;
  text: string;
  owner: string;
};

type CommitteeMinute = {
  id: number;
  meetingDate: string;
  title: string;
  sections: CommitteeMinuteSection[];
  actions: CommitteeMinuteAction[];
  createdAtDate: string;
  createdAtTime: string;
  updatedAtDate: string;
  updatedAtTime: string;
  updatedByUsername: string;
};

type CommitteeRolesResponse = {
  success: true;
  roles?: CommitteeRole[];
  members?: CommitteeMember[];
};

type CommitteeMinutesResponse = {
  success: true;
  minutes?: CommitteeMinute[];
};

type TabId = "org-chart" | "meeting-minutes";

type MinutesDraft = {
  meetingDate: string;
  title: string;
  sections: CommitteeMinuteSection[];
  actions: CommitteeMinuteAction[];
};

const TAB_OPTIONS: Array<{ id: TabId; label: string }> = [
  { id: "org-chart", label: "Org Chart" },
  { id: "meeting-minutes", label: "Meeting Minutes" },
];

const committeeQueryKeys = {
  roles: (actorUsername: string) => ["committee-roles", actorUsername] as const,
  minutes: (actorUsername: string) => ["committee-minutes", actorUsername] as const,
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

function createMinutesSection(index: number, title = "", body = ""): CommitteeMinuteSection {
  return {
    id: `section-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    body,
  };
}

function createMinutesAction(index: number, text = "", owner = ""): CommitteeMinuteAction {
  return {
    id: `action-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    owner,
  };
}

function createDefaultMinutesDraft(): MinutesDraft {
  const today = new Date();
  const meetingDate = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  return {
    meetingDate,
    title: "Committee Meeting Minutes",
    sections: [
      createMinutesSection(1, "Attendees", ""),
      createMinutesSection(2, "Minutes of the Last Meeting", ""),
      createMinutesSection(3, "Chairman's Report", ""),
      createMinutesSection(4, "Treasurer's Report", ""),
      createMinutesSection(5, "Membership and Records Officer Report", ""),
      createMinutesSection(6, "AOB", ""),
    ],
    actions: [createMinutesAction(1, "", "")],
  };
}

function formatMinutesDateLabel(dateInput: string) {
  if (!dateInput) {
    return "";
  }

  const date = new Date(`${dateInput}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateInput;
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleString("en-GB", { month: "short" });
  const year = String(date.getFullYear()).slice(-2);

  return `${day} - ${month} - ${year}`;
}

export function CommitteeOrgChartPage({ currentUserProfile }) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState<TabId>("org-chart");
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [selectedMinuteId, setSelectedMinuteId] = useState<number | null>(null);
  const [blurbDraft, setBlurbDraft] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isCreateMinutesOpen, setIsCreateMinutesOpen] = useState(false);
  const [minutesDraft, setMinutesDraft] = useState<MinutesDraft>(() =>
    createDefaultMinutesDraft(),
  );
  const actorUsername = currentUserProfile?.auth?.username ?? "";

  const { data, isLoading } = useQuery({
    queryKey: committeeQueryKeys.roles(actorUsername),
    queryFn: () =>
      listCommitteeRoles<CommitteeRolesResponse>(currentUserProfile),
    enabled: Boolean(actorUsername),
  });

  const { data: minutesData, isLoading: isMinutesLoading } = useQuery({
    queryKey: committeeQueryKeys.minutes(actorUsername),
    queryFn: () =>
      listCommitteeMinutes<CommitteeMinutesResponse>(currentUserProfile),
    enabled: Boolean(actorUsername),
  });

  const roles = data?.roles ?? [];
  const minutes = minutesData?.minutes ?? [];
  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) ?? null,
    [roles, selectedRoleId],
  );
  const selectedMinute = useMemo(
    () => minutes.find((minute) => minute.id === selectedMinuteId) ?? minutes[0] ?? null,
    [minutes, selectedMinuteId],
  );
  const canEditSelectedRoleBlurb =
    Boolean(selectedRole?.assignedMember?.username) &&
    selectedRole?.assignedMember?.username === actorUsername;
  const canManageMinutes =
    hasPermission(currentUserProfile, "manage_committee_roles") ||
    roles.some(
      (role) =>
        role.assignedMember?.username?.trim().toLowerCase() ===
        actorUsername.trim().toLowerCase(),
    );

  useEffect(() => {
    setBlurbDraft(selectedRole?.personalBlurb ?? "");
    setMessage("");
    setError("");
  }, [selectedRole?.id, selectedRole?.personalBlurb]);

  useEffect(() => {
    if (!minutes.length) {
      setSelectedMinuteId(null);
      return;
    }

    if (!selectedMinuteId || !minutes.some((minute) => minute.id === selectedMinuteId)) {
      setSelectedMinuteId(minutes[0].id);
    }
  }, [minutes, selectedMinuteId]);

  useEffect(() => {
    if (!actorUsername) {
      return undefined;
    }

    const unsubscribeMinutes = subscribeToServerEvent(
      "committee-minutes.updated",
      () => {
        void queryClient.invalidateQueries({
          queryKey: committeeQueryKeys.minutes(actorUsername),
        });
      },
    );
    const unsubscribeCommittee = subscribeToServerEvent("committee.updated", () => {
      void queryClient.invalidateQueries({
        queryKey: committeeQueryKeys.roles(actorUsername),
      });
    });

    return () => {
      unsubscribeMinutes();
      unsubscribeCommittee();
    };
  }, [actorUsername, queryClient]);

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

  const createMinutesMutation = useMutation({
    mutationFn: async (draft: MinutesDraft) =>
      createCommitteeMinutes<CommitteeMinute>(currentUserProfile, draft),
    onMutate: () => {
      setMessage("");
      setError("");
    },
    onSuccess: async (result) => {
      setMessage(result.message ?? "Committee meeting minutes added.");
      setIsCreateMinutesOpen(false);
      setMinutesDraft(createDefaultMinutesDraft());
      await queryClient.invalidateQueries({
        queryKey: committeeQueryKeys.minutes(actorUsername),
      });

      if (result.minute?.id) {
        setSelectedTab("meeting-minutes");
        setSelectedMinuteId(result.minute.id);
      }
    },
    onError: (createError: Error) => {
      setError(createError.message);
    },
  });

  return (
    <div
      className={[
        "profile-page",
        "committee-hub-page",
        isMobile ? "committee-org-page--mobile" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <SectionPanel className="profile-form committee-hub-shell" title="The Committee">
        <p>
          Meet the current committee, or switch to the minutes tab to read the latest
          meeting notes and agreed actions.
        </p>

        <StatusMessagePanel
          error={error}
          loading={isLoading || isMinutesLoading}
          loadingLabel="Loading committee information..."
          success={message}
        />

        <div
          className="range-rules-tabs committee-tabs"
          role="tablist"
          aria-label="Committee content"
        >
          {TAB_OPTIONS.map((tab) => {
            const isActive = tab.id === selectedTab;

            return (
              <Button
                key={tab.id}
                aria-selected={isActive}
                className={`range-rules-tab committee-tab ${isActive ? "is-active" : ""}`}
                onClick={() => setSelectedTab(tab.id)}
                role="tab"
                variant={isActive ? "primary" : "ghost"}
              >
                {tab.label}
              </Button>
            );
          })}

          {selectedTab === "meeting-minutes" && canManageMinutes ? (
            <Button
              className="committee-minutes-add-button"
              onClick={() => setIsCreateMinutesOpen(true)}
              variant="secondary"
            >
              Add Meeting Minutes
            </Button>
          ) : null}
        </div>

        <div className="committee-hub-content">
          {selectedTab === "org-chart" ? (
            <div className="committee-roles-panel">
              <h3 className="committee-roles-title committee-hub-section-title">
                Committee Roles
              </h3>
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
            </div>
          ) : minutes.length === 0 ? (
            <div className="committee-minutes-panel committee-minutes-empty">
              <h3 className="committee-hub-section-title">Committee Meeting Minutes</h3>
              <p>No committee minutes have been added yet.</p>
            </div>
          ) : (
            <div className="committee-minutes-panel">
              <h3 className="committee-hub-section-title">Committee Meeting Minutes</h3>
              <div
                className={[
                  "committee-minutes-layout",
                  isMobile ? "committee-minutes-layout--mobile" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <aside className="committee-minutes-rail" aria-label="Meeting dates">
                  {minutes.map((minute) => {
                    const isSelected = minute.id === selectedMinute?.id;

                    return (
                      <button
                        key={minute.id}
                        type="button"
                        className={[
                          "committee-minutes-rail-item",
                          isSelected ? "is-selected" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => setSelectedMinuteId(minute.id)}
                      >
                        <span>{formatMinutesDateLabel(minute.meetingDate)}</span>
                      </button>
                    );
                  })}
                </aside>

                <div className="committee-minutes-detail">
                  {selectedMinute ? (
                    <>
                      <div className="committee-minutes-header">
                        <div>
                          <p className="committee-minutes-date">
                            {formatMinutesDateLabel(selectedMinute.meetingDate)}
                          </p>
                          <h3>{selectedMinute.title}</h3>
                        </div>
                      </div>

                      <div className="committee-minutes-sections">
                        {selectedMinute.sections.map((section, index) => (
                          <details
                            key={section.id}
                            className="committee-minutes-section"
                            open={index === 0}
                          >
                            <summary>{section.title}</summary>
                            <div className="committee-minutes-section-body">
                              {(section.body || "")
                                .split(/\n{2,}/)
                                .filter(Boolean)
                                .map((paragraph) => (
                                  <p key={`${section.id}-${paragraph.slice(0, 24)}`}>
                                    {paragraph}
                                  </p>
                                ))}
                            </div>
                          </details>
                        ))}
                      </div>

                      <section className="committee-minutes-actions-card">
                        <div className="committee-minutes-actions-header">
                          <h4>Actions Taken Away</h4>
                          <p>Follow-up items and who is responsible for them.</p>
                        </div>

                        {selectedMinute.actions.length === 0 ? (
                          <p className="committee-minutes-actions-empty">
                            No actions were recorded for this meeting.
                          </p>
                        ) : (
                          <div className="committee-minutes-actions-list">
                            {selectedMinute.actions.map((action) => (
                              <article
                                key={action.id}
                                className="committee-minutes-action-item"
                              >
                                <p className="committee-minutes-action-text">
                                  {action.text || "Action detail not recorded."}
                                </p>
                                <p className="committee-minutes-action-owner">
                                  <strong>Responsible:</strong> {action.owner || "TBC"}
                                </p>
                              </article>
                            ))}
                          </div>
                        )}
                      </section>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>
      </SectionPanel>

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

      <Modal
        open={isCreateMinutesOpen}
        onClose={() => setIsCreateMinutesOpen(false)}
        title="Add Committee Meeting Minutes"
        contentClassName="modal-content--wide"
      >
        <div className="left-align-form committee-minutes-form">
          <label>
            Meeting date
            <input
              type="date"
              value={minutesDraft.meetingDate}
              onChange={(event) =>
                setMinutesDraft((current) => ({
                  ...current,
                  meetingDate: event.target.value,
                }))
              }
            />
          </label>

          <label>
            Meeting title
            <input
              type="text"
              value={minutesDraft.title}
              onChange={(event) =>
                setMinutesDraft((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder="Committee meeting title"
            />
          </label>

          <div className="committee-minutes-form-group">
            <div className="committee-minutes-form-group-header">
              <h4>Minutes Sections</h4>
              <Button
                variant="ghost"
                onClick={() =>
                  setMinutesDraft((current) => ({
                    ...current,
                    sections: [
                      ...current.sections,
                      createMinutesSection(current.sections.length + 1),
                    ],
                  }))
                }
              >
                Add Section
              </Button>
            </div>

            {minutesDraft.sections.map((section, index) => (
              <div key={section.id} className="committee-minutes-form-card">
                <label>
                  Section title
                  <input
                    type="text"
                    value={section.title}
                    onChange={(event) =>
                      setMinutesDraft((current) => ({
                        ...current,
                        sections: current.sections.map((entry) =>
                          entry.id === section.id
                            ? { ...entry, title: event.target.value }
                            : entry,
                        ),
                      }))
                    }
                    placeholder="Chairman's Report"
                  />
                </label>
                <label>
                  Notes
                  <textarea
                    value={section.body}
                    onChange={(event) =>
                      setMinutesDraft((current) => ({
                        ...current,
                        sections: current.sections.map((entry) =>
                          entry.id === section.id
                            ? { ...entry, body: event.target.value }
                            : entry,
                        ),
                      }))
                    }
                    rows={5}
                    placeholder="Add the discussion points, decisions, and updates for this section."
                  />
                </label>
                <div className="committee-minutes-form-inline-actions">
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setMinutesDraft((current) => ({
                        ...current,
                        sections: current.sections.filter((entry) => entry.id !== section.id),
                      }))
                    }
                    disabled={minutesDraft.sections.length === 1}
                  >
                    Remove Section
                  </Button>
                  <span>Section {index + 1}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="committee-minutes-form-group">
            <div className="committee-minutes-form-group-header">
              <h4>Actions Taken Away</h4>
              <Button
                variant="ghost"
                onClick={() =>
                  setMinutesDraft((current) => ({
                    ...current,
                    actions: [
                      ...current.actions,
                      createMinutesAction(current.actions.length + 1),
                    ],
                  }))
                }
              >
                Add Action
              </Button>
            </div>

            {minutesDraft.actions.map((action) => (
              <div key={action.id} className="committee-minutes-form-card">
                <label>
                  Action
                  <textarea
                    value={action.text}
                    onChange={(event) =>
                      setMinutesDraft((current) => ({
                        ...current,
                        actions: current.actions.map((entry) =>
                          entry.id === action.id
                            ? { ...entry, text: event.target.value }
                            : entry,
                        ),
                      }))
                    }
                    rows={3}
                    placeholder="What needs to be followed up?"
                  />
                </label>
                <label>
                  Responsible person
                  <input
                    type="text"
                    value={action.owner}
                    onChange={(event) =>
                      setMinutesDraft((current) => ({
                        ...current,
                        actions: current.actions.map((entry) =>
                          entry.id === action.id
                            ? { ...entry, owner: event.target.value }
                            : entry,
                        ),
                      }))
                    }
                    placeholder="Who is taking this away?"
                  />
                </label>
                <div className="committee-minutes-form-inline-actions">
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setMinutesDraft((current) => ({
                        ...current,
                        actions: current.actions.filter((entry) => entry.id !== action.id),
                      }))
                    }
                    disabled={minutesDraft.actions.length === 1}
                  >
                    Remove Action
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="committee-minutes-form-submit">
            <Button
              variant="secondary"
              onClick={() => {
                setIsCreateMinutesOpen(false);
                setMinutesDraft(createDefaultMinutesDraft());
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createMinutesMutation.mutate(minutesDraft)}
              disabled={createMinutesMutation.isPending}
            >
              {createMinutesMutation.isPending ? "Saving..." : "Save Meeting Minutes"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
