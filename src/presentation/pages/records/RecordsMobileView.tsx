import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { MobileCardList } from "../../components/mobile/MobileCardList";
import { MobileSectionHeader } from "../../components/mobile/MobileSectionHeader";
import { CLUB_RECORD_ROUNDS } from "./recordsConstants";
import type { useRecordsPageState } from "./useRecordsPageState";

type RecordsPageState = ReturnType<typeof useRecordsPageState>;

export function RecordsMobileView({
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
    <section className="records-page records-page--mobile">
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

        <div className="records-records-panel">
          <MobileSectionHeader
            title="Club Records"
            description="Current placeholders for round records."
          />
          <MobileCardList className="records-mobile-card-list">
            {CLUB_RECORD_ROUNDS.map((round) => (
              <article key={round} className="records-mobile-card">
                <p className="records-mobile-card-title">{round}</p>
                <div className="records-mobile-card-values">
                  <span>Male: -</span>
                  <span>Female: -</span>
                </div>
              </article>
            ))}
          </MobileCardList>
        </div>
      </div>

      <Modal
        open={isModalOpen}
        onClose={handleCloseModal}
        title="Submit New Scores"
        contentClassName="records-modal"
      >
        <form className="records-form records-form--mobile" onSubmit={handleSubmit} noValidate>
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

          <div className="records-mobile-score-grid">
            {[
              ["score", "Score"],
              ["hits", "Hits"],
              ["golds", "Golds"],
              ["xs", "X's"],
            ].map(([fieldKey, label]) => (
              <label
                key={fieldKey}
                className={isFieldMissing(fieldKey as keyof typeof form) ? "records-field records-field--invalid" : "records-field"}
              >
                {label}
                <input
                  ref={assignFieldRef(fieldKey as keyof typeof form)}
                  className={isFieldMissing(fieldKey as keyof typeof form) ? "records-score-input records-score-input--invalid" : "records-score-input"}
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={form[fieldKey as keyof typeof form]}
                  onChange={(event) => updateField(fieldKey as keyof typeof form, event.target.value)}
                />
              </label>
            ))}
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
