import { useMemo, useRef, useState } from "react";
import {
  CLUB_RECORD_ROUNDS,
  DISCIPLINE_OPTIONS,
  INITIAL_FORM,
  SCORE_STATUS_OPTIONS,
} from "./recordsConstants";
import type { FieldKey } from "./recordsConstants";

export function useRecordsPageState() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [missingFields, setMissingFields] = useState<FieldKey[]>([]);
  const [submitMessage, setSubmitMessage] = useState("");
  const fieldRefs = useRef<Partial<Record<FieldKey, HTMLInputElement | HTMLSelectElement | null>>>(
    {},
  );

  const roundOptions = useMemo(() => CLUB_RECORD_ROUNDS, []);

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
    handleCloseModal,
    handleOpenModal,
    handleSubmit,
    isFieldMissing,
    isFormComplete,
    isModalOpen,
    missingFields,
    roundOptions,
    scoreStatusOptions: SCORE_STATUS_OPTIONS,
    submitMessage,
    updateField,
  };
}
