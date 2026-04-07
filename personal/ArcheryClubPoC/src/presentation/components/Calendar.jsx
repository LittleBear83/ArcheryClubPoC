import React from "react";
import { formatDate } from "../../utils/dateTime";

function getMonthDays(year, month) {
  const first = new Date(year, month, 1);
  const days = [];
  const firstDayIndex = first.getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  let week = Array.from({ length: firstDayIndex }, () => null);

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
  itemsByDate = {},
  renderItem,
  renderDayMeta,
  selectedDate,
  onDayClick,
}) {
  const calendar = getMonthDays(year, month);

  return (
    <>
      <div className="calendar-toolbar">
        <button
          type="button"
          className="calendar-nav-button"
          onClick={onPrevMonth}
        >
          Previous
        </button>
        <strong className="calendar-toolbar-title">
          {formatDate(`${year}-${String(month + 1).padStart(2, "0")}-01`)}
        </strong>
        <button
          type="button"
          className="calendar-nav-button"
          onClick={onNextMonth}
        >
          Next
        </button>
      </div>

      <div className="calendar-table-wrap">
        <table className="calendar-table">
          <thead>
            <tr>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayLabel) => (
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
                  const items = dateKey ? itemsByDate[dateKey] : undefined;
                  const isSelected = selectedDate === dateKey;
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
