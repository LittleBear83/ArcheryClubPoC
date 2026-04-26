function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function parseIsoDate(dateString) {
  if (!dateString) {
    return null;
  }

  return new Date(`${dateString}T12:00:00`);
}

function parseDateTime(dateInput) {
  if (!dateInput) {
    return null;
  }

  if (typeof dateInput === "string") {
    const normalizedInput = dateInput.includes(" ")
      ? dateInput.replace(" ", "T")
      : dateInput;

    return new Date(normalizedInput);
  }

  return new Date(dateInput);
}

export function formatDate(dateInput) {
  if (!dateInput) {
    return "";
  }

  const date =
    typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)
      ? parseIsoDate(dateInput)
      : new Date(dateInput);

  if (Number.isNaN(date?.getTime())) {
    return String(dateInput);
  }

  return [
    padDatePart(date.getDate()),
    padDatePart(date.getMonth() + 1),
    date.getFullYear(),
  ].join("/");
}

export function formatTime(dateInput) {
  if (!dateInput) {
    return "";
  }

  const date = new Date(dateInput);

  if (Number.isNaN(date.getTime())) {
    return String(dateInput);
  }

  return [
    padDatePart(date.getHours()),
    padDatePart(date.getMinutes()),
    padDatePart(date.getSeconds()),
  ].join(":");
}

export function formatClockTime(timeInput) {
  if (!timeInput) {
    return "";
  }

  const normalizedTime = /^\d{2}:\d{2}$/.test(timeInput)
    ? `${timeInput}:00`
    : timeInput;

  return formatTime(`1970-01-01T${normalizedTime}`);
}

export function formatDateTime(dateInput) {
  if (!dateInput) {
    return "";
  }

  const date = parseDateTime(dateInput);

  if (Number.isNaN(date?.getTime())) {
    return String(dateInput);
  }

  return `${formatDate(date)} ${formatTime(date)}`;
}

export function formatShortDateTime(dateInput) {
  return formatDateTime(dateInput);
}

export function formatHourLabel(hour) {
  const safeHour = Number(hour);

  if (!Number.isInteger(safeHour) || safeHour < 0 || safeHour > 23) {
    return String(hour);
  }

  return String(safeHour).padStart(2, "0");
}

export function formatDateRangeLabel(startDate, endDate) {
  if (!startDate || !endDate) {
    return "";
  }

  return `${formatDate(startDate)} to ${formatDate(endDate)}`;
}
