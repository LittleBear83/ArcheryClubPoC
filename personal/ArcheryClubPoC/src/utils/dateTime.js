const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const shortDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

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

  return dateFormatter.format(date);
}

export function formatTime(dateInput) {
  if (!dateInput) {
    return "";
  }

  const date = new Date(dateInput);

  if (Number.isNaN(date.getTime())) {
    return String(dateInput);
  }

  return timeFormatter.format(date);
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

  return dateTimeFormatter.format(date);
}

export function formatShortDateTime(dateInput) {
  if (!dateInput) {
    return "";
  }

  const date = parseDateTime(dateInput);

  if (Number.isNaN(date?.getTime())) {
    return String(dateInput);
  }

  return shortDateTimeFormatter.format(date).replace(",", "");
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
