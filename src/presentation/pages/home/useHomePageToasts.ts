import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dismissCoachingAssignmentNotification, listMyCoachingAssignmentNotifications } from "../../../api/homeApi";
import { subscribeToServerEvent } from "../../../lib/serverEvents";
import { homeQueryKeys } from "./homeQueryKeys";

const LOST_ARROW_SEEN_TOASTS_STORAGE_KEY = "archeryclubpoc-seen-lost-arrow-toasts";

export type HomePageToast = {
  id: string;
  message: string;
  targetPath: string;
};

type LostArrowToastSource = {
  id: number;
  archerName?: string;
  archerUsername?: string;
  arrowColour: string;
  arrowMaterial: string;
};

type QuestionToastSource = {
  id: string | number;
  questionTitle: string;
};

type BeginnersRescheduleToastSource = {
  id: string;
  message: string;
  targetPath: string;
};

function readSeenLostArrowToastIds(username: string) {
  if (!username || typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const rawValue = window.localStorage.getItem(LOST_ARROW_SEEN_TOASTS_STORAGE_KEY);
    const parsedValue = rawValue ? JSON.parse(rawValue) : {};
    const storedIds = Array.isArray(parsedValue?.[username]) ? parsedValue[username] : [];

    return new Set(
      storedIds.filter((value: unknown) => typeof value === "string"),
    );
  } catch {
    return new Set<string>();
  }
}

function writeSeenLostArrowToastIds(username: string, seenIds: Set<string>) {
  if (!username || typeof window === "undefined") {
    return;
  }

  try {
    const rawValue = window.localStorage.getItem(LOST_ARROW_SEEN_TOASTS_STORAGE_KEY);
    const parsedValue = rawValue ? JSON.parse(rawValue) : {};

    window.localStorage.setItem(
      LOST_ARROW_SEEN_TOASTS_STORAGE_KEY,
      JSON.stringify({
        ...parsedValue,
        [username]: Array.from(seenIds),
      }),
    );
  } catch {
    return;
  }
}

