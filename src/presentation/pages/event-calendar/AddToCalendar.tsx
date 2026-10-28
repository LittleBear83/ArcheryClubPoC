import { useState } from "react";
import { Button } from "../../components/Button";
import { calendarTimes, createIcs, googleCalendarUrl, type CalendarExport } from "./calendarExport";

export function AddToCalendar({ item }: { item: CalendarExport | null }) {
  const [open, setOpen] = useState(false);
  if (!item || !calendarTimes(item)) return null;
  const googleUrl = googleCalendarUrl(item);

  function downloadIcs() {
    if (!item) return;
    const content = createIcs(item);
    if (!content) return;
    const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `selby-archery-${item.kind}-${String(item.id).replace(/[^a-z0-9_-]/gi, "-")}.ics`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return <div className="add-to-calendar">
    <Button type="button" variant="secondary" aria-expanded={open} onClick={() => setOpen(!open)}>
      Add to Calendar
    </Button>
    {open ? <div className="add-to-calendar-options">
      <Button type="button" variant="secondary" onClick={downloadIcs}>Apple Calendar / Download .ics</Button>
      {googleUrl ? <a className="app-button app-button--secondary app-button--md" href={googleUrl} target="_blank" rel="noopener noreferrer">Google Calendar</a> : null}
      <p>Open the downloaded .ics file with Apple Calendar or another calendar app. If your browser cannot open it directly, find it in Downloads.</p>
    </div> : null}
  </div>;
}
