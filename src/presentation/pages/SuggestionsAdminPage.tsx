import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { SectionPanel } from "../components/SectionPanel";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import {
  listSuggestions,
  updateSuggestionStatus,
  type SuggestionRecord,
  type SuggestionStatus,
} from "../../api/suggestionApi";
import { formatCompactDateTimeWithSeconds } from "../../utils/dateTime";
import { hasPermission } from "../../utils/userProfile";

type SuggestionsAdminPageProps = {
  currentUserProfile: unknown;
};

const suggestionQueryKeys = {
  suggestions: (actorUsername: string) => ["suggestions", actorUsername] as const,
};

const statusOptions: Array<{ value: SuggestionStatus; label: string }> = [
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "implemented", label: "Implemented" },
  { value: "declined", label: "Declined" },
];

export function SuggestionsAdminPage({
  currentUserProfile,
}: SuggestionsAdminPageProps) {
  const actorUsername =
    (currentUserProfile as { auth?: { username?: string | null } } | null)?.auth
      ?.username ?? "";
  const canManageSuggestions = hasPermission(
    currentUserProfile,
    "manage_announcements",
  );
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState<Record<number, string>>({});
  const [showArchive, setShowArchive] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [activeArchivedSuggestion, setActiveArchivedSuggestion] =
    useState<SuggestionRecord | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: suggestionQueryKeys.suggestions(actorUsername),
    queryFn: () => listSuggestions(currentUserProfile),
    enabled: canManageSuggestions && Boolean(actorUsername),
  });

  const suggestions = useMemo(
    () => data?.suggestions ?? [],
    [data?.suggestions],
  );
  const activeSuggestions = useMemo(
    () =>
      suggestions.filter(
        (suggestion) =>
          suggestion.status !== "implemented" && suggestion.status !== "declined",
      ),
    [suggestions],
  );
  const completedSuggestions = useMemo(
    () =>
      suggestions.filter(
        (suggestion) =>
          suggestion.status === "implemented" || suggestion.status === "declined",
      ),
    [suggestions],
  );
  const filteredCompletedSuggestions = useMemo(() => {
    const term = archiveSearch.trim().toLowerCase();

    if (!term) {
      return completedSuggestions;
    }

    return completedSuggestions.filter((suggestion) =>
      [
        suggestion.suggestionTitle,
        suggestion.submittedByName,
        suggestion.submittedByUsername,
        suggestion.status,
        suggestion.resolutionNote,
        suggestion.suggestionDetails,
        suggestion.improvementText,
        suggestion.createdAtDate,
        suggestion.createdAtTime,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [archiveSearch, completedSuggestions]);

  const statusMutation = useMutation({
    mutationFn: ({
      suggestionId,
      status,
      resolutionNote,
    }: {
      suggestionId: number;
      status: SuggestionStatus;
      resolutionNote: string;
    }) => updateSuggestionStatus(currentUserProfile, suggestionId, status, resolutionNote),
    onMutate: () => {
      setMessage("");
      setError("");
    },
    onSuccess: async (result) => {
      setMessage(result.message ?? "Suggestion status updated successfully.");
      if (result.suggestion) {
        setResolutionNotes((current) => ({
          ...current,
          [result.suggestion.id]: result.suggestion.resolutionNote ?? "",
        }));
      }
      await queryClient.invalidateQueries({
        queryKey: suggestionQueryKeys.suggestions(actorUsername),
      });
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message);
    },
  });

  if (!canManageSuggestions) {
    return <p>You do not have permission to review suggestions.</p>;
  }

  const renderSuggestionCard = (suggestion: SuggestionRecord, defaultOpen = false) => {
    const resolutionNote =
      resolutionNotes[suggestion.id] ?? suggestion.resolutionNote ?? "";
    const requiresResolutionNote =
      suggestion.status === "implemented" || suggestion.status === "declined";
    const hasResolutionNoteChanged =
      resolutionNote.trim() !== (suggestion.resolutionNote ?? "").trim();

    const handleSaveStatus = (nextStatus: SuggestionStatus) => {
      const nextResolutionNote =
        nextStatus === "implemented" || nextStatus === "declined"
          ? resolutionNote
          : "";

      if (
        (nextStatus === "implemented" || nextStatus === "declined") &&
        !nextResolutionNote.trim()
      ) {
        setError(
          "Add a note explaining why this suggestion was implemented or declined.",
        );
        setMessage("");
        return;
      }

      statusMutation.mutate({
        suggestionId: suggestion.id,
        status: nextStatus,
        resolutionNote: nextResolutionNote,
      });
    };

    return (
      <details key={suggestion.id} className="suggestion-inbox-card" open={defaultOpen}>
      <summary className="suggestion-inbox-card-summary">
        <div className="suggestion-inbox-card-summary-main">
          <p className="suggestion-inbox-card-label">Suggestion</p>
          <h3>{suggestion.suggestionTitle}</h3>
          <p className="suggestion-inbox-card-summary-meta">
            From {suggestion.submittedByName}
            {suggestion.submittedByUsername
              ? ` (${suggestion.submittedByUsername})`
              : " (Anonymous)"}
          </p>
        </div>

        <div className="suggestion-inbox-card-summary-side">
          <span className={`suggestion-status-pill suggestion-status-pill--${suggestion.status}`}>
            {statusOptions.find((option) => option.value === suggestion.status)?.label ??
              suggestion.status}
          </span>
          <p className="suggestion-inbox-card-summary-meta">
            {formatCompactDateTimeWithSeconds(
              `${suggestion.createdAtDate} ${suggestion.createdAtTime}`,
            )}
          </p>
        </div>
      </summary>

      <div className="suggestion-inbox-card-content">
        <div className="suggestion-inbox-card-header">
          <div className="suggestion-inbox-card-submitter">
            <p className="suggestion-inbox-card-label">Submitted by</p>
            <h3>{suggestion.submittedByName}</h3>
            <p>
              {suggestion.submittedByUsername
                ? suggestion.submittedByUsername
                : "Anonymous"}
            </p>
            <p>
              {formatCompactDateTimeWithSeconds(
                `${suggestion.createdAtDate} ${suggestion.createdAtTime}`,
              )}
            </p>
          </div>

          <div className="suggestion-inbox-card-status">
            <label className="left-align-form suggestion-inbox-status-field">
              <span className="suggestion-inbox-card-label">Status</span>
              <select
                value={suggestion.status}
                onChange={(event) =>
                  handleSaveStatus(event.target.value as SuggestionStatus)
                }
                disabled={statusMutation.isPending}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="left-align-form suggestion-inbox-status-field">
              <span className="suggestion-inbox-card-label">
                Outcome note
              </span>
              <textarea
                value={resolutionNote}
                onChange={(event) =>
                  setResolutionNotes((current) => ({
                    ...current,
                    [suggestion.id]: event.target.value,
                  }))
                }
                rows={4}
                placeholder="Explain why this suggestion was implemented or declined."
                disabled={statusMutation.isPending}
              />
              {requiresResolutionNote ? (
                <span className="suggestion-inbox-field-note">
                  This note is required when marking a suggestion as implemented or declined.
                </span>
              ) : null}
            </label>

            {requiresResolutionNote ? (
              <div className="suggestion-inbox-note-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleSaveStatus(suggestion.status)}
                  disabled={statusMutation.isPending || !hasResolutionNoteChanged}
                >
                  Save outcome note
                </Button>
              </div>
            ) : null}

            {suggestion.updatedAtDate ? (
              <p className="suggestion-inbox-update-note">
                Updated{" "}
                {formatCompactDateTimeWithSeconds(
                  `${suggestion.updatedAtDate} ${suggestion.updatedAtTime}`,
                )}
                {suggestion.updatedByName
                  ? ` by ${suggestion.updatedByName}`
                  : suggestion.updatedByUsername
                    ? ` by ${suggestion.updatedByUsername}`
                    : ""}
              </p>
            ) : null}
          </div>
        </div>

        <div className="suggestion-inbox-card-body">
          <section className="suggestion-inbox-card-section">
            <p className="suggestion-inbox-card-label">Suggestion</p>
            <h4>{suggestion.suggestionTitle}</h4>
            {suggestion.suggestionDetails ? (
              <p>{suggestion.suggestionDetails}</p>
            ) : (
              <p className="suggestion-inbox-empty-copy">
                No extra detail was provided.
              </p>
            )}
          </section>

          <section className="suggestion-inbox-card-section">
            <p className="suggestion-inbox-card-label">Improvement</p>
            <p>{suggestion.improvementText}</p>
          </section>

          {suggestion.resolutionNote ? (
            <section className="suggestion-inbox-card-section suggestion-inbox-card-section--full">
              <p className="suggestion-inbox-card-label">Committee outcome note</p>
              <p>{suggestion.resolutionNote}</p>
            </section>
          ) : null}
        </div>
      </div>
    </details>
    );
  };

  return (
    <div className="profile-page">
      <p>
        Review submitted club suggestions and track whether they are being assessed,
        implemented, or declined.
      </p>

      <StatusMessagePanel
        error={error}
        loading={isLoading}
        loadingLabel="Loading suggestions..."
        success={message}
      />

      <SectionPanel className="profile-form" title="Suggestion Inbox">
        {suggestions.length === 0 ? (
          <p>No suggestions have been submitted yet.</p>
        ) : (
          <div className="suggestion-inbox-sections">
            <section className="suggestion-inbox-group">
              <div className="suggestion-inbox-group-header">
                <h3>Active suggestions</h3>
                <p>{activeSuggestions.length} awaiting review or action</p>
              </div>
              {activeSuggestions.length === 0 ? (
                <p className="suggestion-inbox-empty-copy">
                  No active suggestions right now.
                </p>
              ) : (
                <div className="suggestion-inbox-list">
                  {activeSuggestions.map((suggestion) =>
                    renderSuggestionCard(suggestion),
                  )}
                </div>
              )}
            </section>

            <section className="suggestion-inbox-group">
              <div className="suggestion-inbox-group-header">
                <h3>Suggestion archive</h3>
                <p>
                  {completedSuggestions.length} closed suggestions
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="suggestion-archive-toggle"
                onClick={() => setShowArchive((current) => !current)}
              >
                {showArchive
                  ? "Hide archive"
                  : `Show archive (${completedSuggestions.length})`}
              </Button>
              {completedSuggestions.length === 0 ? (
                <p className="suggestion-inbox-empty-copy">
                  Closed suggestions will appear here once they are completed.
                </p>
              ) : !showArchive ? (
                <p className="suggestion-inbox-empty-copy">
                  Use the archive button to review closed suggestions.
                </p>
              ) : (
                <div className="archive-table-section">
                  <label className="archive-table-search">
                    Search archive
                    <input
                      type="search"
                      value={archiveSearch}
                      onChange={(event) => setArchiveSearch(event.target.value)}
                      placeholder="Search title, member, note, status, or date"
                    />
                  </label>
                  <div className="archive-table-wrap">
                  <table className="archive-table">
                    <thead>
                      <tr>
                        <th>Suggestion</th>
                        <th>Submitted by</th>
                        <th>Closed status</th>
                        <th>Submitted</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCompletedSuggestions.map((suggestion) => (
                        <tr key={suggestion.id}>
                          <td>{suggestion.suggestionTitle}</td>
                          <td>{suggestion.submittedByName}</td>
                          <td>
                            <span
                              className={`suggestion-status-pill suggestion-status-pill--${suggestion.status}`}
                            >
                              {statusOptions.find((option) => option.value === suggestion.status)?.label ?? suggestion.status}
                            </span>
                          </td>
                          <td>
                            {formatCompactDateTimeWithSeconds(
                              `${suggestion.createdAtDate} ${suggestion.createdAtTime}`,
                            )}
                          </td>
                          <td>
                            <Button
                              type="button"
                              variant="secondary"
                              className="archive-table-action"
                              onClick={() => setActiveArchivedSuggestion(suggestion)}
                            >
                              View
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {filteredCompletedSuggestions.length === 0 ? (
                        <tr>
                          <td colSpan={5}>No archived suggestions match the current search.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                </div>
              )}
            </section>
          </div>
        )}
      </SectionPanel>

      <Modal
        open={Boolean(activeArchivedSuggestion)}
        onClose={() => setActiveArchivedSuggestion(null)}
        title={activeArchivedSuggestion?.suggestionTitle ?? "Suggestion details"}
      >
        {activeArchivedSuggestion ? (
          <div className="suggestion-member-modal">
            <div className="suggestion-member-modal-meta">
              <p>
                <span className="suggestion-member-modal-label">Submitted by</span>
                {activeArchivedSuggestion.submittedByName}
              </p>
              <p>
                <span className="suggestion-member-modal-label">Status</span>
                <span
                  className={`suggestion-status-pill suggestion-status-pill--${activeArchivedSuggestion.status}`}
                >
                  {statusOptions.find((option) => option.value === activeArchivedSuggestion.status)?.label ?? activeArchivedSuggestion.status}
                </span>
              </p>
              <p>
                <span className="suggestion-member-modal-label">Submitted</span>
                {formatCompactDateTimeWithSeconds(
                  `${activeArchivedSuggestion.createdAtDate} ${activeArchivedSuggestion.createdAtTime}`,
                )}
              </p>
            </div>

            <section className="suggestion-member-modal-section">
              <h4>Suggestion</h4>
              <p>{activeArchivedSuggestion.suggestionDetails || "No extra detail was provided."}</p>
            </section>

            <section className="suggestion-member-modal-section">
              <h4>Improvement</h4>
              <p>{activeArchivedSuggestion.improvementText}</p>
            </section>

            {activeArchivedSuggestion.resolutionNote ? (
              <section className="suggestion-member-modal-section">
                <h4>Committee outcome note</h4>
                <p>{activeArchivedSuggestion.resolutionNote}</p>
              </section>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
