import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  connectServerEvents,
  disconnectServerEvents,
  subscribeToServerEvent,
} from "../../lib/serverEvents";

export function useServerEvents({
  actorUsername,
  enabled,
}: {
  actorUsername: string;
  enabled: boolean;
}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !actorUsername) {
      disconnectServerEvents();
      return undefined;
    }

    connectServerEvents();

    const unsubscribeAnnouncements = subscribeToServerEvent(
      "announcements.updated",
      () => {
        void queryClient.invalidateQueries({
          queryKey: ["announcements", actorUsername],
        });
        void queryClient.invalidateQueries({
          queryKey: ["active-announcements", actorUsername],
        });
      },
    );

    return () => {
      unsubscribeAnnouncements();
      disconnectServerEvents();
    };
  }, [actorUsername, enabled, queryClient]);
}
