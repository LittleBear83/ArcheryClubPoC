import { lazy, Suspense, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, Routes, Route, Navigate } from "react-router-dom";
import { SideDrawer } from "../components/SideDrawer";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { GuestLoginForm } from "../components/GuestLoginForm";
import archeryBanner from "../../assets/archery_banner.svg";
import selbyLogo from "../../assets/selby_Archery_Logo.svg";
import { HomeSection } from "./HomeSection";
import { formatDate } from "../../utils/dateTime";
import {
  getMyBeginnerDashboard,
  listMyBeginnerCoachingAssignments,
  listMyCoachingBookings,
  listMyEventBookings,
  listMyTournamentReminders,
} from "../../api/homeApi";
import { listCommitteeRoles } from "../../api/committeeApi";
import { listRangeMembers } from "../../api/memberApi";
import {
  listActiveAnnouncements,
  type AnnouncementRecord,
} from "../../api/announcementApi";
import {
  getBeginnersCoursesDashboard,
  getHaveAGoSessionsDashboard,
  getTasterSessionsDashboard,
} from "../../api/beginnersCoursesApi";
import { listTournaments } from "../../api/tournamentApi";
import { listMyLostArrowNotices, listOpenLostArrows } from "../../api/lostArrowApi";
import { listMyMemberQuestions } from "../../api/questionApi";
import { listCoachingSessions, listEvents } from "../../api/scheduleApi";
import { useTheme } from "../../theme/useTheme";
import type {
  ApprovalEvent,
  HomeMember,
  LostArrowRecord,
  UserProfile,
} from "../../types/app";
import type { AppDependencies } from "../../bootstrap/createAppDependencies";
import { useIsMobile } from "../hooks/useIsMobile";
import {
  canViewCommitteeApprovalsCard as canViewCommitteeApprovalsCardForUser,
  hasCommitteeApprovalAccess,
} from "./home/committeeApprovalsCardUtils";
import { buildCommitteeApprovalSummary } from "./home/committeeApprovalSummaryUtils";
import { filterHomeActivityCurrentOrUpcoming } from "./home/homeActivityFilters";
import { homeQueryKeys } from "./home/homeQueryKeys";
import { useHomePageToasts } from "./home/useHomePageToasts";
import { useRangePresenceFeature } from "./home/useRangePresenceFeature";
import {
  formatMemberDisplayName,
  formatRangeMemberDisplayName,
  hasPermission,
  isProgrammeUser,
  normalizeUserProfile,
} from "../../utils/userProfile";
import { canAccessMemberPage } from "../navigation/memberPageAccess";

