import { formatDate } from "../../../utils/dateTime";
import type { AnnouncementRecord } from "../../../api/announcementApi";
import type { LostArrowRecord, UserProfile } from "../../../types/app";

function getMembershipReminderMessage(currentUserProfile: UserProfile | null) {
  const membershipFeesDue = currentUserProfile?.meta?.membershipFeesDue;

  if (!membershipFeesDue) {
    return "";
  }

  const today = new Date();
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const dueDate = new Date(`${membershipFeesDue}T00:00:00Z`);

  if (Number.isNaN(dueDate.getTime())) {
    return "";
  }

  const dueUtc = Date.UTC(
    dueDate.getUTCFullYear(),
    dueDate.getUTCMonth(),
    dueDate.getUTCDate(),
  );
  const daysUntilDue = Math.floor((dueUtc - todayUtc) / 86400000);

  if (daysUntilDue < 0 || daysUntilDue > 30) {
    return "";
  }

  const formattedDueDate = formatDate(membershipFeesDue);

  if (daysUntilDue <= 15) {
    return `reminder: your membership fees are due on ${formattedDueDate},\nplease be aware that if you dont renew your membership will be susspended as well as your access to the range`;
  }

  return `reminder: your membership fees are due on ${formattedDueDate}`;
}

export function getHomeTickerMessage(currentUserProfile: UserProfile | null, beginnerDashboard: { showSafetyMessage: boolean } | null) {
  const membershipReminderMessage = getMembershipReminderMessage(currentUserProfile);

  if (membershipReminderMessage) {
    return membershipReminderMessage;
  }

  if (beginnerDashboard?.showSafetyMessage) {
    return "Please do not pick up any equipment until after the safety talk or until a coach asks you.";
  }

  return "";
}

export function getLostArrowNoticeMessages(notices: LostArrowRecord[]) {
  return notices.map((notice) => {
    const foundBy = notice.foundByName || notice.foundByUsername || "another member";
    const collectionLocation = notice.foundCollectionLocation
      ? ` Collected from: ${notice.foundCollectionLocation}.`
      : "";
    return `${notice.arrowColour} ${notice.arrowMaterial} arrow (${notice.arrowIdentifier}) found by ${foundBy} on ${formatDate(notice.dateFound || notice.dateLost)}.${collectionLocation}`;
  });
}

function getAnnouncementSeverityLevel(severity: AnnouncementRecord["severity"]) {
  switch (severity) {
    case "urgent_important":
      return 3;
    case "urgent":
      return 2;
    default:
      return 1;
  }
}

function getAnnouncementTickerTone(announcement: AnnouncementRecord) {
  const baseLevel = getAnnouncementSeverityLevel(announcement.severity);

  if (!announcement.escalateSeverity) {
    return baseLevel === 1 ? "green" : baseLevel === 2 ? "yellow" : "red";
  }

  const startTime = Date.parse(`${announcement.activeFromDate}T00:00:00Z`);
  const endTime = Date.parse(`${announcement.activeTillDate}T23:59:59Z`);
  const totalDuration = endTime - startTime;

  if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
    return baseLevel === 1 ? "green" : baseLevel === 2 ? "yellow" : "red";
  }

  const remainingRatio = (endTime - Date.now()) / totalDuration;

  if (announcement.severity === "information") {
    if (remainingRatio <= 0.2) {
      return "red";
    }

    if (remainingRatio <= 0.5) {
      return "yellow";
    }

    return "green";
  }

  if (announcement.severity === "urgent") {
    return remainingRatio <= 0.5 ? "red" : "yellow";
  }

  return remainingRatio <= 0.3 ? "red" : "yellow";
}

export function getAnnouncementTickerState(announcements: AnnouncementRecord[]) {
  if (announcements.length === 0) {
    return [];
  }

  const groupedAnnouncements = new Map<
    "green" | "yellow" | "red",
    AnnouncementRecord[]
  >();

  for (const announcement of announcements) {
    const tone = getAnnouncementTickerTone(announcement);
    const existingGroup = groupedAnnouncements.get(tone) ?? [];
    existingGroup.push(announcement);
    groupedAnnouncements.set(tone, existingGroup);
  }

  return (["red", "yellow", "green"] as const)
    .filter((tone) => groupedAnnouncements.has(tone))
    .map((tone) => ({
      tone,
      message: (groupedAnnouncements.get(tone) ?? [])
        .map((announcement) => announcement.message)
        .join("   |   "),
    }));
}

export function buildAnnouncementTickerClassName({
  isMobile,
  tone,
}: {
  isMobile: boolean;
  tone: "green" | "yellow" | "red";
}) {
  return [
    "announcement-ticker",
    `announcement-ticker--${tone}`,
    isMobile ? "announcement-ticker--mobile" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildAnnouncementTickerTrackClassName(isMobile: boolean) {
  return [
    "announcement-ticker-track",
    isMobile ? "announcement-ticker-track--mobile" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
