import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { bookOnSiteWithMobileApp, extendRangePresence } from "../../../api/memberApi";
import { useMobileGeofence } from "../../hooks/useMobileGeofence";
import type { HomeMember, UserProfile } from "../../../types/app";
import { homeQueryKeys } from "./homeQueryKeys";

const MOBILE_ON_SITE_FEATURE_TARGET = {
  latitude: 53.778213317518684,
  longitude: -1.0966694674728845,
  radiusMeters: 50,
} as const;
const ON_SITE_BOOKING_WINDOW_MS = 2 * 60 * 60 * 1000;
const RANGE_PRESENCE_HOUR_OPTIONS = [2, 3, 4, 5, 6, 8, 10, 12] as const;

export function useRangePresenceFeature({
  actorUsername,
  rangeMembers,
  currentUserProfile,
}: {
  actorUsername: string;
  rangeMembers: HomeMember[];
  currentUserProfile: UserProfile | null;
}) {
  const queryClient = useQueryClient();
  const mobileGeofence = useMobileGeofence({
    targetLatitude: MOBILE_ON_SITE_FEATURE_TARGET.latitude,
    targetLongitude: MOBILE_ON_SITE_FEATURE_TARGET.longitude,
    radiusMeters: MOBILE_ON_SITE_FEATURE_TARGET.radiusMeters,
  });
  const [mobileOnSiteStatus, setMobileOnSiteStatus] = useState("");
  const [mobileOnSiteError, setMobileOnSiteError] = useState("");
  const [isBookingOnSite, setIsBookingOnSite] = useState(false);
  const [isSavingRangePresence, setIsSavingRangePresence] = useState(false);
  const [selectedRangePresenceHours, setSelectedRangePresenceHours] = useState(2);
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());

  const activeRangeMemberEntry = useMemo(
    () =>
      rangeMembers.find(
        (member) =>
          member?.auth?.username?.toLowerCase() === actorUsername.toLowerCase(),
      ) ?? null,
    [actorUsername, rangeMembers],
  );
  const activeRangePresenceEndsAt = useMemo(() => {
    const explicitActiveRangePresenceEndsAt =
      activeRangeMemberEntry?.meta?.activeRangePresenceEndsAt;

    if (explicitActiveRangePresenceEndsAt) {
      const explicitMs = new Date(String(explicitActiveRangePresenceEndsAt)).getTime();

      if (!Number.isNaN(explicitMs)) {
        return explicitMs;
      }
    }

    const lastLoggedInAt = activeRangeMemberEntry?.meta?.lastLoggedInAt;

    if (!lastLoggedInAt) {
      return null;
    }

    const lastLoggedInMs = new Date(String(lastLoggedInAt)).getTime();

    if (Number.isNaN(lastLoggedInMs)) {
      return null;
    }

    return lastLoggedInMs + ON_SITE_BOOKING_WINDOW_MS;
  }, [
    activeRangeMemberEntry?.meta?.activeRangePresenceEndsAt,
    activeRangeMemberEntry?.meta?.lastLoggedInAt,
  ]);
  const isOnSiteBookingWindowOpen = Boolean(
    activeRangePresenceEndsAt && activeRangePresenceEndsAt > nowTimestamp,
  );
  const activeRangePresenceEndsAtText = useMemo(() => {
    if (!activeRangePresenceEndsAt || activeRangePresenceEndsAt <= nowTimestamp) {
      return "";
    }

    return new Date(activeRangePresenceEndsAt).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [activeRangePresenceEndsAt, nowTimestamp]);
  const activeRangePresenceSummaryText = useMemo(() => {
    if (!activeRangePresenceEndsAt || activeRangePresenceEndsAt <= nowTimestamp) {
      return "";
    }

    const remainingHours = Math.max(
      2,
      Math.ceil((activeRangePresenceEndsAt - nowTimestamp) / (60 * 60 * 1000)),
    );

    return `${Math.min(remainingHours, 12)}`;
  }, [activeRangePresenceEndsAt, nowTimestamp]);

  useEffect(() => {
    if (!isOnSiteBookingWindowOpen) {
      setSelectedRangePresenceHours(2);
      return;
    }

    const nextSelectedHours = Number.parseInt(activeRangePresenceSummaryText, 10);

    if (
      Number.isInteger(nextSelectedHours) &&
      RANGE_PRESENCE_HOUR_OPTIONS.includes(
        nextSelectedHours as (typeof RANGE_PRESENCE_HOUR_OPTIONS)[number],
      )
    ) {
      setSelectedRangePresenceHours(nextSelectedHours);
    }
  }, [activeRangePresenceSummaryText, isOnSiteBookingWindowOpen]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return {
    ...mobileGeofence,
    activeRangePresenceEndsAtText,
    activeRangePresenceHours: selectedRangePresenceHours,
    error: mobileOnSiteError || mobileGeofence.error,
    isBookingOnSite,
    isCheckInWindowOpen: isOnSiteBookingWindowOpen,
    isSavingRangePresence,
    onBookOnSite: async () => {
      setIsBookingOnSite(true);
      setMobileOnSiteError("");
      setMobileOnSiteStatus("");

      try {
        const result = await bookOnSiteWithMobileApp();

        setMobileOnSiteStatus(
          result.message ?? "Your on-site mobile check-in has been recorded.",
        );
        await queryClient.invalidateQueries({
          queryKey: homeQueryKeys.rangeMembers(),
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (error) {
        setMobileOnSiteError(
          error instanceof Error
            ? error.message
            : "We could not record your on-site mobile check-in.",
        );
      } finally {
        setIsBookingOnSite(false);
      }
    },
    onChangeRangePresenceHours: setSelectedRangePresenceHours,
    onUpdateRangePresence: async () => {
      setIsSavingRangePresence(true);
      setMobileOnSiteError("");
      setMobileOnSiteStatus("");

      try {
        const result = await extendRangePresence(selectedRangePresenceHours);

        setMobileOnSiteStatus(
          result.message ??
            `Your range presence has been extended for the next ${selectedRangePresenceHours} hours.`,
        );
        await queryClient.invalidateQueries({
          queryKey: homeQueryKeys.rangeMembers(),
        });
      } catch (error) {
        setMobileOnSiteError(
          error instanceof Error
            ? error.message
            : "We could not extend your range presence.",
        );
      } finally {
        setIsSavingRangePresence(false);
      }
    },
    rangePresenceHourOptions: [...RANGE_PRESENCE_HOUR_OPTIONS],
    statusMessage: mobileOnSiteStatus,
    currentUserProfile,
  };
}
