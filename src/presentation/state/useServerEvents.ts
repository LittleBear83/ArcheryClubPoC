import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  connectServerEvents,
  disconnectServerEvents,
  subscribeToServerEvent,
} from "../../lib/serverEvents";
import { useSseFallbackPolling } from "./useSseFallbackPolling";

type QueryKeyFactory = (actorUsername: string) => readonly unknown[];

export const AUTHENTICATED_EVENT_QUERY_GROUPS: Array<{
  event: string;
  queryKeys: QueryKeyFactory[];
}> = [
  {
    event: "announcements.updated",
    queryKeys: [
      (actorUsername) => ["announcements", actorUsername],
      (actorUsername) => ["active-announcements", actorUsername],
    ],
  },
  {
    event: "calendar.updated",
    queryKeys: [
      (actorUsername) => ["events", actorUsername],
      (actorUsername) => ["coaching-sessions", actorUsername],
      () => ["beginners-course-calendar"],
      (actorUsername) => ["home-activity", actorUsername],
    ],
  },
  {
    event: "approvals.updated",
    queryKeys: [
      (actorUsername) => ["approvals", actorUsername],
      (actorUsername) => ["committee-approval-summary", actorUsername],
    ],
  },
  {
    event: "roles.updated",
    queryKeys: [
      (actorUsername) => ["roles", actorUsername],
      (actorUsername) => ["profile-options", actorUsername],
      (actorUsername) => ["loan-bow-options", actorUsername],
      (actorUsername) => ["committee-roles", actorUsername],
    ],
  },
  {
    event: "committee.updated",
    queryKeys: [(actorUsername) => ["committee-roles", actorUsername]],
  },
  {
    event: "members.updated",
    queryKeys: [
      (actorUsername) => ["profile-options", actorUsername],
      (actorUsername) => ["loan-bow-options", actorUsername],
      () => ["loan-bow-profile"],
      (actorUsername) => ["committee-roles", actorUsername],
    ],
  },
  {
    event: "equipment.updated",
    queryKeys: [(actorUsername) => ["equipment-dashboard", actorUsername]],
  },
  {
    event: "beginners.updated",
    queryKeys: [
      (actorUsername) => ["beginners-courses-dashboard", actorUsername],
      (actorUsername) => ["have-a-go-sessions-dashboard", actorUsername],
      (actorUsername) => ["taster-sessions-dashboard", actorUsername],
      (actorUsername) => ["committee-approval-summary", actorUsername],
      () => ["beginners-course-calendar"],
      (actorUsername) => ["home-activity", actorUsername],
    ],
  },
  {
    event: "tournaments.updated",
    queryKeys: [
      (actorUsername) => ["admin-tournament-warnings", actorUsername],
      (actorUsername) => ["home-activity", actorUsername],
    ],
  },
  {
    event: "range-members.updated",
    queryKeys: [() => ["range-members"]],
  },
  {
    event: "lost-found.updated",
    queryKeys: [
      (actorUsername) => ["lost-arrows", actorUsername],
      (actorUsername) => ["lost-arrow-members", actorUsername],
      (actorUsername) => ["my-lost-arrow-notices", actorUsername],
    ],
  },
  {
    event: "outdoor-table.updated",
    queryKeys: [
      () => ["outdoor-table"],
      (actorUsername) => ["outdoor-table-members", actorUsername],
    ],
  },
];

export function useServerEvents({
  actorUsername,
  enabled,
}: {
  actorUsername: string;
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  const canUseServerEvents = enabled && Boolean(actorUsername);
  const eventInvalidators = useMemo(
    () =>
      AUTHENTICATED_EVENT_QUERY_GROUPS.map(({ event, queryKeys }) => ({
        event,
        invalidate: () => {
          for (const buildQueryKey of queryKeys) {
            void queryClient.invalidateQueries({
              queryKey: buildQueryKey(actorUsername),
            });
          }
        },
      })),
    [actorUsername, queryClient],
  );

  useSseFallbackPolling({
    callback: () => {
      for (const { invalidate } of eventInvalidators) {
        invalidate();
      }
    },
    enabled: canUseServerEvents,
    source: "authenticated-shell",
  });

  useEffect(() => {
    if (!canUseServerEvents) {
      disconnectServerEvents();
      return undefined;
    }

    connectServerEvents();

    const unsubscribers = eventInvalidators.map(({ event, invalidate }) =>
      subscribeToServerEvent(event, invalidate),
    );

    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
      disconnectServerEvents();
    };
  }, [canUseServerEvents, eventInvalidators]);
}
