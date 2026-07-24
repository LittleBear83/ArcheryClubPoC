import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, Routes, Route, Navigate } from "react-router-dom";
import { SideDrawer } from "../components/SideDrawer";
import { Button } from "../components/Button";
import archeryBanner from "../../assets/archery_banner.svg";
import selbyLogo from "../../assets/selby_Archery_Logo.svg";
import { HomeSection } from "./HomeSection";
import { LostAndFoundPage } from "./LostAndFoundPage";
import { FeedbackFormPage } from "./FeedbackFormPage";
import { EventCalendarPage } from "./EventCalendarPage";
import { TournamentsPage } from "./TournamentsPage";
import { RangeUsagePage } from "./RangeUsagePage";
import { PlaceholderPage } from "./PlaceholderPage";
import { ProfilePage } from "./ProfilePage";
import { UserCreationPage } from "./UserCreationPage";
import { EquipmentPage } from "./EquipmentPage";
import { BeginnersCoursesPage } from "./BeginnersCoursesPage";
import { HaveAGoSessionsPage } from "./HaveAGoSessionsPage";
import { CommitteeOrgChartPage } from "./CommitteeOrgChartPage";
import { CommitteeAdminPage } from "./CommitteeAdminPage";
import { RolePermissionsPage } from "./RolePermissionsPage";
import { ReportingPage } from "./ReportingPage";
import { ApprovalsPage } from "./ApprovalsPage";
import { GeneralInfoPage } from "./GeneralInfoPage";
import { GeneralInfoAdminPage } from "./GeneralInfoAdminPage";
import { RecordsPage } from "./RecordsPage";
import { OutdoorTablePage } from "./OutdoorTablePage";
import { AnnouncementsPage } from "./AnnouncementsPage";
import { AuditLogPage } from "./AuditLogPage";
import { RangeRulesAdminPage } from "./RangeRulesAdminPage";
import { RangeRulesPage } from "./RangeRulesPage";
import { formatDate } from "../../utils/dateTime";
import {
  getMyBeginnerDashboard,
  listMyBeginnerCoachingAssignments,
  listMyCoachingBookings,
  listMyEventBookings,
  listMyTournamentReminders,
} from "../../api/homeApi";
import {
  bookOnSiteWithMobileApp,
  listRangeMembers,
} from "../../api/memberApi";
import {
  listActiveAnnouncements,
  type AnnouncementRecord,
} from "../../api/announcementApi";
import { listTournaments } from "../../api/tournamentApi";
import { listMyLostArrowNotices, listOpenLostArrows } from "../../api/lostArrowApi";
import { useTheme } from "../../theme/useTheme";
import type { HomeMember, LostArrowRecord, UserProfile } from "../../types/app";
import type { AppDependencies } from "../../bootstrap/createAppDependencies";
import { useMobileGeofence } from "../hooks/useMobileGeofence";
import { useIsMobile } from "../hooks/useIsMobile";
import {
  formatMemberDisplayName,
  formatRangeMemberDisplayName,
  hasPermission,
  normalizeUserProfile,
} from "../../utils/userProfile";

