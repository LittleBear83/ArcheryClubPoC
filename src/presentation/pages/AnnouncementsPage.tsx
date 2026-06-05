import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/Button";
import { DatePicker } from "../components/DatePicker";
import { Modal } from "../components/Modal";
import { SectionPanel } from "../components/SectionPanel";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import {
  createAnnouncement,
  listAnnouncementSeenMembers,
  listAnnouncements,
  updateAnnouncement,
  type AnnouncementRecord,
  type AnnouncementSeenMember,
  type AnnouncementSeverity,
} from "../../api/announcementApi";
import { formatDate } from "../../utils/dateTime";
import { hasPermission } from "../../utils/userProfile";
import { useIsMobile } from "../hooks/useIsMobile";

type AnnouncementsPageProps = {
  currentUserProfile: unknown;
};

type AnnouncementDraft = {
  activeFromDate: string;
  activeTillDate: string;
  severity: AnnouncementSeverity;
  message: string;
  escalateSeverity: boolean;
};

const ANNOUNCEMENT_MESSAGE_MAX_LENGTH = 256;

const announcementQueryKeys = {
  history: (actorUsername: string) => ["announcements", actorUsername] as const,
  seenMembers: (announcementId: number) => ["announcement-seen-members", announcementId] as const,
};

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

const emptyDraft: AnnouncementDraft = {
  activeFromDate: getTodayIsoDate(),
  activeTillDate: "",
  severity: "information",
  message: "",
  escalateSeverity: false,
};

const severityOptions: Array<{ value: AnnouncementSeverity; label: string }> = [
  { value: "information", label: "Information" },
  { value: "urgent", label: "Urgent" },
  { value: "urgent_important", label: "Urgent and Important" },
];

function getAnnouncementStatus(announcement: AnnouncementRecord) {
  const today = new Date().toISOString().slice(0, 10);

  if (announcement.activeFromDate > today) {
    return "Scheduled";
  }

  if (announcement.activeTillDate < today) {
    return "Expired";
  }

  return "Active";
}

function getSeverityLabel(severity: AnnouncementSeverity) {
  switch (severity) {
    case "urgent":
      return "Urgent";
    case "urgent_important":
      return "Urgent and Important";
    default:
      return "Information";
  }
}

