import { useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  connectServerEvents,
  disconnectServerEvents,
  subscribeToServerEvent,
} from "../../lib/serverEvents";
import { useSseFallbackPolling } from "./useSseFallbackPolling";

export function useServerEvents({
  actorUsername,
  enabled,
}: {
  actorUsername: string;
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  const canUseServerEvents = enabled && Boolean(actorUsername);

  const invalidateAnnouncementQueries = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["announcements", actorUsername],
    });
    void queryClient.invalidateQueries({
      queryKey: ["active-announcements", actorUsername],
    });
  }, [actorUsername, queryClient]);

  const invalidateCalendarQueries = useCallback(() => {
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
  }, [actorUsername, queryClient]);

  const invalidateApprovalsQueries = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["approvals", actorUsername],
    });
    void queryClient.invalidateQueries({
      queryKey: ["committee-approval-summary", actorUsername],
    });
  }, [actorUsername, queryClient]);

  const invalidateRoleQueries = useCallback(() => {
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
  }, [actorUsername, queryClient]);

  const invalidateCommitteeQueries = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["committee-roles", actorUsername],
    });
  }, [actorUsername, queryClient]);

  const invalidateMemberQueries = useCallback(() => {
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
  }, [actorUsername, queryClient]);

  const invalidateEquipmentQueries = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["equipment-dashboard", actorUsername],
    });
  }, [actorUsername, queryClient]);

  const invalidateBeginnersQueries = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["beginners-courses-dashboard", actorUsername],
    });
    void queryClient.invalidateQueries({
      queryKey: ["have-a-go-sessions-dashboard", actorUsername],
    });
    void queryClient.invalidateQueries({
      queryKey: ["taster-sessions-dashboard", actorUsername],
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
  }, [actorUsername, queryClient]);

  const invalidateTournamentQueries = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["admin-tournament-warnings", actorUsername],
    });
    void queryClient.invalidateQueries({
      queryKey: ["home-activity", actorUsername],
    });
  }, [actorUsername, queryClient]);

  const invalidateRangeMemberQueries = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["range-members"],
    });
  }, [queryClient]);

  const invalidateLostArrowQueries = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["lost-arrows", actorUsername],
    });
    void queryClient.invalidateQueries({
      queryKey: ["lost-arrow-members", actorUsername],
    });
    void queryClient.invalidateQueries({
      queryKey: ["my-lost-arrow-notices", actorUsername],
    });
  }, [actorUsername, queryClient]);

  const invalidateOutdoorTableQueries = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["outdoor-table"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["outdoor-table-members", actorUsername],
    });
  }, [actorUsername, queryClient]);

  useSseFallbackPolling({
    callback: useCallback(() => {
      invalidateAnnouncementQueries();
      invalidateCalendarQueries();
      invalidateApprovalsQueries();
      invalidateRoleQueries();
      invalidateCommitteeQueries();
      invalidateMemberQueries();
      invalidateEquipmentQueries();
      invalidateBeginnersQueries();
      invalidateTournamentQueries();
      invalidateRangeMemberQueries();
      invalidateLostArrowQueries();
      invalidateOutdoorTableQueries();
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
    ]),
    enabled: canUseServerEvents,
    source: "authenticated-shell",
  });

  useEffect(() => {
    if (!canUseServerEvents) {
      disconnectServerEvents();
      return undefined;
    }

    connectServerEvents();

    const unsubscribeAnnouncements = subscribeToServerEvent(
      "announcements.updated",
      invalidateAnnouncementQueries,
    );
    const unsubscribeCalendar = subscribeToServerEvent(
      "calendar.updated",
      invalidateCalendarQueries,
    );
    const unsubscribeApprovals = subscribeToServerEvent(
      "approvals.updated",
      invalidateApprovalsQueries,
    );
    const unsubscribeRoles = subscribeToServerEvent(
      "roles.updated",
      invalidateRoleQueries,
    );
    const unsubscribeCommittee = subscribeToServerEvent(
      "committee.updated",
      invalidateCommitteeQueries,
    );
    const unsubscribeMembers = subscribeToServerEvent(
      "members.updated",
      invalidateMemberQueries,
    );
    const unsubscribeEquipment = subscribeToServerEvent(
      "equipment.updated",
      invalidateEquipmentQueries,
    );
    const unsubscribeBeginners = subscribeToServerEvent(
      "beginners.updated",
      invalidateBeginnersQueries,
    );
    const unsubscribeTournaments = subscribeToServerEvent(
      "tournaments.updated",
      invalidateTournamentQueries,
    );
    const unsubscribeRangeMembers = subscribeToServerEvent(
      "range-members.updated",
      invalidateRangeMemberQueries,
    );
    const unsubscribeLostArrows = subscribeToServerEvent(
      "lost-found.updated",
      invalidateLostArrowQueries,
    );
    const unsubscribeOutdoorTable = subscribeToServerEvent(
      "outdoor-table.updated",
      invalidateOutdoorTableQueries,
    );

    return () => {
      unsubscribeAnnouncements();
      unsubscribeCalendar();
      unsubscribeApprovals();
      unsubscribeRoles();
      unsubscribeCommittee();
      unsubscribeMembers();
      unsubscribeEquipment();
      unsubscribeBeginners();
      unsubscribeTournaments();
      unsubscribeRangeMembers();
      unsubscribeLostArrows();
      unsubscribeOutdoorTable();
      disconnectServerEvents();
    };
  }, [
    canUseServerEvents,
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
}
