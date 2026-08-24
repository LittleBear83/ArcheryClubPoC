import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { SectionPanel } from "../components/SectionPanel";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import {
  listMemberQuestions,
  respondToMemberQuestion,
  type MemberQuestionRecord,
  type MemberQuestionStatus,
} from "../../api/questionApi";
import { formatCompactDateTimeWithSeconds } from "../../utils/dateTime";

type QuestionInboxPageProps = {
  currentUserProfile: unknown;
};

const memberQuestionQueryKeys = {
  inbox: (actorUsername: string) => ["member-questions", "inbox", actorUsername] as const,
};

const statusLabelMap: Record<MemberQuestionStatus, string> = {
  answered: "Answered",
  new: "New",
};

export function QuestionInboxPage({ currentUserProfile }: QuestionInboxPageProps) {
  const actorUsername =
    (currentUserProfile as { auth?: { username?: string | null } } | null)?.auth
      ?.username ?? "";
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [responses, setResponses] = useState<Record<number, string>>({});
  const [showArchive, setShowArchive] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [activeArchivedQuestion, setActiveArchivedQuestion] =
    useState<MemberQuestionRecord | null>(null);

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: memberQuestionQueryKeys.inbox(actorUsername),
    queryFn: () => listMemberQuestions(currentUserProfile),
    enabled: Boolean(actorUsername),
  });

  const questions = useMemo(() => data?.questions ?? [], [data?.questions]);
  const openQuestions = useMemo(
    () => questions.filter((question) => question.status !== "answered"),
    [questions],
  );
  const answeredQuestions = useMemo(
    () => questions.filter((question) => question.status === "answered"),
    [questions],
  );
  const filteredAnsweredQuestions = useMemo(() => {
    const term = archiveSearch.trim().toLowerCase();

    if (!term) {
      return answeredQuestions;
    }

    return answeredQuestions.filter((question) =>
      [
        question.questionTitle,
        question.questionBody,
        question.responseText,
        question.submittedByName,
        question.submittedByUsername,
        question.respondedByName,
        question.respondedByUsername,
        question.status,
        question.createdAtDate,
        question.createdAtTime,
        question.respondedAtDate,
        question.respondedAtTime,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [archiveSearch, answeredQuestions]);

  const responseMutation = useMutation({
    mutationFn: ({ questionId, responseText }: { questionId: number; responseText: string }) =>
      respondToMemberQuestion(currentUserProfile, questionId, responseText),
    onMutate: () => {
      setMessage("");
      setError("");
    },
    onSuccess: async (result) => {
      setMessage(result.message ?? "Response saved successfully.");
      if (result.question) {
        setResponses((current) => ({
          ...current,
          [result.question.id]: result.question.responseText ?? "",
        }));
      }
      await queryClient.invalidateQueries({
        queryKey: memberQuestionQueryKeys.inbox(actorUsername),
      });
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message);
    },
  });

  if (
    loadError instanceof Error &&
    loadError.message === "You do not have permission to review member questions."
  ) {
    return <p>You do not have permission to review member questions.</p>;
  }

  const renderQuestionCard = (question: MemberQuestionRecord, defaultOpen = false) => {
    const responseText = responses[question.id] ?? question.responseText ?? "";
    const hasChanged = responseText.trim() !== (question.responseText ?? "").trim();

    return (
      <details key={question.id} className="suggestion-inbox-card" open={defaultOpen}>
        <summary className="suggestion-inbox-card-summary">
          <div className="suggestion-inbox-card-summary-main">
            <p className="suggestion-inbox-card-label">Question</p>
            <h3>{question.questionTitle}</h3>
            <p className="suggestion-inbox-card-summary-meta">
              From {question.submittedByName} ({question.submittedByUsername})
            </p>
          </div>

          <div className="suggestion-inbox-card-summary-side">
            <span className={`suggestion-status-pill suggestion-status-pill--${question.status}`}>
              {statusLabelMap[question.status]}
            </span>
            <p className="suggestion-inbox-card-summary-meta">
              {formatCompactDateTimeWithSeconds(
                `${question.createdAtDate} ${question.createdAtTime}`,
              )}
            </p>
          </div>
        </summary>

        <div className="suggestion-inbox-card-content">
          <div className="suggestion-inbox-card-header">
            <div className="suggestion-inbox-card-submitter">
              <p className="suggestion-inbox-card-label">Member</p>
              <h3>{question.submittedByName}</h3>
              <p>{question.submittedByUsername}</p>
              <p>
                {formatCompactDateTimeWithSeconds(
                  `${question.createdAtDate} ${question.createdAtTime}`,
                )}
              </p>
            </div>

            <div className="suggestion-inbox-card-status">
              <label className="left-align-form suggestion-inbox-status-field">
                <span className="suggestion-inbox-card-label">Committee response</span>
                <textarea
                  value={responseText}
                  onChange={(event) =>
                    setResponses((current) => ({
                      ...current,
                      [question.id]: event.target.value,
                    }))
                  }
                  rows={5}
                  placeholder="Write your response to this member."
                  disabled={responseMutation.isPending}
                />
              </label>

              <div className="suggestion-inbox-note-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    responseMutation.mutate({
                      questionId: question.id,
                      responseText,
                    })
                  }
                  disabled={responseMutation.isPending || !responseText.trim() || !hasChanged}
                >
                  Save response
                </Button>
              </div>

              {question.respondedAtDate ? (
                <p className="suggestion-inbox-update-note">
                  Answered{" "}
                  {formatCompactDateTimeWithSeconds(
                    `${question.respondedAtDate} ${question.respondedAtTime}`,
                  )}
                  {question.respondedByName
                    ? ` by ${question.respondedByName}`
                    : question.respondedByUsername
                      ? ` by ${question.respondedByUsername}`
                      : ""}
                </p>
              ) : null}
            </div>
          </div>

          <div className="suggestion-inbox-card-body">
            <section className="suggestion-inbox-card-section suggestion-inbox-card-section--full">
              <p className="suggestion-inbox-card-label">Question</p>
              <h4>{question.questionTitle}</h4>
              <p>{question.questionBody}</p>
            </section>

            {question.responseText ? (
              <section className="suggestion-inbox-card-section suggestion-inbox-card-section--full">
                <p className="suggestion-inbox-card-label">Current response</p>
                <p>{question.responseText}</p>
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
        Review questions submitted by members and send back a committee response.
      </p>

      <StatusMessagePanel
        error={error}
        loading={isLoading}
        loadingLabel="Loading member questions..."
        success={message}
      />

      <SectionPanel className="profile-form" title="Question Inbox">
        {questions.length === 0 ? (
          <p>No member questions have been submitted yet.</p>
        ) : (
          <div className="suggestion-inbox-sections">
            <section className="suggestion-inbox-group">
              <div className="suggestion-inbox-group-header">
                <h3>Open questions</h3>
                <p>{openQuestions.length} waiting for a response</p>
              </div>
              {openQuestions.length === 0 ? (
                <p className="suggestion-inbox-empty-copy">
                  No unanswered questions right now.
                </p>
              ) : (
                <div className="suggestion-inbox-list">
                  {openQuestions.map((question) => renderQuestionCard(question, true))}
                </div>
              )}
            </section>

            <section className="suggestion-inbox-group">
              <div className="suggestion-inbox-group-header">
                <h3>Question archive</h3>
                <p>{answeredQuestions.length} closed questions</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="suggestion-archive-toggle"
                onClick={() => setShowArchive((current) => !current)}
              >
                {showArchive
                  ? "Hide archive"
                  : `Show archive (${answeredQuestions.length})`}
              </Button>
              {answeredQuestions.length === 0 ? (
                <p className="suggestion-inbox-empty-copy">
                  Closed questions will appear here once the committee replies.
                </p>
              ) : !showArchive ? (
                <p className="suggestion-inbox-empty-copy">
                  Use the archive button to review closed questions.
                </p>
              ) : (
                <div className="archive-table-section">
                  <label className="archive-table-search">
                    Search archive
                    <input
                      type="search"
                      value={archiveSearch}
                      onChange={(event) => setArchiveSearch(event.target.value)}
                      placeholder="Search title, member, response, or date"
                    />
                  </label>
                  <div className="archive-table-wrap">
                  <table className="archive-table">
                    <thead>
                      <tr>
                        <th>Question</th>
                        <th>Member</th>
                        <th>Status</th>
                        <th>Asked</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAnsweredQuestions.map((question) => (
                        <tr key={question.id}>
                          <td>{question.questionTitle}</td>
                          <td>{question.submittedByName}</td>
                          <td>
                            <span
                              className={`suggestion-status-pill suggestion-status-pill--${question.status}`}
                            >
                              {statusLabelMap[question.status]}
                            </span>
                          </td>
                          <td>
                            {formatCompactDateTimeWithSeconds(
                              `${question.createdAtDate} ${question.createdAtTime}`,
                            )}
                          </td>
                          <td>
                            <Button
                              type="button"
                              variant="secondary"
                              className="archive-table-action"
                              onClick={() => setActiveArchivedQuestion(question)}
                            >
                              View
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {filteredAnsweredQuestions.length === 0 ? (
                        <tr>
                          <td colSpan={5}>No archived questions match the current search.</td>
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
        open={Boolean(activeArchivedQuestion)}
        onClose={() => setActiveArchivedQuestion(null)}
        title={activeArchivedQuestion?.questionTitle ?? "Question details"}
      >
        {activeArchivedQuestion ? (
          <div className="suggestion-member-modal">
            <div className="suggestion-member-modal-meta">
              <p>
                <span className="suggestion-member-modal-label">Asked by</span>
                {activeArchivedQuestion.submittedByName}
              </p>
              <p>
                <span className="suggestion-member-modal-label">Asked</span>
                {formatCompactDateTimeWithSeconds(
                  `${activeArchivedQuestion.createdAtDate} ${activeArchivedQuestion.createdAtTime}`,
                )}
              </p>
              <p>
                <span className="suggestion-member-modal-label">Answered</span>
                {formatCompactDateTimeWithSeconds(
                  `${activeArchivedQuestion.respondedAtDate} ${activeArchivedQuestion.respondedAtTime}`,
                )}
              </p>
            </div>

            <section className="suggestion-member-modal-section">
              <h4>Question</h4>
              <p>{activeArchivedQuestion.questionBody}</p>
            </section>

            <section className="suggestion-member-modal-section">
              <h4>Committee response</h4>
              <p>{activeArchivedQuestion.responseText || "No response saved."}</p>
            </section>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