export function useHomePageToasts({
  actorUsername,
  isMobile,
  openLostArrows,
  unreadQuestionResponses,
}: {
  actorUsername: string;
  isMobile: boolean;
  openLostArrows: LostArrowToastSource[];
  unreadQuestionResponses: QuestionToastSource[];
}) {
  const queryClient = useQueryClient();
  const [lostArrowToasts, setLostArrowToasts] = useState<HomePageToast[]>([]);
  const [beginnersRescheduleToasts, setBeginnersRescheduleToasts] = useState<(HomePageToast & { actorUsername: string })[]>([]);
  const coachingNotificationsQuery = useQuery({
    queryKey: ["coaching-assignment-notifications", actorUsername],
    queryFn: () => listMyCoachingAssignmentNotifications(actorUsername),
    enabled: Boolean(actorUsername) && !isMobile,
    refetchOnWindowFocus: true,
    refetchInterval: isMobile ? false : 30000,
  });
  const coachingAssignmentToasts = (coachingNotificationsQuery.data?.notifications ?? []).slice(0, 3).map((event) => {
    const cannotAttend = event.action === "cannot_attend";
    const coursePath = event.courseType === "have-a-go"
      ? "/have-a-go-sessions"
      : `/beginners-courses?tab=${event.courseType === "taster-session" ? "taster-session" : "beginners"}`;
    return {
      id: event.eventId,
      title: cannotAttend ? "Coach cannot attend" : "Coaching assignment changed",
      message: cannotAttend
        ? `${event.actorName || "A coach"} cannot attend session ${event.lessonNumber ?? ""} on ${event.lessonDate ?? ""}.${event.reason ? ` Reason: ${event.reason}` : ""} The coach remains assigned until you update the session.`
        : `${event.actorName || "A coach"} ${event.action === "withdrew" ? "withdrew from" : "volunteered for"} session ${event.lessonNumber ?? ""} on ${event.lessonDate ?? ""}.`,
      targetPath: cannotAttend
        ? coursePath
        : `/coaching?tab=sessions&session=${encodeURIComponent(String(event.lessonId))}`,
      actionLabel: cannotAttend ? "Manage course" : "View session",
    };
  });
  const [dismissedQuestionToastIds, setDismissedQuestionToastIds] = useState<string[]>([]);
  const previousOpenLostArrowIdsRef = useRef<number[] | null>(null);
  const seenLostArrowToastIdsRef = useRef<Set<string>>(new Set());

  const questionResponseToasts = useMemo<HomePageToast[]>(() => {
    return unreadQuestionResponses
      .map((question) => ({
        id: `member-question-${question.id}`,
        message: `The committee replied to "${question.questionTitle}".`,
        targetPath: `/ask-a-question?questionId=${question.id}`,
      }))
      .filter((toast) => !dismissedQuestionToastIds.includes(toast.id))
      .slice(0, 3);
  }, [dismissedQuestionToastIds, unreadQuestionResponses]);

  useEffect(() => {
    if (!actorUsername) {
      return undefined;
    }

    return subscribeToServerEvent("member-questions.updated", () => {
      void queryClient.invalidateQueries({
        queryKey: homeQueryKeys.memberQuestions(actorUsername),
      });
    });
  }, [actorUsername, queryClient]);

  useEffect(() => {
    if (!actorUsername) {
      return undefined;
    }

    return subscribeToServerEvent("beginners.rescheduled", (payload) => {
      const toastPayload = payload as BeginnersRescheduleToastSource | null;

      if (
        !toastPayload ||
        typeof toastPayload.id !== "string" ||
        typeof toastPayload.message !== "string" ||
        typeof toastPayload.targetPath !== "string"
      ) {
        return;
      }

      setBeginnersRescheduleToasts((current) => {
        const deduped = current.filter((toast) => toast.id !== toastPayload.id);
        return [
          ...deduped,
          {
            id: toastPayload.id,
            message: toastPayload.message,
            targetPath: toastPayload.targetPath,
            actorUsername,
          },
        ].slice(-3);
      });
    });
  }, [actorUsername]);

  useEffect(() => {
    if (!actorUsername) return undefined;
    return subscribeToServerEvent("coaching.assignment.changed", () => {
      void queryClient.invalidateQueries({ queryKey: ["coaching-assignment-notifications", actorUsername] });
    });
  }, [actorUsername, queryClient]);

  useEffect(() => {
    if (!actorUsername) {
      previousOpenLostArrowIdsRef.current = null;
      seenLostArrowToastIdsRef.current = new Set();
      return;
    }

    seenLostArrowToastIdsRef.current = readSeenLostArrowToastIds(actorUsername);
  }, [actorUsername]);

  useEffect(() => {
    if (!actorUsername) {
      previousOpenLostArrowIdsRef.current = null;
      return;
    }

    const previousIds = previousOpenLostArrowIdsRef.current;
    const currentIds = openLostArrows.map((arrow) => arrow.id);

    if (!previousIds) {
      previousOpenLostArrowIdsRef.current = currentIds;

      if (openLostArrows.length > 0) {
        const latestLostArrow = openLostArrows[0];
        const initialToastId = `lost-arrow-${latestLostArrow.id}`;

        if (!seenLostArrowToastIdsRef.current.has(initialToastId)) {
          seenLostArrowToastIdsRef.current.add(initialToastId);
          writeSeenLostArrowToastIds(actorUsername, seenLostArrowToastIdsRef.current);
          queueMicrotask(() => {
            setLostArrowToasts([
              {
                id: initialToastId,
                message: `${latestLostArrow.archerName || latestLostArrow.archerUsername} currently has a lost ${latestLostArrow.arrowColour} ${latestLostArrow.arrowMaterial} arrow recorded.`,
                targetPath: "/lost-and-found",
              },
            ]);
          });
        }
      }

      return;
    }

    const previousIdSet = new Set(previousIds);
    const newLostArrows = openLostArrows.filter((arrow) => !previousIdSet.has(arrow.id));

    previousOpenLostArrowIdsRef.current = currentIds;

    if (newLostArrows.length === 0) {
      return;
    }

    setLostArrowToasts((current) => {
      const nextToasts = newLostArrows
        .map((arrow) => ({
          id: `lost-arrow-${arrow.id}`,
          message: `${arrow.archerName || arrow.archerUsername} reported a lost ${arrow.arrowColour} ${arrow.arrowMaterial} arrow.`,
          targetPath: "/lost-and-found",
        }))
        .filter((toast) => !seenLostArrowToastIdsRef.current.has(toast.id));

      if (nextToasts.length === 0) {
        return current;
      }

      for (const toast of nextToasts) {
        seenLostArrowToastIdsRef.current.add(toast.id);
      }

      writeSeenLostArrowToastIds(actorUsername, seenLostArrowToastIdsRef.current);

      const dedupedCurrent = current.filter(
        (toast) => !nextToasts.some((nextToast) => nextToast.id === toast.id),
      );

      return [...dedupedCurrent, ...nextToasts].slice(-3);
    });
  }, [actorUsername, openLostArrows]);

  useEffect(() => {
    if (lostArrowToasts.length === 0) {
      return undefined;
    }

    const timerIds = lostArrowToasts.map((toast) =>
      setTimeout(() => {
        setLostArrowToasts((current) => current.filter((item) => item.id !== toast.id));
      }, 8000),
    );

    return () => {
      for (const timerId of timerIds) {
        clearTimeout(timerId);
      }
    };
  }, [lostArrowToasts]);

  useEffect(() => {
    if (beginnersRescheduleToasts.length === 0) {
      return undefined;
    }

    const timerIds = beginnersRescheduleToasts.map((toast) =>
      setTimeout(() => {
        setBeginnersRescheduleToasts((current) =>
          current.filter((item) => item.id !== toast.id),
        );
      }, 8000),
    );

    return () => {
      for (const timerId of timerIds) {
        clearTimeout(timerId);
      }
    };
  }, [beginnersRescheduleToasts]);

  return {
    beginnersRescheduleToasts: actorUsername
      ? beginnersRescheduleToasts.filter((toast) => toast.actorUsername === actorUsername)
      : [],
    coachingAssignmentToasts: actorUsername && !isMobile ? coachingAssignmentToasts : [],
    dismissCoachingAssignmentToast: async (toastId: string) => {
      await dismissCoachingAssignmentNotification(actorUsername, toastId);
      await queryClient.invalidateQueries({ queryKey: ["coaching-assignment-notifications", actorUsername] });
    },
    lostArrowToasts: actorUsername ? lostArrowToasts : [],
    questionResponseToasts,
    dismissBeginnersRescheduleToast: (toastId: string) => {
      setBeginnersRescheduleToasts((current) =>
        current.filter((toast) => toast.id !== toastId),
      );
    },
    dismissLostArrowToast: (toastId: string) => {
      setLostArrowToasts((current) => current.filter((toast) => toast.id !== toastId));
    },
    dismissQuestionToast: (toastId: string) => {
      setDismissedQuestionToastIds((current) =>
        current.includes(toastId) ? current : [...current, toastId],
      );
    },
  };
}