type HomePageProps = {
  currentUserProfile: UserProfile | null;
  onCurrentUserProfileUpdate: (userProfile: unknown) => void;
  onLogout: (message?: string) => void;
  memberProfileCrud: Pick<
    AppDependencies,
    | "getMemberProfilePageDataUseCase"
    | "getMemberProfileOptionsUseCase"
    | "createMemberProfileUseCase"
    | "updateMemberProfileUseCase"
    | "deleteMemberProfileUseCase"
    | "assignMemberRfidTagUseCase"
    | "returnLoanBowUseCase"
    | "signOffMemberDistanceUseCase"
    | "getUserProfileUseCase"
  >;
  roleCrud: Pick<
    AppDependencies,
    | "getRolesSnapshotUseCase"
    | "createRoleUseCase"
    | "updateRoleUseCase"
    | "deleteRoleUseCase"
  >;
  tournamentCrud: Pick<
    AppDependencies,
    | "listTournamentsUseCase"
    | "createTournamentUseCase"
    | "updateTournamentUseCase"
    | "deleteTournamentUseCase"
    | "registerForTournamentUseCase"
    | "withdrawFromTournamentUseCase"
    | "submitTournamentScoreUseCase"
  >;
  equipmentCrud: Pick<
    AppDependencies,
    | "getEquipmentDashboardUseCase"
    | "addEquipmentItemUseCase"
    | "decommissionEquipmentItemUseCase"
    | "assignEquipmentItemUseCase"
    | "returnEquipmentItemUseCase"
    | "updateEquipmentStorageUseCase"
  >;
};
type HomeEvent = {
  id: string | number;
  date: string;
  title: string;
  startTime?: string;
};
type TournamentReminder = {
  id: string | number;
  date: string;
  title: string;
};
type TournamentSummary = {
  name: string;
  registrationCount?: number;
  registrationWindow: {
    endDate: string;
    isClosed?: boolean;
  };
};
type BeginnerHomeDashboard = {
  firstLessonDate: string;
  showSafetyMessage: boolean;
  lessonToday: {
    lessonNumber: number;
    date: string;
    startTime: string;
    endTime: string;
  } | null;
  coaches: Array<{ username: string; fullName: string }>;
  equipment: Array<{ id: string | number; typeLabel: string; reference: string }>;
} | null;
type BeginnerCoachAssignment = {
  id: string | number;
  courseId: string | number;
  lessonNumber: number;
  date: string;
  startTime: string;
  endTime: string;
  coordinatorName: string;
  beginnerCount: number;
};
type LostArrowNotice = LostArrowRecord;
type LostArrowToast = {
  id: string;
  message: string;
  targetPath: string;
};

const homeQueryKeys = {
  rangeMembers: () => ["range-members"] as const,
  activity: (username: string) => ["home-activity", username] as const,
  adminWarnings: (username: string) =>
    ["admin-tournament-warnings", username] as const,
  activeAnnouncements: (username: string) =>
    ["active-announcements", username] as const,
  lostArrowNotices: (username: string) =>
    ["my-lost-arrow-notices", username] as const,
};

const TOURNAMENT_WARNING_CLOSE_WINDOW_DAYS = 2;
const MOBILE_ON_SITE_FEATURE_TARGET = {
  latitude: 53.778213317518684,
  longitude: -1.0966694674728845,
  radiusMeters: 50,
} as const;
const LOST_ARROW_SEEN_TOASTS_STORAGE_KEY = "archeryclubpoc-seen-lost-arrow-toasts";

const pageTitleMap = {
  home: "Home",
  profile: "Profile",
  "user-creation": "Member Creation",
  "role-permissions": "Roles & Permissions",
  reporting: "Reporting",
  "audit-log": "Audit Log",
  approvals: "Approvals",
  equipment: "Equipment",
  "beginners-courses": "Beginners Courses",
  "have-a-go-sessions": "Have a Go Sessions",
  "event-calendar": "Calendar",
  "range-usage": "Range Usage",
  "feedback-form": "Suggestion Box",
  tournaments: "Tournaments",
  records: "Records",
  "outdoor-table": "Outdoor Table",
  "range-rules": "Range Rules",
  "range-rules-admin": "Range Rules Admin",
  "general-info-admin": "General Info Admin",
  "tournament-setup": "Tournament Setup",
  "committee-org-chart": "Committee Org Chart",
  "committee-admin": "Committee Admin",
  announcements: "Announcements",
  "general-info": "General Info",
  "lost-and-found": "Lost and Found",
};

const pathToPageId = {
  "/": "home",
  "/profile": "profile",
  "/user-creation": "user-creation",
  "/role-permissions": "role-permissions",
  "/reporting": "reporting",
  "/audit-log": "audit-log",
  "/approvals": "approvals",
  "/equipment": "equipment",
  "/beginners-courses": "beginners-courses",
  "/have-a-go-sessions": "have-a-go-sessions",
  "/event-calendar": "event-calendar",
  "/range-usage": "range-usage",
  "/feedback-form": "feedback-form",
  "/ideas-form": "feedback-form",
  "/tournaments": "tournaments",
  "/records": "records",
  "/outdoor-table": "outdoor-table",
  "/range-rules": "range-rules",
  "/range-rules-admin": "range-rules-admin",
  "/general-info-admin": "general-info-admin",
  "/tournament-setup": "tournament-setup",
  "/committee-org-chart": "committee-org-chart",
  "/committee-admin": "committee-admin",
  "/announcements": "announcements",
  "/general-info": "general-info",
  "/lost-and-found": "lost-and-found",
};

