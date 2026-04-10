import { formatDate } from "../../utils/dateTime";

export function SummaryDate({ date }: { date: string }) {
  return (
    <p className="event-summary-date">
      <strong>{formatDate(date)}</strong>
    </p>
  );
}
