export type HomeActivityListItem = {
  date: string;
  startTime?: string;
  endTime?: string;
  isCancelled?: boolean;
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
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toTimeString(date: Date) {
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map((part) => String(part).padStart(2, "0")).join(":");
}

export function isHomeActivityCurrentOrUpcoming(
  item: HomeActivityListItem,
  now: Date = new Date(),
) {
  if (!item?.date || item.isCancelled) {
    return false;
  }

  const today = toDateString(now);

  if (item.date > today) {
    return true;
  }

  if (item.date < today) {
    return false;
  }

  const comparisonTime = normalizeTimeForComparison(item.endTime);

  return comparisonTime >= toTimeString(now);
}

export function filterHomeActivityCurrentOrUpcoming<TItem extends HomeActivityListItem>(
  items: TItem[],
  now: Date = new Date(),
) {
  return items.filter((item) => isHomeActivityCurrentOrUpcoming(item, now));
}