const pageIdToPath = Object.fromEntries(
  Object.entries(pathToPageId).map(([path, id]) => [id, path]),
);

// The main shell maps URLs to drawer page identifiers so navigation stays
// bookmarkable while the side drawer can work with simple page IDs.
function getMembershipReminderMessage(currentUserProfile) {
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

function getHomeTickerMessage(currentUserProfile, beginnerDashboard) {
  const membershipReminderMessage = getMembershipReminderMessage(currentUserProfile);

  if (membershipReminderMessage) {
    return membershipReminderMessage;
  }

  if (beginnerDashboard?.showSafetyMessage) {
    return "Please do not pick up any equipment until after the safety talk or until a coach asks you.";
  }

  return "";
}

function getLostArrowNoticeMessages(notices: LostArrowNotice[]) {
  return notices.map((notice) => {
    const foundBy = notice.foundByName || notice.foundByUsername || "another member";
    return `${notice.arrowColour} ${notice.arrowMaterial} arrow (${notice.arrowIdentifier}) found by ${foundBy} on ${formatDate(notice.dateFound || notice.dateLost)}`;
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

function getAnnouncementTickerState(announcements: AnnouncementRecord[]) {
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

function buildAnnouncementTickerClassName({
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

function buildAnnouncementTickerTrackClassName(isMobile: boolean) {
  return [
    "announcement-ticker-track",
    isMobile ? "announcement-ticker-track--mobile" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function getHomeWelcomeName(currentUserProfile: UserProfile | null) {
  return (
    formatRangeMemberDisplayName(currentUserProfile) ||
    formatMemberDisplayName(currentUserProfile)
  );
}

function readSeenLostArrowToastIds(username: string) {
  if (!username || typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const rawValue = window.localStorage.getItem(LOST_ARROW_SEEN_TOASTS_STORAGE_KEY);
    const parsedValue = rawValue ? JSON.parse(rawValue) : {};
    const storedIds = Array.isArray(parsedValue?.[username]) ? parsedValue[username] : [];

    return new Set(
      storedIds.filter((value: unknown) => typeof value === "string"),
    );
  } catch {
    return new Set<string>();
  }
}

function writeSeenLostArrowToastIds(username: string, seenIds: Set<string>) {
  if (!username || typeof window === "undefined") {
    return;
  }

  try {
    const rawValue = window.localStorage.getItem(LOST_ARROW_SEEN_TOASTS_STORAGE_KEY);
    const parsedValue = rawValue ? JSON.parse(rawValue) : {};

    window.localStorage.setItem(
      LOST_ARROW_SEEN_TOASTS_STORAGE_KEY,
      JSON.stringify({
        ...parsedValue,
        [username]: Array.from(seenIds),
      }),
    );
  } catch {
    return;
  }
}

async function fetchRangeMembers(): Promise<HomeMember[]> {
  const result = await listRangeMembers();

  return (result.members ?? []).map((member) => normalizeUserProfile(member));
}

async function fetchHomeActivity(username: string): Promise<{
  signedUpEvents: HomeEvent[];
  tournamentReminders: TournamentReminder[];
  beginnerDashboard: BeginnerHomeDashboard;
  beginnerCoachAssignments: BeginnerCoachAssignment[];
}> {
  // The home screen is made from several small dashboard APIs; fetching them in
  // parallel keeps the landing page responsive after sign-in.
  const [coachingResult, eventResult, reminderResult, beginnerResult, coachAssignmentsResult] =
    await Promise.all([
    listMyCoachingBookings<HomeEvent>(username),
    listMyEventBookings<HomeEvent>(username),
    listMyTournamentReminders<TournamentReminder>(username),
    getMyBeginnerDashboard<BeginnerHomeDashboard>(username),
    listMyBeginnerCoachingAssignments<BeginnerCoachAssignment>(username),
  ]);

  return {
    signedUpEvents: [...(coachingResult.bookings ?? []), ...(eventResult.bookings ?? [])]
      .sort((left, right) => {
        const byDate = left.date.localeCompare(right.date);
        return byDate !== 0
          ? byDate
          : (left.startTime ?? "").localeCompare(right.startTime ?? "");
      }),
    tournamentReminders: reminderResult.reminders ?? [],
    beginnerDashboard: beginnerResult.dashboard ?? null,
    beginnerCoachAssignments: coachAssignmentsResult.lessons ?? [],
  };
}

async function fetchAdminTournamentWarnings(username: string): Promise<string[]> {
  const result = await listTournaments<TournamentSummary>(username);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (result.tournaments ?? []).flatMap((tournament) => {
    const competitorCount = tournament.registrationCount ?? 0;

    if (competitorCount === 0 || competitorCount % 2 === 0) {
      return [];
    }

    const closingDate = new Date(tournament.registrationWindow.endDate);
    closingDate.setHours(0, 0, 0, 0);

    const diffInDays = Math.floor(
      (closingDate.getTime() - today.getTime()) / 86400000,
    );

    if (
      tournament.registrationWindow.isClosed ||
      diffInDays < 0 ||
      diffInDays > TOURNAMENT_WARNING_CLOSE_WINDOW_DAYS
    ) {
      return [];
    }

    return [
      `${tournament.name} registration closes on ${formatDate(tournament.registrationWindow.endDate)} with an uneven field of ${competitorCount} competing members.`,
    ];
  });
}

async function fetchActiveAnnouncements(actor: UserProfile | null) {
  const result = await listActiveAnnouncements(actor);

  return result.announcements ?? [];
}

async function fetchLostArrowNotices(actor: UserProfile | null) {
  const result = await listMyLostArrowNotices(actor);

  return result.notices ?? [];
}

export function HomePage({
  currentUserProfile,
  onCurrentUserProfileUpdate,
  onLogout,
  memberProfileCrud,
  roleCrud,
  tournamentCrud,
  equipmentCrud,
}: HomePageProps) {
  const { theme, themeName, toggleTheme } = useTheme();
  const isMobile = useIsMobile();
  const mobileOnSiteFeature = useMobileGeofence({
    targetLatitude: MOBILE_ON_SITE_FEATURE_TARGET.latitude,
    targetLongitude: MOBILE_ON_SITE_FEATURE_TARGET.longitude,
    radiusMeters: MOBILE_ON_SITE_FEATURE_TARGET.radiusMeters,
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManageTournaments = hasPermission(
    currentUserProfile,
    "manage_tournaments",
  );
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const isBeginnerMember = currentUserProfile?.membership?.role === "beginner";
  const activePage = pathToPageId[location.pathname] || "home";
  const { data: rangeMembers = [] } = useQuery({
    queryKey: homeQueryKeys.rangeMembers(),
    queryFn: fetchRangeMembers,
  });

  const { data: homeActivity } = useQuery({
    queryKey: homeQueryKeys.activity(actorUsername),
    queryFn: () => fetchHomeActivity(actorUsername),
    enabled: Boolean(actorUsername),
  });

  const { data: adminTournamentWarnings = [] } = useQuery({
    queryKey: homeQueryKeys.adminWarnings(actorUsername),
    queryFn: () => fetchAdminTournamentWarnings(actorUsername),
    enabled: canManageTournaments && Boolean(actorUsername),
  });
  const { data: activeAnnouncements = [] } = useQuery({
    queryKey: homeQueryKeys.activeAnnouncements(actorUsername),
    queryFn: () => fetchActiveAnnouncements(currentUserProfile),
    enabled: Boolean(actorUsername),
  });
  const { data: lostArrowNotices = [] } = useQuery({
    queryKey: homeQueryKeys.lostArrowNotices(actorUsername),
    queryFn: () => fetchLostArrowNotices(currentUserProfile),
    enabled: Boolean(actorUsername),
  });
  const { data: openLostArrowsResult } = useQuery({
    queryKey: ["lost-arrows", actorUsername],
    queryFn: () => listOpenLostArrows(currentUserProfile),
    enabled: Boolean(actorUsername),
  });

  const signedUpEvents = homeActivity?.signedUpEvents ?? [];
  const tournamentReminders = homeActivity?.tournamentReminders ?? [];
  const beginnerDashboard = homeActivity?.beginnerDashboard ?? null;
  const beginnerCoachAssignments = homeActivity?.beginnerCoachAssignments ?? [];
  const homeTickerMessage = useMemo(
    () => getHomeTickerMessage(currentUserProfile, beginnerDashboard),
    [beginnerDashboard, currentUserProfile],
  );
  const announcementTicker = useMemo(
    () => getAnnouncementTickerState(activeAnnouncements),
    [activeAnnouncements],
  );
  const lostArrowNoticeMessages = useMemo(
    () => getLostArrowNoticeMessages(lostArrowNotices),
    [lostArrowNotices],
  );
  const openLostArrows = useMemo(
    () => openLostArrowsResult?.lostArrows ?? [],
    [openLostArrowsResult?.lostArrows],
  );
  const [mobileOnSiteStatus, setMobileOnSiteStatus] = useState("");
  const [mobileOnSiteError, setMobileOnSiteError] = useState("");
  const [isBookingOnSite, setIsBookingOnSite] = useState(false);
  const [lostArrowToasts, setLostArrowToasts] = useState<LostArrowToast[]>([]);
  const previousOpenLostArrowIdsRef = useRef<number[] | null>(null);
  const seenLostArrowToastIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!actorUsername) {
      setLostArrowToasts([]);
      previousOpenLostArrowIdsRef.current = null;
      seenLostArrowToastIdsRef.current = new Set();
      return undefined;
    }

    seenLostArrowToastIdsRef.current = readSeenLostArrowToastIds(actorUsername);
  }, [actorUsername]);

  useEffect(() => {
    if (!actorUsername) {
      previousOpenLostArrowIdsRef.current = null;
      return;
    }

    const previousIds = previousOpenLostArrowIdsRef.current;
    const currentIds = openLostArrows.map((arrow) => arrow.id);

    if (!previousIds) {
      previousOpenLostArrowIdsRef.current = currentIds;

      if (openLostArrows.length > 0) {
        const latestLostArrow = openLostArrows[0];
        const initialToastId = `lost-arrow-${latestLostArrow.id}`;

        if (!seenLostArrowToastIdsRef.current.has(initialToastId)) {
          seenLostArrowToastIdsRef.current.add(initialToastId);
          writeSeenLostArrowToastIds(actorUsername, seenLostArrowToastIdsRef.current);
          setLostArrowToasts([
            {
              id: initialToastId,
              message: `${latestLostArrow.archerName || latestLostArrow.archerUsername} currently has a lost ${latestLostArrow.arrowColour} ${latestLostArrow.arrowMaterial} arrow recorded.`,
              targetPath: "/lost-and-found",
            },
          ]);
        }
      }

      return;
    }

    const previousIdSet = new Set(previousIds);
    const newLostArrows = openLostArrows.filter((arrow) => !previousIdSet.has(arrow.id));

    previousOpenLostArrowIdsRef.current = currentIds;

    if (newLostArrows.length === 0) {
      return;
    }

    setLostArrowToasts((current) => {
      const nextToasts = newLostArrows
        .map((arrow) => ({
          id: `lost-arrow-${arrow.id}`,
          message: `${arrow.archerName || arrow.archerUsername} reported a lost ${arrow.arrowColour} ${arrow.arrowMaterial} arrow.`,
          targetPath: "/lost-and-found",
        }))
        .filter((toast) => !seenLostArrowToastIdsRef.current.has(toast.id));

      if (nextToasts.length === 0) {
        return current;
      }

      for (const toast of nextToasts) {
        seenLostArrowToastIdsRef.current.add(toast.id);
      }

      writeSeenLostArrowToastIds(actorUsername, seenLostArrowToastIdsRef.current);

      const dedupedCurrent = current.filter(
        (toast) => !nextToasts.some((nextToast) => nextToast.id === toast.id),
      );

      return [...dedupedCurrent, ...nextToasts].slice(-3);
    });
  }, [actorUsername, openLostArrows]);

  useEffect(() => {
    if (lostArrowToasts.length === 0) {
      return undefined;
    }

    const timerIds = lostArrowToasts.map((toast) =>
      setTimeout(() => {
        setLostArrowToasts((current) => current.filter((item) => item.id !== toast.id));
      }, 8000),
    );

    return () => {
      for (const timerId of timerIds) {
        clearTimeout(timerId);
      }
    };
  }, [lostArrowToasts]);

  const handleDismissLostArrowToast = (toastId: string) => {
    setLostArrowToasts((current) => current.filter((toast) => toast.id !== toastId));
  };

  const handleNavigate = (pageId) => {
    const target = pageIdToPath[pageId] || "/";
    navigate(target);
  };

  const handleBookOnSite = async () => {
    setIsBookingOnSite(true);
    setMobileOnSiteError("");
    setMobileOnSiteStatus("");

    try {
      const result = await bookOnSiteWithMobileApp();

      setMobileOnSiteStatus(
        result.message ?? "Your on-site mobile check-in has been recorded.",
      );
      await queryClient.invalidateQueries({
        queryKey: homeQueryKeys.rangeMembers(),
      });
    } catch (error) {
      setMobileOnSiteError(
        error instanceof Error
          ? error.message
          : "We could not record your on-site mobile check-in.",
      );
    } finally {
      setIsBookingOnSite(false);
    }
  };

  return (
    <>
      {announcementTicker.length > 0 ? (
        <div className="announcement-ticker-stack">
          {announcementTicker.map((tickerRow) => (
            <div
              key={`${tickerRow.tone}-${tickerRow.message}`}
              className={buildAnnouncementTickerClassName({
                isMobile,
                tone: tickerRow.tone,
              })}
              role="status"
              aria-live="polite"
            >
              <div className={buildAnnouncementTickerTrackClassName(isMobile)}>
                <span>{tickerRow.message}</span>
                {isMobile ? null : (
                  <span aria-hidden="true">{tickerRow.message}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {homeTickerMessage ? (
        <div
          className={[
            "membership-reminder-ticker",
            isMobile ? "membership-reminder-ticker--mobile" : "",
          ].filter(Boolean).join(" ")}
          role="status"
          aria-live="polite"
        >
          <div
            className={[
              "membership-reminder-ticker-track",
              isMobile ? "membership-reminder-ticker-track--mobile" : "",
            ].filter(Boolean).join(" ")}
          >
            <span>{homeTickerMessage}</span>
          </div>
        </div>
      ) : null}

      {lostArrowNoticeMessages.length > 0 ? (
        <div
          className={[
            "lost-arrow-ticker",
            isMobile ? "lost-arrow-ticker--mobile" : "",
          ].filter(Boolean).join(" ")}
          role="status"
          aria-live="polite"
        >
          <div
            className={[
              "lost-arrow-ticker-track",
              isMobile ? "lost-arrow-ticker-track--mobile" : "",
            ].filter(Boolean).join(" ")}
          >
            <span>{lostArrowNoticeMessages.join("   |   ")}</span>
            {isMobile ? null : (
              <span aria-hidden="true">{lostArrowNoticeMessages.join("   |   ")}</span>
            )}
          </div>
        </div>
      ) : null}

      {adminTournamentWarnings.length > 0 ? (
        <div
          className={[
            "admin-warning-ticker",
            isMobile ? "admin-warning-ticker--mobile" : "",
          ].filter(Boolean).join(" ")}
          role="status"
          aria-live="polite"
        >
          <div
            className={[
              "admin-warning-ticker-track",
              isMobile ? "admin-warning-ticker-track--mobile" : "",
            ].filter(Boolean).join(" ")}
          >
            <span>
              {adminTournamentWarnings.join("   |   ")}
            </span>
            {isMobile ? null : (
              <span aria-hidden="true">
                {adminTournamentWarnings.join("   |   ")}
              </span>
            )}
          </div>
        </div>
      ) : null}

      <SideDrawer
        currentUserProfile={currentUserProfile}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        selectedPage={activePage}
        onLogout={onLogout}
        onSelectPage={(pageId) => {
          handleNavigate(pageId);
          setDrawerOpen(false);
        }}
      />

      <section className="target-arch-banner">
        <img
          src={archeryBanner}
          alt="Archery banner"
          className="archery-banner-img"
        />
        <Button
          className="menu-button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          variant="unstyled"
        >
          <img
            src={selbyLogo}
            alt="Selby Archers Logo"
            className="menu-button-logo"
          />
          <span className="menu-button-label">Menu</span>
        </Button>
        <div className="heading-wrap">
          <div className="page-heading-group">
            <h1>{pageTitleMap[activePage] || "Archery Club"}</h1>
          </div>
        </div>
      </section>

      <div className="page-toolbar">
        <div className="page-toolbar-content">
          <Button
            type="button"
            className="theme-toggle-button"
            onClick={toggleTheme}
            aria-label={`Switch theme. Current theme is ${theme.label}.`}
            title={`Theme: ${theme.label}`}
            variant="ghost"
          >
            <span className="theme-toggle-label">Theme</span>
            <strong>{themeName === "archery" ? "Gold" : "Dawn"}</strong>
          </Button>
        </div>
      </div>

      <main
        className={[
          "page-shell",
          activePage === "role-permissions" ||
          activePage === "reporting" ||
          activePage === "audit-log" ||
          activePage === "announcements"
            ? "page-shell--wide"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <section className="page-content">
          {activePage === "home" ? (
            <h1 className="welcome-message">
              Welcome {getHomeWelcomeName(currentUserProfile)}
            </h1>
          ) : null}

          <Routes>
            <Route
              path="/profile"
              element={
                <ProfilePage
                  currentUserProfile={currentUserProfile}
                  onCurrentUserProfileUpdate={onCurrentUserProfileUpdate}
                  memberProfileCrud={memberProfileCrud}
                />
              }
            />
            <Route
              path="/user-creation"
              element={
                <UserCreationPage
                  currentUserProfile={currentUserProfile}
                  memberProfileCrud={memberProfileCrud}
                />
              }
            />
            <Route
              path="/role-permissions"
              element={
                <RolePermissionsPage
                  currentUserProfile={currentUserProfile}
                  onCurrentUserProfileUpdate={onCurrentUserProfileUpdate}
                  memberProfileCrud={memberProfileCrud}
                  roleCrud={roleCrud}
                />
              }
            />
            <Route
              path="/reporting"
              element={<ReportingPage currentUserProfile={currentUserProfile} />}
            />
            <Route
              path="/audit-log"
              element={<AuditLogPage currentUserProfile={currentUserProfile} />}
            />
            <Route
              path="/approvals"
              element={<ApprovalsPage currentUserProfile={currentUserProfile} />}
            />
            <Route
              path="/equipment"
              element={
                <EquipmentPage
                  currentUserProfile={currentUserProfile}
                  equipmentCrud={equipmentCrud}
                />
              }
            />
            <Route
              path="/beginners-courses"
              element={
                <BeginnersCoursesPage currentUserProfile={currentUserProfile} />
              }
            />
            <Route
              path="/have-a-go-sessions"
              element={
                <HaveAGoSessionsPage currentUserProfile={currentUserProfile} />
              }
            />
            <Route
              path="/"
              element={
                <HomeSection
                  members={rangeMembers}
                  signedUpEvents={signedUpEvents}
                  tournamentReminders={tournamentReminders}
                  beginnerDashboard={beginnerDashboard}
                  beginnerCoachAssignments={beginnerCoachAssignments}
                  mobileOnSiteFeature={{
                    ...mobileOnSiteFeature,
                    error: mobileOnSiteError || mobileOnSiteFeature.error,
                    isBookingOnSite,
                    onBookOnSite: handleBookOnSite,
                    statusMessage: mobileOnSiteStatus,
                  }}
                  hideEventPanels={isBeginnerMember}
                  lostArrows={openLostArrows}
                  onOpenLostAndFound={() => navigate("/lost-and-found")}
                />
              }
            />
            <Route
              path="/event-calendar"
              element={
                <EventCalendarPage
                  currentUserProfile={currentUserProfile}
                  onBookingsChanged={() =>
                    queryClient.invalidateQueries({
                      queryKey: homeQueryKeys.activity(actorUsername),
                    })
                  }
                />
              }
            />
            <Route
              path="/range-usage"
              element={<RangeUsagePage currentUserProfile={currentUserProfile} />}
            />
            <Route
              path="/coaching-calendar"
              element={<Navigate to="/event-calendar" replace />}
            />
            <Route
              path="/tournaments"
              element={
                <TournamentsPage
                  currentUserProfile={currentUserProfile}
                  onTournamentActivity={() =>
                    queryClient.invalidateQueries({
                      queryKey: homeQueryKeys.activity(actorUsername),
                    })
                  }
                  tournamentCrud={tournamentCrud}
                />
              }
            />
            <Route path="/records" element={<RecordsPage />} />
            <Route
              path="/outdoor-table"
              element={<OutdoorTablePage currentUserProfile={currentUserProfile} />}
            />
            <Route
              path="/range-rules"
              element={<RangeRulesPage currentUserProfile={currentUserProfile} />}
            />
            <Route
              path="/range-rules-admin"
              element={
                <RangeRulesAdminPage currentUserProfile={currentUserProfile} />
              }
            />
            <Route
              path="/general-info-admin"
              element={
                <GeneralInfoAdminPage currentUserProfile={currentUserProfile} />
              }
            />
            <Route
              path="/tournament-setup"
              element={
                <TournamentsPage
                  currentUserProfile={currentUserProfile}
                  onTournamentActivity={() =>
                    queryClient.invalidateQueries({
                      queryKey: homeQueryKeys.activity(actorUsername),
                    })
                  }
                  showSetupForm
                  tournamentCrud={tournamentCrud}
                />
              }
            />
            <Route
              path="/committee-org-chart"
              element={
                <CommitteeOrgChartPage currentUserProfile={currentUserProfile} />
              }
            />
            <Route
              path="/committee-admin"
              element={
                <CommitteeAdminPage currentUserProfile={currentUserProfile} />
              }
            />
            <Route
              path="/announcements"
              element={
                <AnnouncementsPage currentUserProfile={currentUserProfile} />
              }
            />
            <Route path="/feedback-form" element={<FeedbackFormPage />} />
            <Route path="/ideas-form" element={<Navigate to="/feedback-form" replace />} />
            <Route
              path="/lost-and-found"
              element={<LostAndFoundPage currentUserProfile={currentUserProfile} />}
            />
            <Route
              path="/general-info"
              element={<GeneralInfoPage currentUserProfile={currentUserProfile} />}
            />
            <Route
              path="*"
              element={
                <PlaceholderPage
                  title={pageTitleMap[activePage] || "Unknown"}
                />
              }
            />
          </Routes>
        </section>
      </main>

      {lostArrowToasts.length > 0 ? (
        <div className="lost-arrow-toast-stack" aria-live="polite" aria-atomic="true">
          {lostArrowToasts.map((toast) => (
            <div key={toast.id} className="lost-arrow-toast" role="status">
              <div className="lost-arrow-toast-copy">
                <strong>New lost arrow</strong>
                <p>{toast.message}</p>
              </div>
              <div className="lost-arrow-toast-actions">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => navigate(toast.targetPath)}
                >
                  Open lost arrows
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="lost-arrow-toast-dismiss"
                  onClick={() => handleDismissLostArrowToast(toast.id)}
                  aria-label="Dismiss lost arrow notification"
                >
                  Close
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
