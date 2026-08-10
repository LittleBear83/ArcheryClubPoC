import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/Button";
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
                <h3>Answered questions</h3>
                <p>{answeredQuestions.length} already answered</p>
              </div>
              {answeredQuestions.length === 0 ? (
                <p className="suggestion-inbox-empty-copy">
                  Answered questions will appear here once the committee replies.
                </p>
              ) : (
                <div className="suggestion-inbox-list">
                  {answeredQuestions.map((question) => renderQuestionCard(question))}
                </div>
              )}
            </section>
          </div>
        )}
      </SectionPanel>
    </div>
  );
}
