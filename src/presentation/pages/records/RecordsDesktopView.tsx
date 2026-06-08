import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { CLUB_RECORD_ROUNDS } from "./recordsConstants";
import type { useRecordsPageState } from "./useRecordsPageState";

type RecordsPageState = ReturnType<typeof useRecordsPageState>;

export function RecordsDesktopView({
  assignFieldRef,
  disciplineOptions,
  form,
  handleCloseModal,
  handleOpenModal,
  handleSubmit,
  isFieldMissing,
  isFormComplete,
  isModalOpen,
  missingFields,
  roundOptions,
  scoreStatusOptions,
  submitMessage,
  updateField,
}: RecordsPageState) {
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
              submit new scores
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
        title="Submit New Scores"
        contentClassName="records-modal"
      >
        <form className="records-form" onSubmit={handleSubmit} noValidate>
          <div className="records-form-grid">
            <label className={isFieldMissing("location") ? "records-field records-field--invalid" : "records-field"}>
              Location
              <input
                ref={assignFieldRef("location")}
                type="text"
                value={form.location}
                onChange={(event) => updateField("location", event.target.value)}
                placeholder="Selby"
              />
            </label>

            <label className={isFieldMissing("dateShoot") ? "records-field records-field--invalid" : "records-field"}>
              Date Shoot
              <input
                ref={assignFieldRef("dateShoot")}
                type="date"
                value={form.dateShoot}
                onChange={(event) => updateField("dateShoot", event.target.value)}
              />
            </label>

            <label className={isFieldMissing("round") ? "records-field records-field--invalid" : "records-field"}>
              Round
              <select
                ref={assignFieldRef("round")}
                value={form.round}
                onChange={(event) => updateField("round", event.target.value)}
              >
                <option value="">Select round</option>
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
                {disciplineOptions.map((discipline) => (
                  <option key={discipline} value={discipline}>
                    {discipline}
                  </option>
                ))}
              </select>
            </label>

            <label
              className={
                isFieldMissing("scoreStatus")
                  ? "records-field records-field--invalid"
                  : "records-field"
              }
            >
              Score Status
              <select
                ref={assignFieldRef("scoreStatus")}
                value={form.scoreStatus}
                onChange={(event) => updateField("scoreStatus", event.target.value)}
              >
                <option value="">Select score status</option>
                {scoreStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="records-score-table-wrap">
            <table className="records-score-table">
              <thead>
                <tr>
                  <th scope="col">Score</th>
                  <th scope="col">Hits</th>
                  <th scope="col">Golds</th>
                  <th scope="col">X&apos;s</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  {(["score", "hits", "golds", "xs"] as const).map((fieldKey) => (
                    <td key={fieldKey}>
                      <input
                        ref={assignFieldRef(fieldKey)}
                        className={isFieldMissing(fieldKey) ? "records-score-input records-score-input--invalid" : "records-score-input"}
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={form[fieldKey]}
                        onChange={(event) => updateField(fieldKey, event.target.value)}
                      />
                    </td>
                  ))}
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
