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

  const invalidateAnnouncementQueries = () => {
    void queryClient.invalidateQueries({
      queryKey: ["announcements", actorUsername],
    });
    void queryClient.invalidateQueries({
      queryKey: ["active-announcements", actorUsername],
    });
  };

  const invalidateCalendarQueries = () => {
    void queryClient.invalidateQueries({
      queryKey: ["events", actorUsername],
    });
    void queryClient.invalidateQueries({
      queryKey: ["coaching-sessions", actorUsername],
    });
    void queryClient.invalidateQueries({
      queryKey: ["beginners-course-calendar"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["home-activity", actorUsername],
    });
  };

  const invalidateApprovalsQueries = () => {
    void queryClient.invalidateQueries({
      queryKey: ["approvals", actorUsername],
    });
    void queryClient.invalidateQueries({
      queryKey: ["committee-approval-summary", actorUsername],
    });
  };

  const invalidateRoleQueries = () => {
    void queryClient.invalidateQueries({
      queryKey: ["roles", actorUsername],
    });
    void queryClient.invalidateQueries({
      queryKey: ["profile-options", actorUsername],
    });
    void queryClient.invalidateQueries({
      queryKey: ["loan-bow-options", actorUsername],
    });
    void queryClient.invalidateQueries({
      queryKey: ["committee-roles", actorUsername],
    });
  };

  const invalidateCommitteeQueries = () => {
    void queryClient.invalidateQueries({
      queryKey: ["committee-roles", actorUsername],
    });
  };

  const invalidateMemberQueries = () => {
    void queryClient.invalidateQueries({
      queryKey: ["profile-options", actorUsername],
    });
    void queryClient.invalidateQueries({
      queryKey: ["loan-bow-options", actorUsername],
    });
    void queryClient.invalidateQueries({
      queryKey: ["loan-bow-profile"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["committee-roles", actorUsername],
    });
  };

  const invalidateEquipmentQueries = () => {
    void queryClient.invalidateQueries({
      queryKey: ["equipment-dashboard", actorUsername],
    });
  };

  const invalidateBeginnersQueries = () => {
    void queryClient.invalidateQueries({
      queryKey: ["beginners-courses-dashboard", actorUsername],
    });
    void queryClient.invalidateQueries({
      queryKey: ["have-a-go-sessions-dashboard", actorUsername],
    });
    void queryClient.invalidateQueries({
      queryKey: ["committee-approval-summary", actorUsername],
    });
    void queryClient.invalidateQueries({
      queryKey: ["beginners-course-calendar"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["home-activity", actorUsername],
    });
  };

  const invalidateTournamentQueries = () => {
    void queryClient.invalidateQueries({
      queryKey: ["admin-tournament-warnings", actorUsername],
    });
    void queryClient.invalidateQueries({
      queryKey: ["home-activity", actorUsername],
    });
  };

  const invalidateRangeMemberQueries = () => {
    void queryClient.invalidateQueries({
      queryKey: ["range-members"],
    });
  };

  const invalidateLostArrowQueries = () => {
    void queryClient.invalidateQueries({
      queryKey: ["lost-arrows", actorUsername],
    });
    void queryClient.invalidateQueries({
      queryKey: ["lost-arrow-members", actorUsername],
    });
    void queryClient.invalidateQueries({
      queryKey: ["my-lost-arrow-notices", actorUsername],
    });
  };

  const invalidateOutdoorTableQueries = () => {
    void queryClient.invalidateQueries({
      queryKey: ["outdoor-table"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["outdoor-table-members", actorUsername],
    });
  };

  const eventInvalidators = useMemo(() => {
    return [
      {
        event: "announcements.updated",
        invalidate: invalidateAnnouncementQueries,
      },
      {
        event: "calendar.updated",
        invalidate: invalidateCalendarQueries,
      },
      {
        event: "approvals.updated",
        invalidate: invalidateApprovalsQueries,
      },
      {
        event: "roles.updated",
        invalidate: invalidateRoleQueries,
      },
      {
        event: "committee.updated",
        invalidate: invalidateCommitteeQueries,
      },
      {
        event: "members.updated",
        invalidate: invalidateMemberQueries,
      },
      {
        event: "equipment.updated",
        invalidate: invalidateEquipmentQueries,
      },
      {
        event: "beginners.updated",
        invalidate: invalidateBeginnersQueries,
      },
      {
        event: "tournaments.updated",
        invalidate: invalidateTournamentQueries,
      },
      {
        event: "range-members.updated",
        invalidate: invalidateRangeMemberQueries,
      },
      {
        event: "lost-found.updated",
        invalidate: invalidateLostArrowQueries,
      },
      {
        event: "outdoor-table.updated",
        invalidate: invalidateOutdoorTableQueries,
      },
    ];
  }, [
    invalidateAnnouncementQueries,
    invalidateApprovalsQueries,
    invalidateBeginnersQueries,
    invalidateCalendarQueries,
    invalidateCommitteeQueries,
    invalidateEquipmentQueries,
    invalidateLostArrowQueries,
    invalidateMemberQueries,
    invalidateOutdoorTableQueries,
    invalidateRangeMemberQueries,
    invalidateRoleQueries,
    invalidateTournamentQueries,
  ]);

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
