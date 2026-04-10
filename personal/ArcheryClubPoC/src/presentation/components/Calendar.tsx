import React, { useMemo } from "react";
import { formatDate } from "../../utils/dateTime";
import { Button } from "./Button";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type CalendarItem = {
  id: string | number;
  [key: string]: unknown;
};

type CalendarProps = {
  year: number;
  month: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday?: () => void;
  itemsByDate?: Record<string, CalendarItem[]>;
  renderItem?: (item: CalendarItem) => React.ReactNode;
  renderDayMeta?: (
    items: CalendarItem[],
    dateKey: string,
  ) => React.ReactNode;
  selectedDate: string | null;
  selectedDates?: string[];
  onDayClick?: (dateKey: string) => void;
};

function getMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const days: Array<Array<number | null>> = [];
  const firstDayIndex = first.getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  let week: Array<number | null> = Array.from(
    { length: firstDayIndex },
    () => null,
  );

  for (let day = 1; day <= totalDays; day += 1) {
    week.push(day);
    if (week.length === 7) {
      days.push(week);
      week = [];
    }
  }

  if (week.length > 0) {
    while (week.length < 7) {
      week.push(null);
    }
    days.push(week);
  }

  return days;
}

export function Calendar({
  year,
  month,
  onPrevMonth,
  onNextMonth,
  onToday,
  itemsByDate = {},
  renderItem,
  renderDayMeta,
  selectedDate,
  selectedDates = [],
  onDayClick,
}: CalendarProps) {
  const calendar = useMemo(() => getMonthDays(year, month), [month, year]);

  return (
    <>
      <div className="calendar-toolbar">
        <Button
          className="calendar-nav-button"
          onClick={onPrevMonth}
          variant="ghost"
        >
          Previous
        </Button>
        <div className="calendar-toolbar-center">
          <strong className="calendar-toolbar-title">
            {formatDate(`${year}-${String(month + 1).padStart(2, "0")}-01`)}
          </strong>
          {onToday ? (
            <Button
              className="calendar-nav-button"
              onClick={onToday}
              variant="ghost"
            >
              Today
            </Button>
          ) : null}
        </div>
        <Button
          className="calendar-nav-button"
          onClick={onNextMonth}
          variant="ghost"
        >
          Next
        </Button>
      </div>

      <div className="calendar-table-wrap">
        <table className="calendar-table">
          <thead>
            <tr>
              {DAY_LABELS.map((dayLabel) => (
                <th key={dayLabel}>{dayLabel}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calendar.map((week, weekIndex) => (
              <tr key={weekIndex}>
                {week.map((day, dayIndex) => {
                  const dateKey = day
                    ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                    : null;
                  const items = dateKey ? itemsByDate[dateKey] ?? [] : [];
                  const isSelected =
                    selectedDate === dateKey || Boolean(dateKey && selectedDates.includes(dateKey));
                  const hasItems = Boolean(items?.length);

                  return (
                    <td
                      key={dayIndex}
                      className={[
                        "calendar-day-cell",
                        isSelected ? "selected" : "",
                        hasItems ? "has-items" : "",
                        dateKey ? "is-clickable" : "is-empty",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => {
                        if (dateKey && onDayClick) {
                          onDayClick(dateKey);
                        }
                      }}
                    >
                      <div className="calendar-day-header">
                        <div className="calendar-day-number">{day || ""}</div>
                        {dateKey && hasItems && renderDayMeta
                          ? renderDayMeta(items, dateKey)
                          : null}
                      </div>
                      {renderItem
                        ? items?.map((item) => (
                            <div key={item.id} className="calendar-day-item">
                              {renderItem(item)}
                            </div>
                          ))
                        : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
