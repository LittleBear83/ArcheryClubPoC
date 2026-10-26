import { useEffect, useRef, useState } from "react";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { saveCsv } from "./reportingUtils";
import { availableExportDatasets, prepareReportingExport, type ReportingExportData, type ReportingExportDataset, type ReportingExportOptions } from "./reportingExportBuilder";

const DATASET_LABELS: Record<ReportingExportDataset, string> = {
  access: "Access events",
  journeys: "Programme journeys",
  visits: "Recorded range visits",
  "follow-up": "Member follow-up",
};

export function ReportingExportModal({
  onClose,
  data,
  canViewMemberVisits,
  loading,
  initialVisitHour,
  initialJourneyOrigin,
  initialFollowUpStatus,
}: {
  onClose: () => void;
  data: ReportingExportData;
  canViewMemberVisits: boolean;
  loading: Partial<Record<ReportingExportDataset, boolean>>;
  initialVisitHour: number | null;
  initialJourneyOrigin: string | null;
  initialFollowUpStatus: "all" | "attended" | "no-visit";
}) {
  const datasetRef = useRef<HTMLSelectElement>(null);
  const datasets = availableExportDatasets(canViewMemberVisits);
  const [options, setOptions] = useState<ReportingExportOptions>({
    dataset: data.access ? "access" : data.journeys ? "journeys" : data.visits && canViewMemberVisits ? "visits" : "access",
    accessScope: data.accessSelection ? "chart" : "all",
    accessSource: "all",
    journeyOrigin: initialJourneyOrigin === "beginners" || initialJourneyOrigin === "taster-session" || initialJourneyOrigin === "have-a-go" ? initialJourneyOrigin : "all",
    journeyConversion: "all",
    visitKind: "all",
    visitHour: initialVisitHour === null ? "" : String(initialVisitHour).padStart(2, "0"),
    followUpStatus: initialFollowUpStatus,
    followUpMemberType: "all",
  });
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const prepared = prepareReportingExport(data, options);
  const hours = [...new Set((data.visits?.rows ?? []).map((row) => row.time.slice(0, 2)))].sort();

  useEffect(() => {
    const previous = document.activeElement;
    datasetRef.current?.focus();
    return () => { if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key !== "Tab") return;
      const dialog = datasetRef.current?.closest('[role="dialog"]');
      const focusable = dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function changeOption<Key extends keyof ReportingExportOptions>(key: Key, value: ReportingExportOptions[Key]) {
    setOptions((current) => ({ ...current, [key]: value }));
    setError("");
  }

  async function download() {
    if (!prepared || prepared.count === 0 || isSaving) return;
    setError("");
    setIsSaving(true);
    try {
      await saveCsv(prepared.filename, prepared.csv);
      onClose();
    } catch (saveError) {
      if (!(saveError instanceof DOMException && saveError.name === "AbortError")) {
        setError(saveError instanceof Error ? saveError.message : "Unable to save the CSV file.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  return <Modal open onClose={onClose} title="Build a reporting export" contentClassName="reporting-export-modal">
    <div className="reporting-export-builder">
      <p>Choose the records to include. Exports use the current reporting dates and your access permissions.</p>
      <label>Dataset
        <select ref={datasetRef} value={options.dataset} onChange={(event) => changeOption("dataset", event.target.value as ReportingExportDataset)}>
          {datasets.map((dataset) => <option key={dataset} value={dataset}>{DATASET_LABELS[dataset]}</option>)}
        </select>
      </label>

      {options.dataset === "access" ? <div className="reporting-export-fields">
        <label>Source
          <select value={options.accessSource} onChange={(event) => changeOption("accessSource", event.target.value as ReportingExportOptions["accessSource"])}>
            <option value="all">All included sources</option>
            {data.access?.includeMembers ? <option value="member">Member access events</option> : null}
            {data.access?.includeGuests ? <option value="guest">Guest sign-ins</option> : null}
          </select>
        </label>
        <label>Scope
          <select value={options.accessScope} onChange={(event) => changeOption("accessScope", event.target.value as ReportingExportOptions["accessScope"])}>
            <option value="all">All selected dates</option>
            {data.accessSelection ? <option value="chart">Current chart selection</option> : null}
          </select>
        </label>
      </div> : null}

      {options.dataset === "journeys" ? <div className="reporting-export-fields">
        <label>Original programme
          <select value={options.journeyOrigin} onChange={(event) => changeOption("journeyOrigin", event.target.value as ReportingExportOptions["journeyOrigin"])}>
            <option value="all">All programmes</option>
            <option value="beginners">Beginners</option>
            <option value="taster-session">Taster</option>
            <option value="have-a-go">Have a Go</option>
          </select>
        </label>
        <label>Conversion
          <select value={options.journeyConversion} onChange={(event) => changeOption("journeyConversion", event.target.value as ReportingExportOptions["journeyConversion"])}>
            <option value="all">All participants</option>
            <option value="converted">Converted to member</option>
            <option value="not-converted">Not converted</option>
          </select>
        </label>
      </div> : null}

      {options.dataset === "visits" ? <div className="reporting-export-fields">
        <label>Visit type
          <select value={options.visitKind} onChange={(event) => changeOption("visitKind", event.target.value as ReportingExportOptions["visitKind"])}>
            <option value="all">Members and guests</option>
            <option value="member">Member visits</option>
            <option value="guest">Guest sign-ins</option>
          </select>
        </label>
        <label>Start hour (UTC)
          <select value={options.visitHour} onChange={(event) => changeOption("visitHour", event.target.value)}>
            <option value="">Any hour</option>
            {hours.map((hour) => <option key={hour} value={hour}>{hour}:00</option>)}
          </select>
        </label>
      </div> : null}

      {options.dataset === "follow-up" ? <div className="reporting-export-fields">
        <label>Recorded visit
          <select value={options.followUpStatus} onChange={(event) => changeOption("followUpStatus", event.target.value as ReportingExportOptions["followUpStatus"])}>
            <option value="all">All current members</option>
            <option value="attended">Recorded visit</option>
            <option value="no-visit">No recorded visit</option>
          </select>
        </label>
        <label>Member type
          <select value={options.followUpMemberType} onChange={(event) => changeOption("followUpMemberType", event.target.value as ReportingExportOptions["followUpMemberType"])}>
            <option value="all">All member types</option>
            <option value="member">Member</option>
            <option value="associate-member">Associate member</option>
          </select>
        </label>
        <p className="reporting-table-note">Uses the follow-up lookback currently selected below: last {data.followUp?.days ?? "…"} days.</p>
      </div> : null}

      <div className="reporting-export-preview" aria-live="polite">
        <strong>{prepared ? `${prepared.count.toLocaleString("en-GB")} rows` : loading[options.dataset] ? "Loading dataset…" : "Dataset unavailable"}</strong>
        {prepared ? <span>{prepared.description}</span> : null}
        {!prepared && !loading[options.dataset] ? <span>Check the current date and source filters or the report error above.</span> : null}
        {prepared?.count === 0 ? <span>No records match these choices.</span> : null}
      </div>
      {error ? <p className="usage-error" role="alert">{error}</p> : null}
      <div className="reporting-export-actions">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => void download()} disabled={!prepared || prepared.count === 0 || isSaving}>{isSaving ? "Saving…" : "Download CSV"}</Button>
      </div>
    </div>
  </Modal>;
}
