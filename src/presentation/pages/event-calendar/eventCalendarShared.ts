export const EVENT_TYPE_OPTIONS = [
  { value: "competition", label: "Competition", className: "event-type-competition" },
  { value: "social", label: "Social event", className: "event-type-social" },
  { value: "range-closed", label: "Range closed", className: "event-type-range-closed" },
];

export const VENUE_OPTIONS = [
  { value: "indoor", label: "Indoor" },
  { value: "outdoor", label: "Outdoor" },
  { value: "both", label: "Indoor and outdoor" },
];

export const eventQueryKeys = {
  list: (username: string) => ["events", username] as const,
};

export function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export function parseDateString(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day, 12, 0, 0);
}

function addDays(dateString: string, daysToAdd: number) {
  const nextDate = new Date(`${dateString}T12:00:00`);
  nextDate.setDate(nextDate.getDate() + daysToAdd);
  return nextDate.toISOString().slice(0, 10);
}

export function buildRecurringDates(
  startDate: string,
  repeatUntilDate: string,
  repeatPattern: "weekly" | "monthly",
) {
  if (!startDate || !repeatUntilDate || repeatUntilDate < startDate) {
    return [startDate].filter(Boolean);
  }

  const generatedDates = [startDate];

  if (repeatPattern === "weekly") {
    let nextDate = startDate;

    while (true) {
      nextDate = addDays(nextDate, 7);
      if (nextDate > repeatUntilDate) {
        break;
      }
      generatedDates.push(nextDate);
    }

    return generatedDates;
  }

  const start = new Date(`${startDate}T12:00:00`);
  const targetDay = start.getDate();
  let monthOffset = 1;

  while (monthOffset < 60) {
    const candidate = new Date(
      start.getFullYear(),
      start.getMonth() + monthOffset,
      targetDay,
      12,
      0,
      0,
    );
    monthOffset += 1;

    if (candidate.getDate() !== targetDay) {
      continue;
    }

    const candidateDate = candidate.toISOString().slice(0, 10);

    if (candidateDate > repeatUntilDate) {
      break;
    }

    generatedDates.push(candidateDate);
  }

  return generatedDates;
}

export function getVenueLabel(venue: string) {
  return (
    VENUE_OPTIONS.find((option) => option.value === venue)?.label ??
    "Indoor and outdoor"
  );
}
