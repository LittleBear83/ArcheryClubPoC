import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import {
  createSuggestion,
  listMySuggestions,
  type SuggestionRecord,
  type SuggestionStatus,
} from "../../api/suggestionApi";
import { formatCompactDateTimeWithSeconds } from "../../utils/dateTime";

type FeedbackFormPageProps = {
  currentUserProfile: unknown;
};

const suggestionQueryKeys = {
  mine: (actorUsername: string) => ["suggestions", "mine", actorUsername] as const,
};

const statusLabelMap: Record<SuggestionStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  implemented: "Implemented",
  declined: "Declined",
};

export function FeedbackFormPage({
  currentUserProfile,
}: FeedbackFormPageProps) {
  const actorUsername =
    (currentUserProfile as { auth?: { username?: string | null } } | null)?.auth
      ?.username ?? "";
  const [form, setForm] = useState({
    submittedBy: "",
    suggestionTitle: "",
    improvementText: "",
    suggestionDetails: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [activeSuggestion, setActiveSuggestion] = useState<SuggestionRecord | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading: isLoadingSuggestions } = useQuery({
    queryKey: suggestionQueryKeys.mine(actorUsername),
    queryFn: () => listMySuggestions(currentUserProfile),
    enabled: Boolean(actorUsername),
  });

  const suggestions = useMemo(() => data?.suggestions ?? [], [data?.suggestions]);
  const activeSuggestions = useMemo(
    () =>
      suggestions.filter(
        (suggestion) =>
          suggestion.status !== "implemented" && suggestion.status !== "declined",
      ),
    [suggestions],
  );
  const archivedSuggestions = useMemo(
    () =>
      suggestions.filter(
        (suggestion) =>
          suggestion.status === "implemented" || suggestion.status === "declined",
      ),
    [suggestions],
  );
  const filteredArchivedSuggestions = useMemo(() => {
    const term = archiveSearch.trim().toLowerCase();

    if (!term) {
      return archivedSuggestions;
    }

    return archivedSuggestions.filter((suggestion) =>
      [
        suggestion.suggestionTitle,
        suggestion.submittedByName,
        suggestion.status,
        suggestion.resolutionNote,
        suggestion.suggestionDetails,
        suggestion.improvementText,
        suggestion.createdAtDate,
        suggestion.createdAtTime,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [archiveSearch, archivedSuggestions]);

  const submitMutation = useMutation({
    mutationFn: () => createSuggestion(currentUserProfile, form),
    onMutate: () => {
      setMessage("");
      setError("");
    },
    onSuccess: (result) => {
      setMessage(result.message ?? "Suggestion submitted successfully.");
      setForm({
        submittedBy: "",
        suggestionTitle: "",
        improvementText: "",
        suggestionDetails: "",
      });
      void queryClient.invalidateQueries({
        queryKey: suggestionQueryKeys.mine(actorUsername),
      });
    },
    onError: (submitError: Error) => {
      setError(submitError.message);
    },
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitMutation.mutate();
  };

  return (
    <div className="profile-page utility-form-page">
      <p>
        Use the suggestion box to share ideas or improvements for the club. Once
        submitted, your suggestion will be sent to the committee for consideration.
        Leaving fields blank may result in the suggestion not being carried
        forward.
      </p>

      <StatusMessagePanel
        error={error}
        loading={submitMutation.isPending}
        loadingLabel="Submitting suggestion..."
        success={message}
      />

      <div className="suggestion-form-layout">
        <form
          onSubmit={handleSubmit}
          className="left-align-form profile-form utility-form-card"
        >
          <label>
            Who is submitting (leave blank to be anonymous)
            <input
              value={form.submittedBy}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  submittedBy: event.target.value,
                }))
              }
              disabled={submitMutation.isPending}
            />
          </label>

          <label>
            Suggestion title
            <input
              value={form.suggestionTitle}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  suggestionTitle: event.target.value,
                }))
              }
              required
              disabled={submitMutation.isPending}
            />
          </label>

          <label>
            How will this improve our club? Leaving this blank may result in the
            suggestion not being carried forward.
            <textarea
              value={form.improvementText}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  improvementText: event.target.value,
                }))
              }
              rows={4}
              required
              disabled={submitMutation.isPending}
            />
          </label>

          <label>
            Additional details. Leaving this blank may result in the suggestion not
            being carried forward.
            <textarea
              value={form.suggestionDetails}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  suggestionDetails: event.target.value,
                }))
              }
              rows={4}
              disabled={submitMutation.isPending}
            />
          </label>

          <Button type="submit" disabled={submitMutation.isPending}>
            {submitMutation.isPending ? "Submitting..." : "Submit suggestion"}
          </Button>
        </form>

        <section className="profile-form suggestion-member-history" aria-label="Your suggestions">
          <div className="suggestion-member-history-header">
            <div>
              <h2 className="profile-section-title">Your suggestions</h2>
              <p>Track submissions you have already sent to the committee.</p>
            </div>
          </div>

          {isLoadingSuggestions ? (
            <p className="suggestion-member-history-empty">Loading your suggestions...</p>
          ) : suggestions.length === 0 ? (
            <p className="suggestion-member-history-empty">
              You have not submitted any suggestions yet.
            </p>
          ) : (
            <div className="suggestion-member-history-sections">
              <section className="suggestion-member-history-group">
                <div className="suggestion-member-history-group-header">
                  <h3>Active suggestions</h3>
                  <p>{activeSuggestions.length} still under review</p>
                </div>
                {activeSuggestions.length === 0 ? (
                  <p className="suggestion-member-history-empty">
                    No active suggestions right now.
                  </p>
                ) : (
                  <div className="suggestion-member-history-list" role="list">
                    {activeSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        type="button"
                        className="suggestion-member-history-row"
                        onClick={() => setActiveSuggestion(suggestion)}
                      >
                        <div className="suggestion-member-history-main">
                          <strong>{suggestion.suggestionTitle}</strong>
                          <span>
                            {formatCompactDateTimeWithSeconds(
                              `${suggestion.createdAtDate} ${suggestion.createdAtTime}`,
                            )}
                          </span>
                        </div>
                        <span
                          className={`suggestion-status-pill suggestion-status-pill--${suggestion.status}`}
                        >
                          {statusLabelMap[suggestion.status]}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="suggestion-member-history-group">
                <div className="suggestion-member-history-group-header">
                  <h3>Suggestion archive</h3>
                  <p>{archivedSuggestions.length} closed suggestions</p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="suggestion-archive-toggle"
                  onClick={() => setShowArchive((current) => !current)}
                >
                  {showArchive
                    ? "Hide archive"
                    : `Show archive (${archivedSuggestions.length})`}
                </Button>
                {archivedSuggestions.length === 0 ? (
                  <p className="suggestion-member-history-empty">
                    Closed suggestions will appear here once they have been completed.
                  </p>
                ) : !showArchive ? (
                  <p className="suggestion-member-history-empty">
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
                        placeholder="Search title, status, notes, or date"
                      />
                    </label>
                    <div className="archive-table-wrap">
                    <table className="archive-table">
                      <thead>
                        <tr>
                          <th>Suggestion</th>
                          <th>Submitted</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredArchivedSuggestions.map((suggestion) => (
                          <tr key={suggestion.id}>
                            <td>{suggestion.suggestionTitle}</td>
                            <td>
                              {formatCompactDateTimeWithSeconds(
                                `${suggestion.createdAtDate} ${suggestion.createdAtTime}`,
                              )}
                            </td>
                            <td>
                              <span
                                className={`suggestion-status-pill suggestion-status-pill--${suggestion.status}`}
                              >
                                {statusLabelMap[suggestion.status]}
                              </span>
                            </td>
                            <td>
                              <Button
                                type="button"
                                variant="secondary"
                                className="archive-table-action"
                                onClick={() => setActiveSuggestion(suggestion)}
                              >
                                View
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {filteredArchivedSuggestions.length === 0 ? (
                          <tr>
                            <td colSpan={4}>No archived suggestions match the current search.</td>
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
        </section>
      </div>

      <Modal
        open={Boolean(activeSuggestion)}
        onClose={() => setActiveSuggestion(null)}
        title={activeSuggestion?.suggestionTitle ?? "Suggestion details"}
      >
        {activeSuggestion ? (
          <div className="suggestion-member-modal">
            <div className="suggestion-member-modal-meta">
              <p>
                <span className="suggestion-member-modal-label">Submitted</span>
                {formatCompactDateTimeWithSeconds(
                  `${activeSuggestion.createdAtDate} ${activeSuggestion.createdAtTime}`,
                )}
              </p>
              <p>
                <span className="suggestion-member-modal-label">Status</span>
                <span
                  className={`suggestion-status-pill suggestion-status-pill--${activeSuggestion.status}`}
                >
                  {statusLabelMap[activeSuggestion.status]}
                </span>
              </p>
              <p>
                <span className="suggestion-member-modal-label">Submitted as</span>
                {activeSuggestion.isAnonymous ? "Anonymous" : activeSuggestion.submittedByName}
              </p>
              {activeSuggestion.updatedAtDate ? (
                <p>
                  <span className="suggestion-member-modal-label">Last updated</span>
                  {formatCompactDateTimeWithSeconds(
                    `${activeSuggestion.updatedAtDate} ${activeSuggestion.updatedAtTime}`,
                  )}
                </p>
              ) : null}
            </div>

            <section className="suggestion-member-modal-section">
              <h4>How this improves the club</h4>
              <p>{activeSuggestion.improvementText}</p>
            </section>

            <section className="suggestion-member-modal-section">
              <h4>Additional details</h4>
              <p>
                {activeSuggestion.suggestionDetails || "No additional details were supplied."}
              </p>
            </section>

            {activeSuggestion.resolutionNote ? (
              <section className="suggestion-member-modal-section">
                <h4>Committee outcome note</h4>
                <p>{activeSuggestion.resolutionNote}</p>
              </section>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
