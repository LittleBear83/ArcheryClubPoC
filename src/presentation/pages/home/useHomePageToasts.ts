import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  openLostArrows,
  unreadQuestionResponses,
}: {
  actorUsername: string;
  openLostArrows: LostArrowToastSource[];
  unreadQuestionResponses: QuestionToastSource[];
}) {
  const queryClient = useQueryClient();
  const [lostArrowToasts, setLostArrowToasts] = useState<HomePageToast[]>([]);
  const [beginnersRescheduleToasts, setBeginnersRescheduleToasts] = useState<HomePageToast[]>([]);
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
      setBeginnersRescheduleToasts([]);
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
          },
        ].slice(-3);
      });
    });
  }, [actorUsername]);

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
    beginnersRescheduleToasts: actorUsername ? beginnersRescheduleToasts : [],
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
