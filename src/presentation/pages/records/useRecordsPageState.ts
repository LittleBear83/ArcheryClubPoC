import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listHandicapTables } from "../../../api/handicapTablesApi";
import { MemberProfileApi } from "../../../api/memberProfileApi";
import { currentIndoorSeasonYear, listIndoorTable } from "../../../api/indoorTableApi";
import { listOutdoorTableDashboard } from "../../../api/outdoorTableApi";
import type { UserProfile } from "../../../types/app";
import { findKnownHandicap, getMemberBowOptions, tableMatchesMemberBow } from "./handicapMemberDefaults";
import { groupHandicapRounds } from "./groupHandicapRounds";
import {
  CLUB_RECORD_ROUNDS,
  DISCIPLINE_OPTIONS,
  INITIAL_FORM,
  SCORE_STATUS_OPTIONS,
} from "./recordsConstants";
import type { FieldKey } from "./recordsConstants";

const EXPOSED_HANDICAP_FAMILY_KEYS = new Set([
  "outdoor-allowances",
  "metric-allowances",
  "indoor-allowances",
]);
const memberProfileApi = new MemberProfileApi();

function getBowDiscipline(tableTitle: string) {
  const normalizedTitle = tableTitle.trim().toLowerCase();

  if (normalizedTitle.includes("non-compound")) {
    return "non-compound";
  }

  if (normalizedTitle.includes("all bows")) {
    return "all-bows";
  }

  if (normalizedTitle.includes("barebow")) {
    return "barebow";
  }

  if (normalizedTitle.includes("compound")) {
    return "compound";
  }

  return "general";
}

type BowDiscipline = ReturnType<typeof getBowDiscipline>;

const BOW_DISCIPLINE_LABELS: Record<BowDiscipline, string> = {
  "all-bows": "All Bows",
  barebow: "Barebow",
  compound: "Compound",
  general: "General",
  "non-compound": "Non-Compound",
};

