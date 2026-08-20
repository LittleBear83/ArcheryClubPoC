import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listHandicapTables } from "../../../api/handicapTablesApi";
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

function normalizeRoundGroupingTitle(tableTitle: string) {
  const segments = tableTitle
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const preferredSegment = segments.at(-1) ?? tableTitle.trim();

  return preferredSegment
    .replace(/\s+\(([^)]+)\)/g, " ($1)")
    .replace(/\s+\d+[my]?$/i, "")
    .replace(/\s+(i|ii|iii|iv|v)$/i, "")
    .replace(/\s+[-/]\s+\d+$/i, "")
    .trim();
}

function getRoundSeriesKey(tableTitle: string) {
  return normalizeRoundGroupingTitle(tableTitle)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildRoundSeriesLabel(tableTitle: string) {
  return normalizeRoundGroupingTitle(tableTitle) || tableTitle.trim();
}

type BowDiscipline = ReturnType<typeof getBowDiscipline>;

const BOW_DISCIPLINE_LABELS: Record<BowDiscipline, string> = {
  "all-bows": "All Bows",
  barebow: "Barebow",
  compound: "Compound",
  general: "General",
  "non-compound": "Non-Compound",
};

export function useRecordsPageState() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [missingFields, setMissingFields] = useState<FieldKey[]>([]);
  const [submitMessage, setSubmitMessage] = useState("");
  const [selectedFamilyKey, setSelectedFamilyKey] = useState("");
  const [selectedTableKey, setSelectedTableKey] = useState("");
  const [selectedBowDiscipline, setSelectedBowDiscipline] = useState("all");
  const [handicapFilter, setHandicapFilter] = useState("");
  const fieldRefs = useRef<Partial<Record<FieldKey, HTMLInputElement | HTMLSelectElement | null>>>(
    {},
  );
  const handicapTablesQuery = useQuery({
    queryKey: ["handicap-tables"],
    queryFn: listHandicapTables,
  });

  const roundOptions = useMemo(() => CLUB_RECORD_ROUNDS, []);
  const handicapFamilies = useMemo(
    () =>
      (handicapTablesQuery.data?.families ?? []).filter((family) =>
        EXPOSED_HANDICAP_FAMILY_KEYS.has(family.familyKey),
      ),
    [handicapTablesQuery.data?.families],
  );

  useEffect(() => {
    if (!selectedFamilyKey && handicapFamilies.length > 0) {
      setSelectedFamilyKey(handicapFamilies[0].familyKey);
    }
  }, [handicapFamilies, selectedFamilyKey]);

  const selectedFamily =
    handicapFamilies.find((family) => family.familyKey === selectedFamilyKey) ??
    handicapFamilies[0] ??
    null;

  const bowDisciplineOptions = useMemo(() => {
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
  }, [selectedFamily]);

  const visibleTables = useMemo(() => {
    if (!selectedFamily) {
      return [];
    }

    if (selectedBowDiscipline === "all") {
      return selectedFamily.tables;
    }

    return selectedFamily.tables.filter(
      (table) => getBowDiscipline(table.title) === selectedBowDiscipline,
    );
  }, [selectedBowDiscipline, selectedFamily]);

  const groupedVisibleTables = useMemo(() => {
    const groups = new Map<
      string,
      { groupKey: string; label: string; tables: typeof visibleTables }
    >();

    for (const table of visibleTables) {
      const groupKey = getRoundSeriesKey(table.title);
      const existingGroup = groups.get(groupKey);

      if (existingGroup) {
        existingGroup.tables.push(table);
        continue;
      }

      groups.set(groupKey, {
        groupKey,
        label: buildRoundSeriesLabel(table.title),
        tables: [table],
      });
    }

    return Array.from(groups.values());
  }, [visibleTables]);

  useEffect(() => {
    const hasSelectedBowDiscipline = bowDisciplineOptions.some(
      (option) => option.value === selectedBowDiscipline,
    );

    if (!hasSelectedBowDiscipline) {
      setSelectedBowDiscipline("all");
    }
  }, [bowDisciplineOptions, selectedBowDiscipline]);

  useEffect(() => {
    if (!selectedFamily) {
      if (selectedTableKey) {
        setSelectedTableKey("");
      }
      return;
    }

    const hasSelectedTable = visibleTables.some((table) => table.tableKey === selectedTableKey);
    if (!hasSelectedTable) {
      setSelectedTableKey(visibleTables[0]?.tableKey ?? "");
    }
  }, [selectedFamily, selectedTableKey, visibleTables]);

  const selectedTable =
    visibleTables.find((table) => table.tableKey === selectedTableKey) ??
    visibleTables[0] ??
    null;
  const comparisonTables = useMemo(() => {
    if (!selectedTable) {
      return [];
    }

    const selectedSeriesKey = getRoundSeriesKey(selectedTable.title);
    const relatedTables =
      groupedVisibleTables.find((group) => group.groupKey === selectedSeriesKey)?.tables ?? [];

    return relatedTables.length > 0 ? relatedTables : [selectedTable];
  }, [groupedVisibleTables, selectedTable]);
  const normalizedHandicapFilter = handicapFilter.trim();
  const filteredHandicapRows = useMemo(() => {
    if (!selectedTable) {
      return [];
    }

    if (!normalizedHandicapFilter) {
      return selectedTable.rows;
    }

    const handicapValue = Number.parseInt(normalizedHandicapFilter, 10);
    if (Number.isNaN(handicapValue)) {
      return [];
    }

    return selectedTable.rows.filter((row) => row.handicapValue === handicapValue);
  }, [normalizedHandicapFilter, selectedTable]);

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
    filteredHandicapRows,
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
    handleBowDisciplineChange: setSelectedBowDiscipline,
    handleFamilyChange: setSelectedFamilyKey,
    handleOpenModal,
    handleSubmit,
    handleTableChange: setSelectedTableKey,
    handleHandicapFilterChange: setHandicapFilter,
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
    selectedTableKey,
    sourceDocument: handicapTablesQuery.data?.sourceDocument ?? "",
    sourceRevision: handicapTablesQuery.data?.sourceRevision ?? "",
    sourceTitle: handicapTablesQuery.data?.sourceTitle ?? "",
    submitMessage,
    updateField,
    visibleTables,
  };
}
