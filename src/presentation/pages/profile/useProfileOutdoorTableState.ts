import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { subscribeToServerEvent } from "../../../lib/serverEvents";
import { useSseFallbackPolling } from "../../state/useSseFallbackPolling";
import {
  createOutdoorTableEntry,
  listOutdoorTableDashboard,
  updateOutdoorTableEntry,
} from "../../../api/outdoorTableApi";
import type { OutdoorTableEntry, UserProfile } from "../../../types/app";
import type { GoldenRecordsSnapshot } from "../../../domain/entities/MemberProfile";
import {
  BOW_TYPE_DISCIPLINE_MAPPINGS,
  CURRENT_OUTDOOR_SEASON_YEAR,
  OUTDOOR_252_COLUMNS,
  countCompletedSignOffs,
  buildEmptyOutdoorTableDraft,
  buildOutdoorTableDraftFromEntry,
  toOutdoorTablePayload,
  type OutdoorAchievementDateFieldKey,
  type Outdoor252SignOffFieldKey,
  type ProfileOutdoorTableDraft,
} from "./outdoorTableProfileUtils";

function mapGoldenRecordsBowClassToBowType(bowClass: string) {
  switch (String(bowClass ?? "").trim().toLowerCase()) {
    case "recurve":
      return "Rec";
    case "compound":
      return "Comp";
    case "barebow":
      return "B/bow";
    case "longbow":
      return "L/bow";
    default:
      return "";
  }
}

function normalizeGoldenRecordsHandicapType(value: string) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized.includes("outdoor")) {
    return "outdoor";
  }

  if (normalized.includes("indoor")) {
    return "indoor";
  }

  return normalized;
}

function buildGoldenRecordsHandicapsByBowType(snapshot, type) {
  const entries = snapshot?.handicaps ?? [];
  const normalizedType = normalizeGoldenRecordsHandicapType(String(type ?? ""));

  return entries.reduce(
    (next, entry) => {
      if (normalizeGoldenRecordsHandicapType(entry.type) !== normalizedType) {
        return next;
      }

      const bowType = mapGoldenRecordsBowClassToBowType(entry.bowClass);

      if (!bowType) {
        return next;
      }

      next[bowType] = {
        achieved: entry.achieved,
        handicap: entry.handicap,
      };

      return next;
    },
    {} as Record<string, { achieved: string; handicap: number | null }>,
  );
}

