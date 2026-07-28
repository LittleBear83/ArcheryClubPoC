export type HomeActivityListItem = {
  date: string;
  startTime?: string;
  endTime?: string;
};

function normalizeTimeForComparison(timeValue?: string) {
  if (!timeValue) {
    return "23:59:59";
  }

  if (/^\d{2}:\d{2}$/.test(timeValue)) {
    return `${timeValue}:00`;
  }

  return timeValue;
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toTimeString(date: Date) {
  return date.toISOString().slice(11, 19);
}

export function isHomeActivityCurrentOrUpcoming(
  item: HomeActivityListItem,
  now: Date = new Date(),
) {
  if (!item?.date) {
    return false;
  }

  const today = toDateString(now);

  if (item.date > today) {
    return true;
  }

  if (item.date < today) {
    return false;
  }

  const comparisonTime = normalizeTimeForComparison(item.endTime ?? item.startTime);

  return comparisonTime >= toTimeString(now);
}

export function filterHomeActivityCurrentOrUpcoming<TItem extends HomeActivityListItem>(
  items: TItem[],
  now: Date = new Date(),
) {
  return items.filter((item) => isHomeActivityCurrentOrUpcoming(item, now));
}
