import type { ReactNode } from "react";
import { Calendar } from "../../components/Calendar";

type EventCalendarDesktopViewProps = {
  filterBar: ReactNode;
  summaryContent: ReactNode;
  year: number;
  month: number;
  selectedDate: string | null;
  scheduleItemsByDate: Record<string, Array<{ id: string | number }>>;
  onDayClick: (dateKey: string) => void;
  onToday: () => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  renderDayMeta: (
    items: Array<{ id: string | number }>,
    dateKey: string,
  ) => ReactNode;
  renderItem: (item: { id: string | number }) => ReactNode;
};

export function EventCalendarDesktopView({
  filterBar,
  summaryContent,
  year,
  month,
  selectedDate,
  scheduleItemsByDate,
  onDayClick,
  onToday,
  onPrevMonth,
  onNextMonth,
  renderDayMeta,
  renderItem,
}: EventCalendarDesktopViewProps) {
  return (
    <section className="event-calendar-layout event-calendar-layout-expanded">
      <div className="event-calendar-main">
        {filterBar}
        <Calendar
          year={year}
          month={month}
          selectedDate={selectedDate}
          onDayClick={onDayClick}
          onToday={onToday}
          onPrevMonth={onPrevMonth}
          onNextMonth={onNextMonth}
          itemsByDate={scheduleItemsByDate}
          renderDayMeta={renderDayMeta}
          renderItem={renderItem}
        />
      </div>

      <aside className="event-summary-panel">
        <h3>Calendar summary</h3>
        {summaryContent}
      </aside>
    </section>
  );
}
