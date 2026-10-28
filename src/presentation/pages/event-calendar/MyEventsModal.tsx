import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { formatClockTime, formatDate } from "../../../utils/dateTime";
import { AddToCalendar } from "./AddToCalendar";
import type { MyEvent } from "./myEvents";

export function MyEventsModal({ open, onClose, items, loading, error, onRetry }: {
  open: boolean;
  onClose: () => void;
  items: MyEvent[];
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  return <Modal open={open} onClose={onClose} title="My Events" contentClassName="my-events-modal">
    {loading ? <p role="status">Loading booked events…</p> : null}
    {error ? <div role="alert" className="my-events-error">
      <p>Booked events could not be refreshed. {error}</p>
      <Button type="button" variant="secondary" onClick={onRetry}>Try again</Button>
    </div> : null}
    {!loading && !error && items.length === 0 ? <p>You have no upcoming booked events.</p> : null}
    {!loading && items.length > 0 ? <ul className="my-events-list">
      {items.map(({ item }) => <li key={`${item.kind}-${item.id}`} className="my-events-item">
        <span className="my-events-type">{item.kind === "coaching" ? "Coaching Session" : "Club Event"}</span>
        <h4>{item.title}</h4>
        <p>{formatDate(item.date)} · {formatClockTime(item.startTime)} to {formatClockTime(item.endTime)}</p>
        <AddToCalendar item={item} />
      </li>)}
    </ul> : null}
  </Modal>;
}
