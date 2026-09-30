import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { subscribeToServerEvent } from "../../../lib/serverEvents";
import { useSseFallbackPolling } from "../../state/useSseFallbackPolling";
import type { GoldenRecordsSnapshot } from "../../../domain/entities/MemberProfile";

type LoadProfileOptions = {
  signal?: AbortSignal;
  isBackgroundRefresh?: boolean;
};

export function useProfilePageDataState({
  actorUsername,
  canSelectMembers,
  currentUserProfile,
  isGuest,
  memberProfileCrud,
}: {
  actorUsername: string;
  canSelectMembers: boolean;
  currentUserProfile: any;
  isGuest: boolean;
  memberProfileCrud: any;
}) {
  const hasLoadedProfileRef = useRef(false);
  const profileRequestIdRef = useRef(0);
  const profileOptionsRequestIdRef = useRef(0);
  const [editableProfile, setEditableProfile] = useState(null);
  const [memberOptions, setMemberOptions] = useState([]);
  const [selectedUsername, setSelectedUsername] = useState(
    currentUserProfile?.auth?.username ?? "",
  );
  const [disciplineOptions, setDisciplineOptions] = useState([]);
  const [roleOptions, setRoleOptions] = useState([]);
  const [membershipStatusOptions, setMembershipStatusOptions] = useState([]);
  const [programmeTypeOptions, setProgrammeTypeOptions] = useState([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshingProfile, setIsRefreshingProfile] = useState(false);
  const [equipmentLoans, setEquipmentLoans] = useState([]);
  const [goldenRecordsSnapshot, setGoldenRecordsSnapshot] = useState<GoldenRecordsSnapshot | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const activeUsername = useMemo(() => {
    if (isGuest) {
      return "";
    }

    return canSelectMembers
      ? selectedUsername || currentUserProfile?.auth?.username || ""
      : currentUserProfile?.auth?.username || "";
  }, [canSelectMembers, currentUserProfile, isGuest, selectedUsername]);

  useEffect(() => {
    hasLoadedProfileRef.current = false;
    setEditableProfile(null);
    setMemberOptions([]);
    setSelectedUsername(currentUserProfile?.auth?.username ?? "");
    setDisciplineOptions([]);
    setRoleOptions([]);
    setMembershipStatusOptions([]);
    setProgrammeTypeOptions([]);
    setIsInitialLoading(true);
    setIsRefreshingProfile(false);
    setEquipmentLoans([]);
    setGoldenRecordsSnapshot(null);
    setError("");
    setMessage("");
  }, [currentUserProfile?.auth?.username]);

  const loadProfile = useCallback(
    async (
      username,
      { signal, isBackgroundRefresh = false }: LoadProfileOptions = {},
    ) => {
      if (isGuest || !username) {
        setIsInitialLoading(false);
        return;
      }

      const requestId = profileRequestIdRef.current + 1;
      profileRequestIdRef.current = requestId;

      if (isBackgroundRefresh) {
        setIsRefreshingProfile(true);
      } else {
        setIsInitialLoading(true);
      }

      setError("");

      try {
        const result = await memberProfileCrud.getMemberProfilePageDataUseCase.execute({
          actorUsername,
          username,
          signal,
        });

        if (signal?.aborted || profileRequestIdRef.current !== requestId) {
          return;
        }

        setEditableProfile(result.editableProfile);
        setEquipmentLoans(result.equipmentLoans ?? []);
        setGoldenRecordsSnapshot(result.goldenRecords ?? null);
        setDisciplineOptions(result.disciplines ?? []);
        setRoleOptions(result.userTypes ?? []);
        setMembershipStatusOptions(result.membershipStatuses ?? []);
        setProgrammeTypeOptions(result.programmeTypes ?? []);
        setMessage("");
        hasLoadedProfileRef.current = true;
      } catch (loadError) {
        if (!signal?.aborted && profileRequestIdRef.current === requestId) {
          setError(loadError.message);
        }
      } finally {
        if (profileRequestIdRef.current === requestId) {
          setIsInitialLoading(false);
          setIsRefreshingProfile(false);
        }
      }
    },
    [actorUsername, isGuest, memberProfileCrud],
  );

  const loadProfileOptions = useCallback(
    async (signal) => {
      if (!canSelectMembers || isGuest) {
        return;
      }

      const requestId = profileOptionsRequestIdRef.current + 1;
      profileOptionsRequestIdRef.current = requestId;

      try {
        const result = await memberProfileCrud.getMemberProfileOptionsUseCase.execute({
          actorUsername,
          signal,
        });

        if (signal?.aborted || profileOptionsRequestIdRef.current !== requestId) {
          return;
        }

        setMemberOptions(result.members ?? []);
        setRoleOptions(result.userTypes ?? []);
        setMembershipStatusOptions(result.membershipStatuses ?? []);
        setProgrammeTypeOptions(result.programmeTypes ?? []);
        setDisciplineOptions(result.disciplines ?? []);
      } catch (loadError) {
        if (!signal?.aborted && profileOptionsRequestIdRef.current === requestId) {
          setError(loadError.message);
        }
      }
    },
    [actorUsername, canSelectMembers, isGuest, memberProfileCrud],
  );

  useEffect(() => {
    if (!canSelectMembers || isGuest) {
      return undefined;
    }

    const abortController = new AbortController();
    const refreshOptions = () => {
      loadProfileOptions(abortController.signal);
    };

    refreshOptions();
    const unsubscribeMembers = subscribeToServerEvent("members.updated", refreshOptions);
    const unsubscribeRoles = subscribeToServerEvent("roles.updated", refreshOptions);

    return () => {
      abortController.abort();
      unsubscribeMembers();
      unsubscribeRoles();
    };
  }, [canSelectMembers, isGuest, loadProfileOptions]);

  useSseFallbackPolling({
    callback: () => {
      void loadProfileOptions(undefined);
    },
    enabled: canSelectMembers && !isGuest,
    source: "profile-options",
  });

  useEffect(() => {
    if (!activeUsername) {
      hasLoadedProfileRef.current = false;
      setEditableProfile(null);
      setEquipmentLoans([]);
      setGoldenRecordsSnapshot(null);
      setError("");
      setMessage("");
      setIsInitialLoading(false);
      return undefined;
    }

    const abortController = new AbortController();
    const refreshProfile = () => {
      loadProfile(activeUsername, {
        signal: abortController.signal,
        isBackgroundRefresh: hasLoadedProfileRef.current,
      });
    };

    refreshProfile();
    const unsubscribeMembers = subscribeToServerEvent("members.updated", refreshProfile);
    const unsubscribeRoles = subscribeToServerEvent("roles.updated", refreshProfile);

    return () => {
      abortController.abort();
      unsubscribeMembers();
      unsubscribeRoles();
    };
  }, [activeUsername, loadProfile]);

  useSseFallbackPolling({
    callback: () => {
      if (!activeUsername) {
        return;
      }

      void loadProfile(activeUsername, {
        isBackgroundRefresh: hasLoadedProfileRef.current,
      });
    },
    enabled: Boolean(activeUsername),
    source: "profile-page",
  });

  return {
    activeUsername,
    disciplineOptions,
    editableProfile,
    equipmentLoans,
    goldenRecordsSnapshot,
    error,
    hasLoadedProfileRef,
    isInitialLoading,
    isRefreshingProfile,
    loadProfile,
    memberOptions,
    membershipStatusOptions,
    message,
    programmeTypeOptions,
    roleOptions,
    selectedUsername,
    setDisciplineOptions,
    setEditableProfile,
    setEquipmentLoans,
    setGoldenRecordsSnapshot,
    setError,
    setIsInitialLoading,
    setIsRefreshingProfile,
    setMemberOptions,
    setMembershipStatusOptions,
    setMessage,
    setProgrammeTypeOptions,
    setRoleOptions,
    setSelectedUsername,
  };
}
