import { useMemo, useRef, useState } from "react";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";

const ROUND_OPTIONS = {
  indoor: [
    "Portsmouth",
    "Worcester",
    "Vegas",
    "WA 18",
    "WA 25",
    "Bray I",
    "Bray II",
  ],
  outdoor: [
    "WA 70m",
    "WA 60m",
    "WA 50m",
    "WA 1440",
    "York",
    "Hereford",
    "St George",
    "Albion",
    "Windsor",
    "National",
    "Western",
  ],
} as const;

const DISCIPLINE_OPTIONS = [
  "Recurve",
  "Compound",
  "Barebow",
  "Longbow",
  "Traditional",
];

const CLUB_RECORD_ROUNDS = [
  ...ROUND_OPTIONS.indoor,
  ...ROUND_OPTIONS.outdoor,
];

const INITIAL_FORM = {
  where: "",
  round: "",
  discipline: "",
  hits: "",
  misses: "",
  score: "",
  golds: "",
  xs: "",
};

type FieldKey = keyof typeof INITIAL_FORM;

export function RecordsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [missingFields, setMissingFields] = useState<FieldKey[]>([]);
  const [submitMessage, setSubmitMessage] = useState("");
  const fieldRefs = useRef<Partial<Record<FieldKey, HTMLInputElement | HTMLSelectElement | null>>>(
    {},
  );

  const roundOptions = useMemo(() => {
    if (form.where !== "indoor" && form.where !== "outdoor") {
      return [];
    }

    return ROUND_OPTIONS[form.where];
  }, [form.where]);

  const requiredFieldOrder: FieldKey[] = [
    "where",
    "round",
    "discipline",
    "hits",
    "misses",
    "score",
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
      const nextForm =
        fieldKey === "where"
          ? {
              ...current,
              where: value,
              round: "",
            }
          : {
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

    setSubmitMessage("The recored has been submitted to Golden Records.");
    handleCloseModal();
  };

  const isFieldMissing = (fieldKey: FieldKey) => missingFields.includes(fieldKey);

  return (
    <section className="records-page">
      <div className="records-page-layout">
        <div className="records-page-main">
          <div className="records-page-header">
            <div className="records-page-copy">
              <p className="records-page-eyebrow">Records</p>
              <h2>Club records and score submissions</h2>
              <p className="records-page-note">
                <strong>future inprovment planned</strong>
              </p>
            </div>
          </div>

          {submitMessage ? <p className="profile-success">{submitMessage}</p> : null}

          <div className="records-page-panel">
            <p className="records-page-panel-copy">
              Score submission for formal records will be expanded here, including approval
              flow, historical views, and record tracking.
            </p>
          </div>

          <div className="records-page-actions">
            <Button
              type="button"
              className="records-page-button"
              onClick={handleOpenModal}
            >
              submit new score
            </Button>
          </div>
        </div>

        <aside className="records-page-sidebar" aria-labelledby="club-records-title">
          <div className="records-records-panel">
            <h3 id="club-records-title">Club Records</h3>
            <div className="records-records-table-wrap">
              <table className="records-records-table">
                <thead>
                  <tr>
                    <th scope="col">Round</th>
                    <th scope="col">Male</th>
                    <th scope="col">Female</th>
                  </tr>
                </thead>
                <tbody>
                  {CLUB_RECORD_ROUNDS.map((round) => (
                    <tr key={round}>
                      <th scope="row">{round}</th>
                      <td>-</td>
                      <td>-</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </aside>
      </div>

      <Modal
        open={isModalOpen}
        onClose={handleCloseModal}
        title="Submit New Score"
        contentClassName="records-modal"
      >
        <form className="records-form" onSubmit={handleSubmit} noValidate>
          <div className="records-form-grid">
            <label className={isFieldMissing("where") ? "records-field records-field--invalid" : "records-field"}>
              Where
              <select
                ref={assignFieldRef("where")}
                value={form.where}
                onChange={(event) => updateField("where", event.target.value)}
              >
                <option value="">Select location</option>
                <option value="indoor">Indoor</option>
                <option value="outdoor">Outdoor</option>
              </select>
            </label>

            <label className={isFieldMissing("round") ? "records-field records-field--invalid" : "records-field"}>
              Round
              <select
                ref={assignFieldRef("round")}
                value={form.round}
                onChange={(event) => updateField("round", event.target.value)}
                disabled={!form.where}
              >
                <option value="">
                  {form.where ? "Select round" : "Choose where first"}
                </option>
                {roundOptions.map((round) => (
                  <option key={round} value={round}>
                    {round}
                  </option>
                ))}
              </select>
            </label>

            <label
              className={
                isFieldMissing("discipline")
                  ? "records-field records-field--invalid"
                  : "records-field"
              }
            >
              Discipline
              <select
                ref={assignFieldRef("discipline")}
                value={form.discipline}
                onChange={(event) => updateField("discipline", event.target.value)}
              >
                <option value="">Select discipline</option>
                {DISCIPLINE_OPTIONS.map((discipline) => (
                  <option key={discipline} value={discipline}>
                    {discipline}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="records-score-table-wrap">
            <table className="records-score-table">
              <thead>
                <tr>
                  <th scope="col">Hits</th>
                  <th scope="col">Misses</th>
                  <th scope="col">Score</th>
                  <th scope="col">Golds</th>
                  <th scope="col">X&apos;s</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <input
                      ref={assignFieldRef("hits")}
                      className={isFieldMissing("hits") ? "records-score-input records-score-input--invalid" : "records-score-input"}
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={form.hits}
                      onChange={(event) => updateField("hits", event.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      ref={assignFieldRef("misses")}
                      className={isFieldMissing("misses") ? "records-score-input records-score-input--invalid" : "records-score-input"}
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={form.misses}
                      onChange={(event) => updateField("misses", event.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      ref={assignFieldRef("score")}
                      className={isFieldMissing("score") ? "records-score-input records-score-input--invalid" : "records-score-input"}
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={form.score}
                      onChange={(event) => updateField("score", event.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      ref={assignFieldRef("golds")}
                      className={isFieldMissing("golds") ? "records-score-input records-score-input--invalid" : "records-score-input"}
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={form.golds}
                      onChange={(event) => updateField("golds", event.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      ref={assignFieldRef("xs")}
                      className={isFieldMissing("xs") ? "records-score-input records-score-input--invalid" : "records-score-input"}
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={form.xs}
                      onChange={(event) => updateField("xs", event.target.value)}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {missingFields.length > 0 ? (
            <p className="profile-error">
              Complete every field before submitting your score.
            </p>
          ) : null}

          <div className="records-form-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={handleCloseModal}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isFormComplete}>
              Submit
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