const ProfilePage = lazy(() =>
  import("./ProfilePage").then((module) => ({ default: module.ProfilePage })),
);
const UserCreationPage = lazy(() =>
  import("./UserCreationPage").then((module) => ({
    default: module.UserCreationPage,
  })),
);
const RolePermissionsPage = lazy(() =>
  import("./RolePermissionsPage").then((module) => ({
    default: module.RolePermissionsPage,
  })),
);
const ReportingPage = lazy(() =>
  import("./ReportingPage").then((module) => ({ default: module.ReportingPage })),
);
const AuditLogPage = lazy(() =>
  import("./AuditLogPage").then((module) => ({ default: module.AuditLogPage })),
);
const ApprovalsPage = lazy(() =>
  import("./ApprovalsPage").then((module) => ({ default: module.ApprovalsPage })),
);
const EquipmentPage = lazy(() =>
  import("./EquipmentPage").then((module) => ({ default: module.EquipmentPage })),
);
const BeginnersAndTasterPage = lazy(() =>
  import("./BeginnersAndTasterPage").then((module) => ({
    default: module.BeginnersAndTasterPage,
  })),
);
const HaveAGoSessionsPage = lazy(() =>
  import("./HaveAGoSessionsPage").then((module) => ({
    default: module.HaveAGoSessionsPage,
  })),
);
const AskQuestionPage = lazy(() =>
  import("./AskQuestionPage").then((module) => ({ default: module.AskQuestionPage })),
);
const EventCalendarPage = lazy(() =>
  import("./EventCalendarPage").then((module) => ({
    default: module.EventCalendarPage,
  })),
);
const RangeUsagePage = lazy(() =>
  import("./RangeUsagePage").then((module) => ({ default: module.RangeUsagePage })),
);
const TournamentsPage = lazy(() =>
  import("./TournamentsPage").then((module) => ({ default: module.TournamentsPage })),
);
const RecordsPage = lazy(() =>
  import("./RecordsPage").then((module) => ({ default: module.RecordsPage })),
);
const OutdoorTablePage = lazy(() =>
  import("./OutdoorTablePage").then((module) => ({
    default: module.OutdoorTablePage,
  })),
);
const RangeRulesPage = lazy(() =>
  import("./RangeRulesPage").then((module) => ({ default: module.RangeRulesPage })),
);
const RangeRulesAdminPage = lazy(() =>
  import("./RangeRulesAdminPage").then((module) => ({
    default: module.RangeRulesAdminPage,
  })),
);
const GeneralInfoAdminPage = lazy(() =>
  import("./GeneralInfoAdminPage").then((module) => ({
    default: module.GeneralInfoAdminPage,
  })),
);
const GoldenRecordsAdminPage = lazy(() =>
  import("./GoldenRecordsAdminPage").then((module) => ({
    default: module.GoldenRecordsAdminPage,
  })),
);
const CommitteeOrgChartPage = lazy(() =>
  import("./CommitteeOrgChartPage").then((module) => ({
    default: module.CommitteeOrgChartPage,
  })),
);
const CommitteeAdminPage = lazy(() =>
  import("./CommitteeAdminPage").then((module) => ({
    default: module.CommitteeAdminPage,
  })),
);
const AnnouncementsPage = lazy(() =>
  import("./AnnouncementsPage").then((module) => ({
    default: module.AnnouncementsPage,
  })),
);
const SuggestionsAdminPage = lazy(() =>
  import("./SuggestionsAdminPage").then((module) => ({
    default: module.SuggestionsAdminPage,
  })),
);
const QuestionInboxPage = lazy(() =>
  import("./QuestionInboxPage").then((module) => ({
    default: module.QuestionInboxPage,
  })),
);
const FeedbackFormPage = lazy(() =>
  import("./FeedbackFormPage").then((module) => ({
    default: module.FeedbackFormPage,
  })),
);
const LostAndFoundPage = lazy(() =>
  import("./LostAndFoundPage").then((module) => ({
    default: module.LostAndFoundPage,
  })),
);
const GeneralInfoPage = lazy(() =>
  import("./GeneralInfoPage").then((module) => ({
    default: module.GeneralInfoPage,
  })),
);
const PlaceholderPage = lazy(() =>
  import("./PlaceholderPage").then((module) => ({
    default: module.PlaceholderPage,
  })),
);

type HomePageProps = {
  currentUserProfile: UserProfile | null;
  onGuestLogin: (details: {
    firstName: string;
    surname: string;
    archeryGbMembershipNumber: string;
    invitedByUsername: string;
    paymentMethod: "paypal" | "cash";
  }) => Promise<{
    success: boolean;
    message?: string;
  }>;
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
    | "refreshGoldenRecordsHandicapUseCase"
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
  courseType?: "beginners" | "have-a-go" | "taster-session";
  lessonNumber: number;
  date: string;
  startTime: string;
  endTime: string;
  coordinatorName: string;
  beginnerCount: number;
};
type CommitteeRole = {
  id: number;
  roleKey: string;
  assignedMember?: {
    username: string;
  } | null;
};
type PendingCourseApproval = {
  approvalStatus: string;
  isCancelled?: boolean;
  lessons?: Array<{
    date?: string;
    endTime?: string;
  }>;
};
type CommitteeApprovalSummary = {
  totalPendingCount: number;
  calendarItemsCount: number;
  beginnersCoursesCount: number;
  haveAGoSessionsCount: number;
  tasterSessionsCount: number;
  approvedBeginnersCoursesCount: number;
  approvedHaveAGoSessionsCount: number;
  approvedTasterSessionsCount: number;
};
type LostArrowNotice = LostArrowRecord;
const TOURNAMENT_WARNING_CLOSE_WINDOW_DAYS = 2;

