import React from "react";

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
    while (week.length < 7) week.push(null);
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
  selectedDate,
  onDayClick,
}) {
  const calendar = getMonthDays(year, month);

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "12px",
        }}
      >
        <button onClick={onPrevMonth}>◀</button>
        <strong>
          {new Date(year, month, 1).toLocaleString("default", {
            month: "long",
          })}{" "}
          {year}
        </strong>
        <button onClick={onNextMonth}>▶</button>
      </div>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginBottom: "16px",
        }}
      >
        <thead>
          <tr>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <th
                key={d}
                style={{
                  padding: "6px",
                  border: "1px solid #444",
                  background: "#111",
                }}
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {calendar.map((week, wi) => (
            <tr key={wi}>
              {week.map((day, di) => {
                const dateKey = day
                  ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                  : null;
                const items = dateKey ? itemsByDate[dateKey] : undefined;
                return (
                  <td
                    key={di}
                    onClick={() => {
                      if (dateKey && onDayClick) onDayClick(dateKey);
                    }}
                    style={{
                      minHeight: "68px",
                      verticalAlign: "top",
                      border:
                        selectedDate === dateKey
                          ? "2px solid #ffdd00"
                          : "1px solid #444",
                      padding: "4px",
                      background:
                        selectedDate === dateKey
                          ? "rgba(255, 221, 0, 0.3)"
                          : items?.length
                            ? "rgba(255,221,0,0.18)"
                            : "transparent",
                      cursor: dateKey ? "pointer" : "default",
                    }}
                  >
                    <div style={{ fontWeight: "700" }}>{day || ""}</div>
                    {items?.map((item) => (
                      <div
                        key={item.id}
                        style={{ fontSize: "0.76rem", color: "#ffdd00" }}
                      >
                        {renderItem
                          ? renderItem(item)
                          : item.title || item.topic || ""}
                      </div>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
