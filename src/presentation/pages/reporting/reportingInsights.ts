import type { AttendanceReport, AttendanceReportRow, MemberJourneyReport, RangeVisitReport } from "../../../api/reportingApi";

export type TrendBucket = { startDate: string; endDate: string; label: string; members: number; guests: number; total: number };
export type AccessSelection = { kind: "bucket"; startDate: string; endDate: string } | { kind: "weekday"; day: number } | null;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function weekdayIndex(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function filterAccessRows(rows: AttendanceReportRow[], selection: AccessSelection) {
  if (!selection) return rows;
  return rows.filter((row) => selection.kind === "bucket"
    ? row.date >= selection.startDate && row.date <= selection.endDate
    : weekdayIndex(row.date) === selection.day);
}

export function buildAccessInsights(report: AttendanceReport) {
  const bucketSize = report.daily.length > 62 ? 7 : 1;
  const trend: TrendBucket[] = [];
  for (let index = 0; index < report.daily.length; index += bucketSize) {
    const days = report.daily.slice(index, index + bucketSize);
    const first = days[0];
    const last = days[days.length - 1];
    trend.push({
      startDate: first.usageDate,
      endDate: last.usageDate,
      label: bucketSize === 1 ? first.usageDate.slice(5) : first.usageDate.slice(5) + "–" + last.usageDate.slice(5),
      members: days.reduce((total, day) => total + day.members, 0),
      guests: days.reduce((total, day) => total + day.guests, 0),
      total: days.reduce((total, day) => total + day.total, 0),
    });
  }
  const weekdays = WEEKDAYS.map((label, day) => ({ label, day, members: 0, guests: 0, total: 0 }));
  for (const row of report.daily) {
    const day = weekdays[weekdayIndex(row.usageDate)];
    day.members += row.members;
    day.guests += row.guests;
    day.total += row.total;
  }
  const memberUsernames = new Set(report.rows.filter((row) => row.type === "Member" && row.username)
    .map((row) => row.username.toLowerCase()));
  const busiestDay = report.daily.reduce<typeof report.daily[number] | null>((best, day) =>
    day.total > (best?.total ?? 0) ? day : best, null);
  const busiestWeekday = weekdays.reduce<typeof weekdays[number] | null>((best, day) =>
    day.total > (best?.total ?? 0) ? day : best, null);
  const methods = [
    { label: "RFID", method: "rfid", count: 0 },
    { label: "On-site mobile", method: "mobile-app", count: 0 },
    { label: "Mobile password", method: "password-mobile", count: 0 },
    { label: "Website password", method: "password", count: 0 },
  ];
  for (const row of report.rows) {
    if (row.type !== "Member") continue;
    const method = methods.find((item) => item.method === row.loginMethod);
    if (method) method.count += 1;
  }
  return { trend, weekdays, uniqueMemberLogins: memberUsernames.size, busiestDay, busiestWeekday, methods };
}

export function buildVisitInsights(report: RangeVisitReport) {
  const members = report.rows.filter((row) => row.loginMethod !== "guest");
  const guests = report.rows.length - members.length;
  const uniqueMembers = new Set(members.map((row) => row.username.toLowerCase())).size;
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, label: `${String(hour).padStart(2, "0")}:00`, members: 0, guests: 0 }));
  for (const row of report.rows) {
    const hour = Number(row.time.slice(0, 2));
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    hours[hour][row.loginMethod === "guest" ? "guests" : "members"] += 1;
  }
  return { members: members.length, guests, uniqueMembers, hours };
}

export function buildJourneyInsights(report: MemberJourneyReport) {
  const groups = [
    { key: "beginners", label: "Beginners", started: 0, converted: 0 },
    { key: "taster-session", label: "Taster", started: 0, converted: 0 },
    { key: "have-a-go", label: "Have a Go", started: 0, converted: 0 },
  ];
  for (const row of report.rows) {
    const group = groups.find((item) => item.key === row.originCourseType);
    if (!group) continue;
    group.started += 1;
    if (row.convertedToMember) group.converted += 1;
  }
  return groups;
}
