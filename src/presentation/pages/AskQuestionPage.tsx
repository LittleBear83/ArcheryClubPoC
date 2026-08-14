import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import {
  createMemberQuestion,
  listMyMemberQuestions,
  markMemberQuestionResponseSeen,
  type MemberQuestionRecord,
  type MemberQuestionStatus,
} from "../../api/questionApi";
import { formatCompactDateTimeWithSeconds } from "../../utils/dateTime";

type AskQuestionPageProps = {
  currentUserProfile: unknown;
};

const memberQuestionQueryKeys = {
  mine: (actorUsername: string) => ["member-questions", "mine", actorUsername] as const,
};

const statusLabelMap: Record<MemberQuestionStatus, string> = {
  answered: "Answered",
  new: "New",
};

export function AskQuestionPage({ currentUserProfile }: AskQuestionPageProps) {
  const actorUsername =
    (currentUserProfile as { auth?: { username?: string | null } } | null)?.auth
      ?.username ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const [form, setForm] = useState({
    questionBody: "",
    questionTitle: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: memberQuestionQueryKeys.mine(actorUsername),
    queryFn: () => listMyMemberQuestions(currentUserProfile),
    enabled: Boolean(actorUsername),
  });

  const questions = useMemo(() => data?.questions ?? [], [data?.questions]);
  const unreadResponseCount = useMemo(
    () => questions.filter((question) => question.status === "answered" && !question.memberSeenResponse).length,
    [questions],
  );

  const submitMutation = useMutation({
    mutationFn: () => createMemberQuestion(currentUserProfile, form),
    onMutate: () => {
      setMessage("");
      setError("");
    },
    onSuccess: async (result) => {
      setMessage(result.message ?? "Your question has been sent to the committee.");
      setForm({
        questionBody: "",
        questionTitle: "",
      });
      await queryClient.invalidateQueries({
        queryKey: memberQuestionQueryKeys.mine(actorUsername),
      });
    },
    onError: (submitError: Error) => {
      setError(submitError.message);
    },
  });

  const seenMutation = useMutation({
    mutationFn: (questionId: number) =>
      markMemberQuestionResponseSeen(currentUserProfile, questionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: memberQuestionQueryKeys.mine(actorUsername),
      });
    },
  });

  const openQuestion = (question: MemberQuestionRecord) => {
    setSearchParams({ questionId: String(question.id) });
  };

  const closeQuestion = () => {
    setSearchParams({});
  };

  const activeQuestion = useMemo(() => {
    const questionId = Number.parseInt(searchParams.get("questionId") ?? "", 10);

    if (!Number.isInteger(questionId)) {
      return null;
    }

    return questions.find((question) => question.id === questionId) ?? null;
  }, [questions, searchParams]);

  useEffect(() => {
    if (
      !activeQuestion ||
      activeQuestion.status !== "answered" ||
      activeQuestion.memberSeenResponse
    ) {
      return;
    }

    seenMutation.mutate(activeQuestion.id);
  }, [activeQuestion, seenMutation]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitMutation.mutate();
  };

  return (
    <div className="profile-page utility-form-page">
      <p>
        Send a question to the committee and track the response here. When a committee
        member replies, you will see it both on this page and in a notification toast.
      </p>

      <StatusMessagePanel
        error={error}
        loading={submitMutation.isPending}
        loadingLabel="Sending question..."
        success={message}
      />

      <div className="suggestion-form-layout">
        <form
          onSubmit={handleSubmit}
          className="left-align-form profile-form utility-form-card"
        >
          <label>
            Question title
            <input
              value={form.questionTitle}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  questionTitle: event.target.value,
                }))
              }
              required
              disabled={submitMutation.isPending}
            />
          </label>

          <label>
            Your question
            <textarea
              value={form.questionBody}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  questionBody: event.target.value,
                }))
              }
              rows={6}
              required
              disabled={submitMutation.isPending}
            />
          </label>

          <Button type="submit" disabled={submitMutation.isPending}>
            {submitMutation.isPending ? "Sending..." : "Send question"}
          </Button>
        </form>

        <section className="profile-form suggestion-member-history" aria-label="Your questions">
          <div className="suggestion-member-history-header">
            <div>
              <h2 className="profile-section-title">Your questions</h2>
              <p>
                {unreadResponseCount > 0
                  ? `${unreadResponseCount} response${unreadResponseCount === 1 ? "" : "s"} waiting for you.`
                  : "Track questions you have already sent to the committee."}
              </p>
            </div>
          </div>

          {isLoading ? (
            <p className="suggestion-member-history-empty">Loading your questions...</p>
          ) : questions.length === 0 ? (
            <p className="suggestion-member-history-empty">
              You have not asked the committee any questions yet.
            </p>
          ) : (
            <div className="suggestion-member-history-list" role="list">
              {questions.map((question) => (
                <button
                  key={question.id}
                  type="button"
                  className="suggestion-member-history-row"
                  onClick={() => openQuestion(question)}
                >
                  <div className="suggestion-member-history-main">
                    <strong>{question.questionTitle}</strong>
                    <span>
                      {formatCompactDateTimeWithSeconds(
                        `${question.createdAtDate} ${question.createdAtTime}`,
                      )}
                    </span>
                  </div>
                  <span
                    className={`suggestion-status-pill suggestion-status-pill--${question.status}`}
                  >
                    {statusLabelMap[question.status]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <Modal
        open={Boolean(activeQuestion)}
        onClose={closeQuestion}
        title={activeQuestion?.questionTitle ?? "Question details"}
      >
        {activeQuestion ? (
          <div className="suggestion-member-modal">
            <div className="suggestion-member-modal-meta">
              <p>
                <span className="suggestion-member-modal-label">Asked</span>
                {formatCompactDateTimeWithSeconds(
                  `${activeQuestion.createdAtDate} ${activeQuestion.createdAtTime}`,
                )}
              </p>
              <p>
                <span className="suggestion-member-modal-label">Status</span>
                <span
                  className={`suggestion-status-pill suggestion-status-pill--${activeQuestion.status}`}
                >
                  {statusLabelMap[activeQuestion.status]}
                </span>
              </p>
              {activeQuestion.respondedAtDate ? (
                <p>
                  <span className="suggestion-member-modal-label">Answered</span>
                  {formatCompactDateTimeWithSeconds(
                    `${activeQuestion.respondedAtDate} ${activeQuestion.respondedAtTime}`,
                  )}
                </p>
              ) : null}
              {activeQuestion.respondedByName ? (
                <p>
                  <span className="suggestion-member-modal-label">Answered by</span>
                  {activeQuestion.respondedByName}
                </p>
              ) : null}
            </div>

            <section className="suggestion-member-modal-section">
              <h4>Your question</h4>
              <p>{activeQuestion.questionBody}</p>
            </section>

            {activeQuestion.responseText ? (
              <section className="suggestion-member-modal-section">
                <h4>Committee response</h4>
                <p>{activeQuestion.responseText}</p>
              </section>
            ) : (
              <section className="suggestion-member-modal-section">
                <h4>Committee response</h4>
                <p>No response has been added yet.</p>
              </section>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