export function useRecordsPageState(currentUserProfile: UserProfile | null) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [missingFields, setMissingFields] = useState<FieldKey[]>([]);
  const [submitMessage, setSubmitMessage] = useState("");
  const [selectedFamilyKey, setSelectedFamilyKey] = useState("");
  const [selectedRoundKey, setSelectedRoundKey] = useState("");
  const [chosenBowDiscipline, setChosenBowDiscipline] = useState("");
  const [handicapOverride, setHandicapOverride] = useState<string | null>(null);
  const username = currentUserProfile?.auth?.username ?? "";
  const fieldRefs = useRef<Partial<Record<FieldKey, HTMLInputElement | HTMLSelectElement | null>>>(
    {},
  );
  const handicapTablesQuery = useQuery({
    queryKey: ["handicap-tables"],
    queryFn: listHandicapTables,
  });
  const memberProfileQuery = useQuery({
    queryKey: ["records-member-profile", username],
    queryFn: () => memberProfileApi.getProfilePageData(username, username),
    enabled: Boolean(username),
  });
  const indoorRowsQuery = useQuery({
    queryKey: ["indoor-table", currentIndoorSeasonYear(), username],
    queryFn: () => listIndoorTable(currentUserProfile, currentIndoorSeasonYear()),
    enabled: Boolean(username),
  });
  const outdoorRowsQuery = useQuery({
    queryKey: ["outdoor-table", new Date().getFullYear(), username],
    queryFn: () => listOutdoorTableDashboard(currentUserProfile, new Date().getFullYear()),
    enabled: Boolean(username),
  });

  const roundOptions = useMemo(() => CLUB_RECORD_ROUNDS, []);
  const handicapFamilies = useMemo(
    () =>
      (handicapTablesQuery.data?.families ?? []).filter((family) =>
        EXPOSED_HANDICAP_FAMILY_KEYS.has(family.familyKey),
      ),
    [handicapTablesQuery.data?.families],
  );

  const selectedFamily =
    handicapFamilies.find((family) => family.familyKey === selectedFamilyKey) ??
    handicapFamilies[0] ??
    null;
  const memberDisciplines = memberProfileQuery.data?.editableProfile?.disciplines
    ?? currentUserProfile?.membership?.disciplines;
  const memberBowOptions = useMemo(() => getMemberBowOptions(memberDisciplines), [memberDisciplines]);

  const bowDisciplineOptions = useMemo(() => {
    if (memberBowOptions.length) {
      return memberBowOptions;
    }
    if (!selectedFamily) {
      return [{ value: "all", label: "All disciplines" }];
    }

    const seenDisciplines = new Set(
      selectedFamily.tables.map((table) => getBowDiscipline(table.title)),
    );
    const options = [{ value: "all", label: "All disciplines" }];

    for (const discipline of Object.keys(BOW_DISCIPLINE_LABELS).sort() as BowDiscipline[]) {
      if (seenDisciplines.has(discipline)) {
        options.push({
          value: discipline,
          label: BOW_DISCIPLINE_LABELS[discipline],
        });
      }
    }

    return options;
  }, [selectedFamily, memberBowOptions]);

  const selectedBowDiscipline = bowDisciplineOptions.some((option) => option.value === chosenBowDiscipline)
    ? chosenBowDiscipline : bowDisciplineOptions[0]?.value ?? "all";

  const visibleTables = useMemo(() => {
    if (!selectedFamily) {
      return [];
    }

    if (selectedBowDiscipline === "all") {
      return selectedFamily.tables;
    }

    return selectedFamily.tables.filter((table) => memberBowOptions.length
      ? tableMatchesMemberBow(table.title, selectedBowDiscipline)
      : getBowDiscipline(table.title) === selectedBowDiscipline);
  }, [selectedBowDiscipline, selectedFamily, memberBowOptions]);

  const groupedVisibleTables = useMemo(
    () => groupHandicapRounds(visibleTables, selectedFamily?.familyKey),
    [visibleTables, selectedFamily?.familyKey],
  );

  const selectedRound = groupedVisibleTables.find((group) => group.groupKey === selectedRoundKey)
    ?? groupedVisibleTables[0] ?? null;
  const selectedTable = selectedRound?.tables[0] ?? null;
  const knownHandicap = findKnownHandicap({
    bow: selectedBowDiscipline,
    familyKey: selectedFamily?.familyKey ?? "",
    handicaps: memberProfileQuery.data?.goldenRecords?.handicaps,
    indoorRows: indoorRowsQuery.data?.rows,
    outdoorRows: outdoorRowsQuery.data?.rows,
    username,
  });
  const handicapFilter = handicapOverride ?? (knownHandicap === null ? "" : String(knownHandicap));
  const comparisonTables = selectedRound?.tables ?? [];
  const requiredFieldOrder: FieldKey[] = [
    "location",
    "dateShoot",
    "round",
    "discipline",
    "scoreStatus",
    "score",
    "hits",
    "golds",
    "xs",
  ];

  const validateForm = (values = form) =>
    requiredFieldOrder.filter((fieldKey) => !String(values[fieldKey]).trim());

  const isFormComplete = validateForm().length === 0;

  const assignFieldRef = (fieldKey: FieldKey) => (element) => {
    fieldRefs.current[fieldKey] = element;
  };

  const handleOpenModal = () => {
    setIsModalOpen(true);
    setSubmitMessage("");
    setMissingFields([]);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setForm(INITIAL_FORM);
    setMissingFields([]);
  };

  const updateField = (fieldKey: FieldKey, value: string) => {
    setForm((current) => {
      const nextForm = {
        ...current,
        [fieldKey]: value,
      };

      setMissingFields(validateForm(nextForm));
      return nextForm;
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const missing = validateForm();

    if (missing.length > 0) {
      setMissingFields(missing);
      fieldRefs.current[missing[0]]?.focus();
      return;
    }

    setSubmitMessage("The record has been submitted to Golden Records.");
    handleCloseModal();
  };

  const isFieldMissing = (fieldKey: FieldKey) => missingFields.includes(fieldKey);

  return {
    assignFieldRef,
    disciplineOptions: DISCIPLINE_OPTIONS,
    form,
    bowDisciplineOptions,
    comparisonTables,
    groupedVisibleTables,
    handicapFilter,
    handicapFamilies,
    handicapTablesError: handicapTablesQuery.error
      ? handicapTablesQuery.error instanceof Error
        ? handicapTablesQuery.error.message
        : "Unable to load the handicap tables."
      : "",
    handicapTablesLoaded: handicapFamilies.length > 0,
    handicapTablesLoading: handicapTablesQuery.isLoading,
    handleCloseModal,
    handleBowDisciplineChange: (value: string) => { setChosenBowDiscipline(value); setSelectedRoundKey(""); setHandicapOverride(null); },
    handleFamilyChange: (value: string) => { setSelectedFamilyKey(value); setSelectedRoundKey(""); setHandicapOverride(null); },
    handleOpenModal,
    handleSubmit,
    handleTableChange: setSelectedRoundKey,
    handleHandicapFilterChange: setHandicapOverride,
    isFieldMissing,
    isFormComplete,
    isModalOpen,
    missingFields,
    roundOptions,
    scoreStatusOptions: SCORE_STATUS_OPTIONS,
    selectedBowDiscipline,
    selectedFamily,
    selectedFamilyKey,
    selectedTable,
    selectedRound,
    selectedRoundKey,
    sourceDocument: handicapTablesQuery.data?.sourceDocument ?? "",
    sourceRevision: handicapTablesQuery.data?.sourceRevision ?? "",
    sourceTitle: handicapTablesQuery.data?.sourceTitle ?? "",
    submitMessage,
    updateField,
    visibleTables,
  };
}