export function AnnouncementsPage({ currentUserProfile }: AnnouncementsPageProps) {
  const isMobile = useIsMobile();
  const actorUsername =
    (currentUserProfile as { auth?: { username?: string | null } } | null)?.auth
      ?.username ?? "";
  const canManageAnnouncements = hasPermission(
    currentUserProfile,
    "manage_announcements",
  );
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<AnnouncementDraft>(emptyDraft);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<AnnouncementRecord | null>(null);
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<number | null>(
    null,
  );

  const { data, isLoading } = useQuery({
    queryKey: announcementQueryKeys.history(actorUsername),
    queryFn: () => listAnnouncements(currentUserProfile),
    enabled: canManageAnnouncements && Boolean(actorUsername),
  });

  const seenMembersQuery = useQuery({
    queryKey: announcementQueryKeys.seenMembers(selectedAnnouncement?.id ?? 0),
    queryFn: () =>
      listAnnouncementSeenMembers(currentUserProfile, selectedAnnouncement?.id ?? 0),
    enabled: Boolean(selectedAnnouncement?.id),
  });

  const announcements = useMemo(() => data?.announcements ?? [], [data?.announcements]);
  const seenMembers = useMemo<AnnouncementSeenMember[]>(
    () => seenMembersQuery.data?.members ?? [],
    [seenMembersQuery.data?.members],
  );
  const charactersRemaining =
    ANNOUNCEMENT_MESSAGE_MAX_LENGTH - draft.message.length;
  const isEditing = editingAnnouncementId !== null;

  const saveMutation = useMutation({
    mutationFn: () =>
      isEditing
        ? updateAnnouncement(currentUserProfile, editingAnnouncementId, draft)
        : createAnnouncement(currentUserProfile, draft),
    onMutate: () => {
      setError("");
      setMessage("");
    },
    onSuccess: async () => {
      setDraft({
        ...emptyDraft,
        activeFromDate: getTodayIsoDate(),
      });
      setEditingAnnouncementId(null);
      setMessage(
        isEditing
          ? "Announcement amended successfully."
          : "Announcement created successfully.",
      );
      await queryClient.invalidateQueries({
        queryKey: announcementQueryKeys.history(actorUsername),
      });
      void queryClient.invalidateQueries({
        queryKey: ["active-announcements", actorUsername],
      });
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message);
    },
  });

  const handleDraftChange = <K extends keyof AnnouncementDraft>(
    field: K,
    value: AnnouncementDraft[K],
  ) => {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = () => {
    saveMutation.mutate();
  };

  const handleEdit = (announcement: AnnouncementRecord) => {
    setDraft({
      activeFromDate: announcement.activeFromDate,
      activeTillDate: announcement.activeTillDate,
      severity: announcement.severity,
      message: announcement.message,
      escalateSeverity: announcement.escalateSeverity,
    });
    setEditingAnnouncementId(announcement.id);
    setError("");
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setDraft({
      ...emptyDraft,
      activeFromDate: getTodayIsoDate(),
    });
    setEditingAnnouncementId(null);
  };

  if (!canManageAnnouncements) {
    return <p>You do not have permission to manage announcements.</p>;
  }

  return (
    <>
      <div className="profile-page announcements-page">
        <p>
          Create announcements for members and review which members have seen each
          message.
        </p>

        <StatusMessagePanel
          error={error}
          loading={isLoading}
          loadingLabel="Loading announcements..."
          success={message}
        />

        <SectionPanel
          className="profile-form"
          title={isEditing ? "Amend Announcement" : "New Announcement"}
        >
          <div className="left-align-form announcements-form">
            <div className="announcements-page-note" role="note">
              <strong>i</strong>
              <span>
                this will show teh message to all users when the next log in
                between the active dates
              </span>
            </div>

            <div className="announcements-date-grid">
              <DatePicker
                label="Active from"
                value={draft.activeFromDate}
                onChange={(value) => handleDraftChange("activeFromDate", value)}
                required
              />
              <DatePicker
                label="Active till"
                value={draft.activeTillDate}
                min={draft.activeFromDate || undefined}
                onChange={(value) => handleDraftChange("activeTillDate", value)}
                required
              />
            </div>

            <label>
              Severity
              <select
                value={draft.severity}
                onChange={(event) =>
                  handleDraftChange(
                    "severity",
                    event.target.value as AnnouncementSeverity,
                  )
                }
              >
                {severityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="radio-group announcements-radio-group">
              <span className="announcements-radio-label">
                Increase severity as the active till date gets closer
              </span>
              <div className="radio-options">
                <label>
                  <input
                    type="radio"
                    name="announcement-escalation"
                    checked={draft.escalateSeverity === true}
                    onChange={() => handleDraftChange("escalateSeverity", true)}
                  />
                  Yes
                </label>
                <label>
                  <input
                    type="radio"
                    name="announcement-escalation"
                    checked={draft.escalateSeverity === false}
                    onChange={() => handleDraftChange("escalateSeverity", false)}
                  />
                  No
                </label>
              </div>
            </div>

            <label>
              Announcement
              <textarea
                value={draft.message}
                maxLength={ANNOUNCEMENT_MESSAGE_MAX_LENGTH}
                onChange={(event) =>
                  handleDraftChange(
                    "message",
                    event.target.value.slice(0, ANNOUNCEMENT_MESSAGE_MAX_LENGTH),
                  )
                }
                placeholder="Type the message that members should see."
              />
              <span className="announcements-character-count">
                {charactersRemaining} characters left
              </span>
            </label>

            <Button
              type="button"
              onClick={handleSubmit}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending
                ? isEditing
                  ? "Saving..."
                  : "Creating..."
                : isEditing
                  ? "Save amendments"
                  : "Create announcement"}
            </Button>
            {isEditing ? (
              <Button
                type="button"
                variant="secondary"
                className="secondary-button"
                onClick={handleCancelEdit}
                disabled={saveMutation.isPending}
              >
                Cancel amend
              </Button>
            ) : null}
          </div>
        </SectionPanel>

        <SectionPanel className="profile-form" title="Announcement History">
          {announcements.length === 0 ? (
            <p>No announcements have been created yet.</p>
          ) : isMobile ? (
            <div className="announcements-history-mobile-list">
              {announcements.map((announcement) => (
                <article
                  key={announcement.id}
                  className="announcements-history-mobile-card"
                >
                  <div className="announcements-history-mobile-row">
                    <strong>Status</strong>
                    <span>{getAnnouncementStatus(announcement)}</span>
                  </div>
                  <div className="announcements-history-mobile-row">
                    <strong>Severity</strong>
                    <span>{getSeverityLabel(announcement.severity)}</span>
                  </div>
                  <div className="announcements-history-mobile-row">
                    <strong>Active window</strong>
                    <span>
                      {formatDate(announcement.activeFromDate)} to{" "}
                      {formatDate(announcement.activeTillDate)}
                    </span>
                  </div>
                  <div className="announcements-history-mobile-row announcements-history-mobile-row--stacked">
                    <strong>Announcement</strong>
                    <span>{announcement.message}</span>
                  </div>
                  <div className="announcements-history-mobile-row">
                    <strong>Seen</strong>
                    <span>{announcement.seenCount ?? 0}</span>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="secondary-button announcements-history-mobile-button"
                    onClick={() => handleEdit(announcement)}
                  >
                    Amend
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="secondary-button announcements-history-mobile-button"
                    onClick={() => setSelectedAnnouncement(announcement)}
                  >
                    Seen members
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <div className="announcements-history-table-wrapper">
              <table className="announcements-history-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Severity</th>
                    <th>Active window</th>
                    <th>Announcement</th>
                    <th>Seen</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {announcements.map((announcement) => (
                    <tr key={announcement.id}>
                      <td>{getAnnouncementStatus(announcement)}</td>
                      <td>{getSeverityLabel(announcement.severity)}</td>
                      <td>
                        {formatDate(announcement.activeFromDate)} to{" "}
                        {formatDate(announcement.activeTillDate)}
                      </td>
                      <td className="announcements-history-message-cell">
                        {announcement.message}
                      </td>
                      <td>{announcement.seenCount ?? 0}</td>
                      <td>
                        <div className="announcements-history-actions">
                          <Button
                            type="button"
                            variant="secondary"
                            className="secondary-button"
                            onClick={() => handleEdit(announcement)}
                          >
                            Amend
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            className="secondary-button"
                            onClick={() => setSelectedAnnouncement(announcement)}
                          >
                            Seen members
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionPanel>
      </div>

      <Modal
        open={Boolean(selectedAnnouncement)}
        onClose={() => setSelectedAnnouncement(null)}
        title="Members who have seen this announcement"
      >
        <StatusMessagePanel
          error={seenMembersQuery.error instanceof Error ? seenMembersQuery.error.message : ""}
          loading={seenMembersQuery.isLoading}
          loadingLabel="Loading seen members..."
        />

        {selectedAnnouncement ? (
          <div className="announcements-seen-modal">
            <p className="announcements-seen-modal-message">
              {selectedAnnouncement.message}
            </p>
            {seenMembers.length === 0 ? (
              <p>No members have been recorded as seeing this announcement yet.</p>
            ) : (
              <ul className="announcements-seen-list">
                {seenMembers.map((member) => (
                  <li key={`${member.username}-${member.seenAtDate}-${member.seenAtTime}`}>
                    <strong>{member.fullName || member.username}</strong>
                    <span>
                      {" "}
                      ({member.username}) on {formatDate(member.seenAtDate)} at{" "}
                      {member.seenAtTime}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
