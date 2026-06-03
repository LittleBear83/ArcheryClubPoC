import { formatClockTime, formatDate, formatDateRangeLabel } from "../../../utils/dateTime";
import type { AttendanceReport, AttendanceReportDailyRow } from "../../../api/reportingApi";

export function getUtcDateString(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
}

export function getTodayString() {
  return getUtcDateString(new Date());
}

export function getMonthStartString() {
  const today = new Date();

  return getUtcDateString(
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)),
  );
}

function escapeCsvValue(value: unknown) {
  const text = String(value ?? "");

  if (!/[",\r\n]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCsv(report: AttendanceReport) {
  const headers = [
    "Date",
    "Time",
    "Type",
    "Name",
    "Username",
    "Login Method",
    "Archery GB Number",
    "Attending With",
    "Attending With Username",
  ];
  const lines = report.rows.map((row) =>
    [
      formatDate(row.date),
      formatClockTime(row.time),
      row.type,
      row.name,
      row.username,
      row.loginMethod,
      row.archeryGbMembershipNumber,
      row.attendingWith,
      row.attendingWithUsername,
    ]
      .map(escapeCsvValue)
      .join(","),
  );

  return [headers.map(escapeCsvValue).join(","), ...lines].join("\r\n");
}

export async function saveCsv(filename: string, csv: string) {
  const pickerWindow = window as Window & {
    showSaveFilePicker?: (options: {
      suggestedName: string;
      types: Array<{
        description: string;
        accept: Record<string, string[]>;
      }>;
    }) => Promise<{
      createWritable: () => Promise<{
        write: (contents: Blob) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  };
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });

  if (pickerWindow.showSaveFilePicker) {
    const fileHandle = await pickerWindow.showSaveFilePicker({
      suggestedName: filename,
      types: [
        {
          description: "CSV file",
          accept: { "text/csv": [".csv"] },
        },
      ],
    });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function aggregateMonthDayRows(rows: AttendanceReportDailyRow[]) {
  const aggregatedRows = Array.from({ length: 31 }, (_, index) => ({
    usageDate: `day-${index + 1}`,
    label: String(index + 1),
    fullLabel: `Day ${index + 1}`,
    members: 0,
    guests: 0,
    total: 0,
  }));

  for (const row of rows) {
    const usageDate = typeof row.usageDate === "string" ? row.usageDate : "";
    const dayOfMonth = Number.parseInt(usageDate.slice(-2), 10);

    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      continue;
    }

    const aggregateRow = aggregatedRows[dayOfMonth - 1];
    aggregateRow.members += row.members ?? 0;
    aggregateRow.guests += row.guests ?? 0;
    aggregateRow.total += row.total ?? 0;
  }

  return aggregatedRows;
}

export function getRangeLabel(startDate: string, endDate: string) {
  return formatDateRangeLabel(startDate, endDate);
}
