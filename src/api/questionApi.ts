import { buildActorHeaders, fetchApi } from "./client";

export type MemberQuestionStatus = "new" | "answered";

export type MemberQuestionRecord = {
  id: number;
  submittedByName: string;
  submittedByUsername: string;
  questionTitle: string;
  questionBody: string;
  status: MemberQuestionStatus;
  responseText: string;
  memberSeenResponse: boolean;
  createdAtDate: string;
  createdAtTime: string;
  respondedAtDate?: string;
  respondedAtTime?: string;
  respondedByUsername?: string;
  respondedByName?: string;
  updatedAtDate?: string;
  updatedAtTime?: string;
};

export function createMemberQuestion(
  actor: unknown,
  payload: { questionTitle: string; questionBody: string },
) {
  return fetchApi<{ success: true; message?: string; question: MemberQuestionRecord }>(
    "/api/member-questions",
    {
      method: "POST",
      headers: buildActorHeaders(actor, true),
      body: JSON.stringify(payload),
    },
  );
}

export function listMyMemberQuestions(actor: unknown) {
  return fetchApi<{ success: true; questions?: MemberQuestionRecord[] }>(
    "/api/member-questions/mine",
    {
      headers: buildActorHeaders(actor),
      cache: "no-store",
    },
  );
}

export function listMemberQuestions(actor: unknown) {
  return fetchApi<{ success: true; questions?: MemberQuestionRecord[] }>(
    "/api/member-questions",
    {
      headers: buildActorHeaders(actor),
      cache: "no-store",
    },
  );
}

export function respondToMemberQuestion(
  actor: unknown,
  questionId: number,
  responseText: string,
) {
  return fetchApi<{ success: true; message?: string; question: MemberQuestionRecord }>(
    `/api/member-questions/${questionId}/response`,
    {
      method: "PUT",
      headers: buildActorHeaders(actor, true),
      body: JSON.stringify({ responseText }),
    },
  );
}

export function markMemberQuestionResponseSeen(actor: unknown, questionId: number) {
  return fetchApi<{ success: true; question: MemberQuestionRecord }>(
    `/api/member-questions/${questionId}/seen`,
    {
      method: "PUT",
      headers: buildActorHeaders(actor, true),
    },
  );
}