const pageTitleMap = {
  home: "Home",
  profile: "Profile",
  "user-creation": "People & Access",
  "role-permissions": "Roles & Permissions",
  reporting: "Reporting",
  "audit-log": "Audit Log",
  approvals: "Approvals",
  equipment: "Equipment",
  "beginners-courses": "Beginners & Taster Sessions",
  "have-a-go-sessions": "Have a Go Sessions",
  "event-calendar": "Calendar",
  "range-usage": "Range Usage",
  "ask-a-question": "Ask A Question",
  "feedback-form": "Suggestion Box",
  "question-inbox": "Question Inbox",
  tournaments: "Tournaments",
  records: "Records",
  "outdoor-table": "Outdoor Table",
  "range-rules": "Range Rules",
  "range-rules-admin": "Range Rules Admin",
  "general-info-admin": "General Info Admin",
  "golden-records-admin": "Golden Records Admin",
  "tournament-setup": "Tournament Setup",
  "committee-org-chart": "Committee Org Chart",
  "committee-admin": "Committee Admin",
  announcements: "Announcements",
  "suggestions-admin": "Suggestion Inbox",
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
  "/taster-sessions": "beginners-courses",
  "/event-calendar": "event-calendar",
  "/range-usage": "range-usage",
  "/ask-a-question": "ask-a-question",
  "/feedback-form": "feedback-form",
  "/question-inbox": "question-inbox",
  "/ideas-form": "feedback-form",
  "/tournaments": "tournaments",
  "/records": "records",
  "/outdoor-table": "outdoor-table",
  "/range-rules": "range-rules",
  "/range-rules-admin": "range-rules-admin",
  "/general-info-admin": "general-info-admin",
  "/golden-records-admin": "golden-records-admin",
  "/tournament-setup": "tournament-setup",
  "/committee-org-chart": "committee-org-chart",
  "/committee-admin": "committee-admin",
  "/announcements": "announcements",
  "/suggestions-admin": "suggestions-admin",
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

function PageLoadingFallback() {
  return (
    <div className="profile-form">
      <p>Loading page...</p>
    </div>
  );
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
    signedUpEvents: filterHomeActivityCurrentOrUpcoming([
      ...(coachingResult.bookings ?? []),
      ...(eventResult.bookings ?? []),
    ]).sort((left, right) => {
      const byDate = left.date.localeCompare(right.date);
      return byDate !== 0
        ? byDate
        : (left.startTime ?? "").localeCompare(right.startTime ?? "");
    }),
    tournamentReminders: filterHomeActivityCurrentOrUpcoming(
      reminderResult.reminders ?? [],
    ),
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

async function fetchCommitteeApprovalSummary({
  actor,
  canManageBeginnersCourses,
  canManageHaveAGoSessions,
  canApproveBeginnersCourses,
  canApproveCoaching,
  canApproveEvents,
  canApproveHaveAGoSessions,
}: {
  actor: UserProfile;
  canManageBeginnersCourses: boolean;
  canManageHaveAGoSessions: boolean;
  canApproveBeginnersCourses: boolean;
  canApproveCoaching: boolean;
  canApproveEvents: boolean;
  canApproveHaveAGoSessions: boolean;
}): Promise<CommitteeApprovalSummary> {
  const [eventResult, coachingResult, beginnersResult, haveAGoResult, tasterResult] = await Promise.all([
    canApproveEvents
      ? listEvents<ApprovalEvent>(actor)
      : Promise.resolve({ success: true, events: [] }),
    canApproveCoaching
      ? listCoachingSessions(actor)
      : Promise.resolve({ success: true, sessions: [] }),
    canManageBeginnersCourses || canApproveBeginnersCourses
      ? getBeginnersCoursesDashboard(actor)
      : Promise.resolve({ success: true, courses: [] }),
    canManageHaveAGoSessions || canApproveHaveAGoSessions
      ? getHaveAGoSessionsDashboard(actor)
      : Promise.resolve({ success: true, courses: [] }),
    canManageHaveAGoSessions || canApproveHaveAGoSessions
      ? getTasterSessionsDashboard(actor)
      : Promise.resolve({ success: true, courses: [] }),
  ]);

  return buildCommitteeApprovalSummary({
    events: eventResult.events ?? [],
    sessions: coachingResult.sessions ?? [],
    beginnersCourses: (beginnersResult.courses ?? []) as PendingCourseApproval[],
    haveAGoSessions: (haveAGoResult.courses ?? []) as PendingCourseApproval[],
    tasterSessions: (tasterResult.courses ?? []) as PendingCourseApproval[],
  });
}

export function HomePage({
  currentUserProfile,
  onGuestLogin,
  onCurrentUserProfileUpdate,
  onLogout,
  memberProfileCrud,
  roleCrud,
  tournamentCrud,
  equipmentCrud,
}: HomePageProps) {
  const { theme, themeName, toggleTheme } = useTheme();
  const isMobile = useIsMobile();
  const [isGuestLoginModalOpen, setIsGuestLoginModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManageTournaments = hasPermission(
    currentUserProfile,
    "manage_tournaments",
  );
  const canManageBeginnersCourses = hasPermission(
    currentUserProfile,
    "manage_beginners_courses",
  );
  const canManageHaveAGoSessions = hasPermission(
    currentUserProfile,
    "manage_have_a_go_sessions",
  );
  const canApproveEvents = hasPermission(currentUserProfile, "approve_events");
  const canApproveCoaching = hasPermission(
    currentUserProfile,
    "approve_coaching_sessions",
  );
  const canApproveBeginnersCourses = hasPermission(
    currentUserProfile,
    "approve_beginners_courses",
  );
  const canApproveHaveAGoSessions = hasPermission(
    currentUserProfile,
    "approve_have_a_go_sessions",
  );
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const invitingMemberName =
    formatMemberDisplayName(currentUserProfile) || actorUsername;
  const isProgrammeMember = isProgrammeUser(currentUserProfile);
  const activePage = pathToPageId[location.pathname] || "home";
  const renderProgrammeRestrictedRoute = (pageId: string, element: ReactNode) =>
    canAccessMemberPage(pageId, currentUserProfile)
      ? element
      : <Navigate to="/" replace />;
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
  const { data: committeeRolesData } = useQuery({
    queryKey: homeQueryKeys.committeeRoles(actorUsername),
    queryFn: () =>
      listCommitteeRoles<{ success: true; roles?: CommitteeRole[] }>(
        currentUserProfile,
      ),
    enabled: Boolean(actorUsername),
  });
  const { data: lostArrowNotices = [] } = useQuery({
    queryKey: homeQueryKeys.lostArrowNotices(actorUsername),
    queryFn: () => fetchLostArrowNotices(currentUserProfile),
    enabled: Boolean(actorUsername),
  });
  const { data: memberQuestionsResult } = useQuery({
    queryKey: homeQueryKeys.memberQuestions(actorUsername),
    queryFn: () => listMyMemberQuestions(currentUserProfile),
    enabled: Boolean(actorUsername),
  });
  const { data: openLostArrowsResult } = useQuery({
    queryKey: homeQueryKeys.openLostArrows(actorUsername),
    queryFn: () => listOpenLostArrows(currentUserProfile),
    enabled: Boolean(actorUsername),
  });

  const signedUpEvents = homeActivity?.signedUpEvents ?? [];
  const tournamentReminders = homeActivity?.tournamentReminders ?? [];
  const beginnerDashboard = homeActivity?.beginnerDashboard ?? null;
  const beginnerCoachAssignments = homeActivity?.beginnerCoachAssignments ?? [];
  const canLoadCommitteeApprovalCounts = hasCommitteeApprovalAccess({
    canManageBeginnersCourses,
    canManageHaveAGoSessions,
    canApproveBeginnersCourses,
    canApproveCoaching,
    canApproveEvents,
    canApproveHaveAGoSessions,
  });
  const canViewCommitteeApprovalsCard = useMemo(() => {
    return canViewCommitteeApprovalsCardForUser({
      actorUsername,
      committeeRoles: committeeRolesData?.roles ?? [],
      userRole: currentUserProfile?.membership?.role ?? "",
    });
  }, [actorUsername, committeeRolesData?.roles, currentUserProfile?.membership?.role]);
  const { data: committeeApprovalSummary = null } = useQuery({
    queryKey: homeQueryKeys.committeeApprovalSummary(actorUsername),
    queryFn: () =>
      fetchCommitteeApprovalSummary({
        actor: currentUserProfile as UserProfile,
        canManageBeginnersCourses,
        canManageHaveAGoSessions,
        canApproveBeginnersCourses,
        canApproveCoaching,
        canApproveEvents,
        canApproveHaveAGoSessions,
      }),
    enabled:
      Boolean(currentUserProfile) &&
      canViewCommitteeApprovalsCard &&
      canLoadCommitteeApprovalCounts,
  });
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
  const unreadQuestionResponses = useMemo(() => {
    return (memberQuestionsResult?.questions ?? []).filter(
      (question) => question.status === "answered" && !question.memberSeenResponse,
    );
  }, [memberQuestionsResult?.questions]);
  const mobileOnSiteFeature = useRangePresenceFeature({
    actorUsername,
    rangeMembers,
    currentUserProfile,
  });
  const {
    lostArrowToasts,
    questionResponseToasts,
    dismissLostArrowToast,
    dismissQuestionToast,
  } = useHomePageToasts({
    actorUsername,
    openLostArrows,
    unreadQuestionResponses,
  });

  const handleNavigate = (pageId) => {
    const target = pageIdToPath[pageId] || "/";
    navigate(target);
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

          <Suspense fallback={<PageLoadingFallback />}>
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
                <BeginnersAndTasterPage currentUserProfile={currentUserProfile} />
              }
            />
            <Route
              path="/have-a-go-sessions"
              element={
                <HaveAGoSessionsPage currentUserProfile={currentUserProfile} />
              }
            />
            <Route
              path="/taster-sessions"
              element={<Navigate to="/beginners-courses?tab=taster-session" replace />}
            />
            <Route
              path="/"
              element={
                <HomeSection
                  members={rangeMembers}
                  signedUpEvents={signedUpEvents}
                  tournamentReminders={tournamentReminders}
                  approvalSummary={
                    canLoadCommitteeApprovalCounts
                      ? committeeApprovalSummary
                      : {
                          totalPendingCount: 0,
                          calendarItemsCount: 0,
                          beginnersCoursesCount: 0,
                          haveAGoSessionsCount: 0,
                          tasterSessionsCount: 0,
                          approvedBeginnersCoursesCount: 0,
                          approvedHaveAGoSessionsCount: 0,
                          approvedTasterSessionsCount: 0,
                          noApprovalAccess: true,
                        }
                  }
                  beginnerDashboard={beginnerDashboard}
                  beginnerCoachAssignments={beginnerCoachAssignments}
                  mobileOnSiteFeature={mobileOnSiteFeature}
                  hideEventPanels={isProgrammeMember}
                  lostArrows={openLostArrows}
                  onOpenGuestLogin={() => setIsGuestLoginModalOpen(true)}
                  onOpenApprovals={() => navigate("/approvals")}
                  onOpenBeginnersCourses={() => navigate("/beginners-courses?tab=beginners")}
                  onOpenHaveAGoSessions={() => navigate("/have-a-go-sessions")}
                  onOpenLostAndFound={() => navigate("/lost-and-found")}
                  onOpenTasterSessions={() => navigate("/beginners-courses?tab=taster-session")}
                />
              }
            />
            <Route
              path="/ask-a-question"
              element={<AskQuestionPage currentUserProfile={currentUserProfile} />}
            />
            <Route
              path="/event-calendar"
              element={renderProgrammeRestrictedRoute(
                "event-calendar",
                <EventCalendarPage
                  currentUserProfile={currentUserProfile}
                  onBookingsChanged={() =>
                    queryClient.invalidateQueries({
                      queryKey: homeQueryKeys.activity(actorUsername),
                    })
                  }
                />
              )}
            />
            <Route
              path="/range-usage"
              element={renderProgrammeRestrictedRoute(
                "range-usage",
                <RangeUsagePage currentUserProfile={currentUserProfile} />,
              )}
            />
            <Route
              path="/coaching-calendar"
              element={<Navigate to="/event-calendar" replace />}
            />
            <Route
              path="/tournaments"
              element={renderProgrammeRestrictedRoute(
                "tournaments",
                <TournamentsPage
                  currentUserProfile={currentUserProfile}
                  onTournamentActivity={() =>
                    queryClient.invalidateQueries({
                      queryKey: homeQueryKeys.activity(actorUsername),
                    })
                  }
                  tournamentCrud={tournamentCrud}
                />
              )}
            />
            <Route
              path="/records"
              element={renderProgrammeRestrictedRoute("records", <RecordsPage />)}
            />
            <Route
              path="/outdoor-table"
              element={renderProgrammeRestrictedRoute(
                "outdoor-table",
                <OutdoorTablePage currentUserProfile={currentUserProfile} />,
              )}
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
              path="/golden-records-admin"
              element={
                <GoldenRecordsAdminPage currentUserProfile={currentUserProfile} />
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
            <Route
              path="/suggestions-admin"
              element={
                <SuggestionsAdminPage currentUserProfile={currentUserProfile} />
              }
            />
            <Route
              path="/question-inbox"
              element={<QuestionInboxPage currentUserProfile={currentUserProfile} />}
            />
            <Route
              path="/feedback-form"
              element={<FeedbackFormPage currentUserProfile={currentUserProfile} />}
            />
            <Route path="/ideas-form" element={<Navigate to="/feedback-form" replace />} />
            <Route
              path="/lost-and-found"
              element={renderProgrammeRestrictedRoute(
                "lost-and-found",
                <LostAndFoundPage currentUserProfile={currentUserProfile} />,
              )}
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
          </Suspense>
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
                  onClick={() => dismissLostArrowToast(toast.id)}
                  aria-label="Dismiss lost arrow notification"
                >
                  Close
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {questionResponseToasts.length > 0 ? (
        <div className="lost-arrow-toast-stack" aria-live="polite" aria-atomic="true">
          {questionResponseToasts.map((toast) => (
            <div key={toast.id} className="lost-arrow-toast" role="status">
              <div className="lost-arrow-toast-copy">
                <strong>Committee response</strong>
                <p>{toast.message}</p>
              </div>
              <div className="lost-arrow-toast-actions">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    navigate(toast.targetPath);
                    dismissQuestionToast(toast.id);
                  }}
                >
                  Open response
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="lost-arrow-toast-dismiss"
                  onClick={() => dismissQuestionToast(toast.id)}
                  aria-label="Dismiss question response notification"
                >
                  Close
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <Modal
        open={isGuestLoginModalOpen}
        onClose={() => setIsGuestLoginModalOpen(false)}
        title="Guest Sign In"
      >
        <div className="guest-member-modal">
          <p className="guest-member-modal-copy">
            Record a guest visit while staying signed in as the current member.
          </p>
          <GuestLoginForm
            invitingMemberName={invitingMemberName}
            invitedByUsername={actorUsername}
            onGuestLogin={onGuestLogin}
          />
        </div>
      </Modal>
    </>
  );
}