export function useProfileOutdoorTableState({
  activeUsername,
  canManageOutdoorAchievements,
  currentUserProfile,
  editableProfile,
  goldenRecordsSnapshot,
  isGuest,
  setGoldenRecordsSnapshot,
  onClearMessages,
  onMessage,
}: {
  activeUsername: string;
  canManageOutdoorAchievements: boolean;
  currentUserProfile: UserProfile | null;
  editableProfile: any;
  goldenRecordsSnapshot: GoldenRecordsSnapshot | null;
  isGuest: boolean;
  setGoldenRecordsSnapshot: React.Dispatch<React.SetStateAction<GoldenRecordsSnapshot | null>>;
  onClearMessages: () => void;
  onMessage: (message: string) => void;
}) {
  const isLoadingOutdoorTableRef = useRef(false);
  const [outdoorTableEntries, setOutdoorTableEntries] = useState<OutdoorTableEntry[]>([]);
  const [outdoorTableDraftsByBowType, setOutdoorTableDraftsByBowType] = useState<
    Record<string, ProfileOutdoorTableDraft>
  >({});
  const [outdoorTableError, setOutdoorTableError] = useState("");
  const [isLoadingOutdoorTable, setIsLoadingOutdoorTable] = useState(false);
  const [isSavingOutdoorTableByBowType, setIsSavingOutdoorTableByBowType] = useState<
    Record<string, boolean>
  >({});

  const outdoorTableBowEntries = useMemo(
    () => Object.values(outdoorTableDraftsByBowType),
    [outdoorTableDraftsByBowType],
  );
  const goldenRecordsOutdoorHandicapsByBowType = useMemo(
    () => buildGoldenRecordsHandicapsByBowType(goldenRecordsSnapshot, "outdoor"),
    [goldenRecordsSnapshot],
  );
  const goldenRecordsIndoorHandicapsByBowType = useMemo(
    () => buildGoldenRecordsHandicapsByBowType(goldenRecordsSnapshot, "indoor"),
    [goldenRecordsSnapshot],
  );
  const goldenRecordsFetchedAt = goldenRecordsSnapshot?.fetchedAt ?? "";

  const loadOutdoorTableEntries = useCallback(
    async (username, signal?: AbortSignal) => {
      if (isGuest || !username) {
        setOutdoorTableEntries([]);
        setIsLoadingOutdoorTable(false);
        return;
      }

      if (isLoadingOutdoorTableRef.current) {
        return;
      }

      isLoadingOutdoorTableRef.current = true;
      setIsLoadingOutdoorTable(true);
      setOutdoorTableError("");

      try {
        const result = await listOutdoorTableDashboard(
          currentUserProfile,
          CURRENT_OUTDOOR_SEASON_YEAR,
        );

        if (signal?.aborted) {
          return;
        }

        setOutdoorTableEntries(
          (result.rows ?? []).filter((entry) => entry.archerUsername === username),
        );
      } catch (loadError) {
        if (!signal?.aborted) {
          setOutdoorTableError(loadError.message);
        }
      } finally {
        isLoadingOutdoorTableRef.current = false;

        if (!signal?.aborted) {
          setIsLoadingOutdoorTable(false);
        }
      }
    },
    [currentUserProfile, isGuest],
  );

  useEffect(() => {
    setOutdoorTableEntries([]);
    setOutdoorTableDraftsByBowType({});
    setOutdoorTableError("");
    setIsLoadingOutdoorTable(false);
    setIsSavingOutdoorTableByBowType({});
    setGoldenRecordsSnapshot(null);
  }, [currentUserProfile?.auth?.username, setGoldenRecordsSnapshot]);

  useEffect(() => {
    if (!activeUsername) {
      return undefined;
    }

    const abortController = new AbortController();
    const refreshOutdoorTable = () => {
      void loadOutdoorTableEntries(activeUsername, abortController.signal);
    };

    refreshOutdoorTable();
    const unsubscribeOutdoorTable = subscribeToServerEvent(
      "outdoor-table.updated",
      refreshOutdoorTable,
    );
    const unsubscribeMembers = subscribeToServerEvent("members.updated", refreshOutdoorTable);

    return () => {
      abortController.abort();
      unsubscribeOutdoorTable();
      unsubscribeMembers();
    };
  }, [activeUsername, loadOutdoorTableEntries]);

  useSseFallbackPolling({
    callback: () => {
      if (!activeUsername) {
        return;
      }

      void loadOutdoorTableEntries(activeUsername, undefined);
    },
    enabled: Boolean(activeUsername),
    source: "profile-outdoor-table",
  });

  useEffect(() => {
    if (!editableProfile?.username) {
      setOutdoorTableDraftsByBowType({});
      return;
    }

    const rowsByBowType = new Map(
      outdoorTableEntries.map((entry) => [entry.bowType, entry]),
    );
    const nextDrafts = BOW_TYPE_DISCIPLINE_MAPPINGS.filter((mapping) =>
      editableProfile.disciplines.includes(mapping.discipline),
    ).reduce<Record<string, ProfileOutdoorTableDraft>>((drafts, mapping) => {
      const existingEntry = rowsByBowType.get(mapping.bowType);

      drafts[mapping.bowType] = existingEntry
        ? buildOutdoorTableDraftFromEntry(existingEntry, mapping.discipline)
        : buildEmptyOutdoorTableDraft(
            editableProfile.username,
            mapping.bowType,
            mapping.discipline,
          );

      return drafts;
    }, {});

    setOutdoorTableDraftsByBowType(nextDrafts);
  }, [editableProfile?.disciplines, editableProfile?.username, outdoorTableEntries]);

  const handleOutdoorTableAchievementDateChange = (
    bowType: string,
    field: OutdoorAchievementDateFieldKey,
    value: string,
  ) => {
    setOutdoorTableDraftsByBowType((current) => {
      const existingDraft = current[bowType];

      if (!existingDraft) {
        return current;
      }

      return {
        ...current,
        [bowType]: {
          ...existingDraft,
          [field]: value,
          ...(field === "archer3rdDate" ? { archer3rd: Boolean(value) } : {}),
          ...(field === "archer2ndDate" ? { archer2nd: Boolean(value) } : {}),
          ...(field === "archer1stDate" ? { archer1st: Boolean(value) } : {}),
          ...(field === "bowman3rdDate" ? { bowman3rd: Boolean(value) } : {}),
          ...(field === "bowman2ndDate" ? { bowman2nd: Boolean(value) } : {}),
          ...(field === "bowman1stDate" ? { bowman1st: Boolean(value) } : {}),
          ...(field === "masterBowmanDate" ? { masterBowman: Boolean(value) } : {}),
          ...(field === "grandMasterBowmanDate"
            ? { grandMasterBowman: Boolean(value) }
            : {}),
          ...(field === "eliteMasterBowmanDate"
            ? { eliteMasterBowman: Boolean(value) }
            : {}),
        },
      };
    });
  };

  const handleOutdoorTableHandicapChange = (bowType: string, value: string) => {
    setOutdoorTableDraftsByBowType((current) => {
      const existingDraft = current[bowType];

      if (!existingDraft) {
        return current;
      }

      return {
        ...current,
        [bowType]: {
          ...existingDraft,
          handicapText: value,
          handicap: value.trim() === "" ? null : Number.parseInt(value, 10),
        },
      };
    });
  };

  const handleOutdoorTableAward252SignOffDateChange = (
    bowType: string,
    field: Outdoor252SignOffFieldKey,
    index: number,
    value: string,
  ) => {
    setOutdoorTableDraftsByBowType((current) => {
      const existingDraft = current[bowType];

      if (!existingDraft) {
        return current;
      }

      const nextDates = [...existingDraft[field]];
      nextDates[index] = value;
      const linkedAward =
        OUTDOOR_252_COLUMNS.find((column) => column.signOffKey === field)?.awardKey ?? null;
      const nextDraft: ProfileOutdoorTableDraft = {
        ...existingDraft,
        [field]: nextDates,
      };

      if (linkedAward) {
        nextDraft[linkedAward] = countCompletedSignOffs(nextDates) >= 3;
      }

      return {
        ...current,
        [bowType]: nextDraft,
      };
    });
  };

  const handleSaveOutdoorTableEntry = async (bowType: string) => {
    const draft = outdoorTableDraftsByBowType[bowType];

    if (!draft) {
      return;
    }

    setIsSavingOutdoorTableByBowType((current) => ({
      ...current,
      [bowType]: true,
    }));
    setOutdoorTableError("");
    onClearMessages();

    try {
      if (!canManageOutdoorAchievements) {
        setOutdoorTableError(
          "Members cannot sign off their own outdoor achievements. Another authorised member must complete the sign-off.",
        );
        return;
      }

      const payload = toOutdoorTablePayload(draft);
      const result =
        draft.id === null
          ? await createOutdoorTableEntry(currentUserProfile, payload)
          : await updateOutdoorTableEntry(currentUserProfile, draft.id, payload);

      setOutdoorTableEntries((current) => {
        const nextEntries = current.filter((entry) => entry.bowType !== bowType);
        nextEntries.push(result.entry);
        return nextEntries.sort((left, right) => left.bowType.localeCompare(right.bowType));
      });
      onMessage(
        `${draft.discipline} outdoor progress saved for ${editableProfile?.firstName} ${editableProfile?.surname}.`,
      );
    } catch (saveError) {
      setOutdoorTableError(saveError.message);
    } finally {
      setIsSavingOutdoorTableByBowType((current) => ({
        ...current,
        [bowType]: false,
      }));
    }
  };

  const resetOutdoorTableState = () => {
    setOutdoorTableEntries([]);
    setOutdoorTableDraftsByBowType({});
    setOutdoorTableError("");
    setIsLoadingOutdoorTable(false);
    setIsSavingOutdoorTableByBowType({});
    setGoldenRecordsSnapshot(null);
  };

  return {
    goldenRecordsFetchedAt,
    goldenRecordsIndoorHandicapsByBowType,
    goldenRecordsOutdoorHandicapsByBowType,
    handleOutdoorTableAchievementDateChange,
    handleOutdoorTableAward252SignOffDateChange,
    handleOutdoorTableHandicapChange,
    handleSaveOutdoorTableEntry,
    isLoadingOutdoorTable,
    isSavingOutdoorTableByBowType,
    outdoorTableBowEntries,
    outdoorTableError,
    setGoldenRecordsSnapshot,
    resetOutdoorTableState,
  };
}
