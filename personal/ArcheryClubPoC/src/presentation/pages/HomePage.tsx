import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, Routes, Route, Navigate } from "react-router-dom";
import { SideDrawer } from "../components/SideDrawer";
import { Button } from "../components/Button";
import archeryBanner from "../../assets/archery_banner.svg";
import selbyLogo from "../../assets/selby_Archery_Logo.svg";
import { HomeSection } from "./HomeSection";
import { LostAndFoundPage } from "./LostAndFoundPage";
import { FeedbackFormPage } from "./FeedbackFormPage";
import { IdeasFormPage } from "./IdeasFormPage";
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
import { ApprovalsPage } from "./ApprovalsPage";
import { GeneralInfoPage } from "./GeneralInfoPage";
import { formatDate } from "../../utils/dateTime";
import {
  getMyBeginnerDashboard,
  listMyBeginnerCoachingAssignments,
  listMyCoachingBookings,
  listMyEventBookings,
  listMyTournamentReminders,
} from "../../api/homeApi";
import { listRangeMembers } from "../../api/memberApi";
import { listTournaments } from "../../api/tournamentApi";
import { useTheme } from "../../theme/useTheme";
import type { HomeMember, UserProfile } from "../../types/app";
import type { AppDependencies } from "../../bootstrap/createAppDependencies";
import {
  formatMemberDisplayName,
  hasPermission,
  isSameUserProfile,
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
    | "assignMemberRfidTagUseCase"
    | "returnLoanBowUseCase"
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

const homeQueryKeys = {
  rangeMembers: () => ["range-members"] as const,
  activity: (username: string) => ["home-activity", username] as const,
  adminWarnings: (username: string) =>
    ["admin-tournament-warnings", username] as const,
};

const TOURNAMENT_WARNING_CLOSE_WINDOW_DAYS = 2;

const pageTitleMap = {
  home: "Home",
  profile: "Profile",
  "user-creation": "User Creation",
  "role-permissions": "Roles & Permissions",
  approvals: "Approvals",
  equipment: "Equipment",
  "beginners-courses": "Beginners Courses",
  "have-a-go-sessions": "Have a Go Sessions",
  "event-calendar": "Calendar",
  "range-usage": "Range Usage",
  "feedback-form": "Feedback Form",
  "ideas-form": "Ideas Form",
  tournaments: "Tournaments",
  "tournament-setup": "Tournament Setup",
  "committee-org-chart": "Committee Org Chart",
  "committee-admin": "Committee Admin",
  "general-info": "General Info",
  "lost-and-found": "Lost and Found",
};

const pathToPageId = {
  "/": "home",
  "/profile": "profile",
  "/user-creation": "user-creation",
  "/role-permissions": "role-permissions",
  "/approvals": "approvals",
  "/equipment": "equipment",
  "/beginners-courses": "beginners-courses",
  "/have-a-go-sessions": "have-a-go-sessions",
  "/event-calendar": "event-calendar",
  "/range-usage": "range-usage",
  "/feedback-form": "feedback-form",
  "/ideas-form": "ideas-form",
  "/tournaments": "tournaments",
  "/tournament-setup": "tournament-setup",
  "/committee-org-chart": "committee-org-chart",
  "/committee-admin": "committee-admin",
  "/general-info": "general-info",
  "/lost-and-found": "lost-and-found",
};

const pageIdToPath = Object.fromEntries(
  Object.entries(pathToPageId).map(([path, id]) => [id, path]),
);

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
      `${tournament.name} registration closes on ${tournament.registrationWindow.endDate} with an uneven field of ${competitorCount} competing members.`,
    ];
  });
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
    refetchInterval: activePage === "home" ? 60000 : false,
  });

  const { data: homeActivity } = useQuery({
    queryKey: homeQueryKeys.activity(actorUsername),
    queryFn: () => fetchHomeActivity(actorUsername),
    enabled: Boolean(actorUsername),
    refetchInterval: activePage === "home" ? 60000 : false,
  });

  const { data: adminTournamentWarnings = [] } = useQuery({
    queryKey: homeQueryKeys.adminWarnings(actorUsername),
    queryFn: () => fetchAdminTournamentWarnings(actorUsername),
    enabled: canManageTournaments && Boolean(actorUsername),
    refetchInterval: canManageTournaments ? 60000 : false,
  });

  const signedUpEvents = homeActivity?.signedUpEvents ?? [];
  const tournamentReminders = homeActivity?.tournamentReminders ?? [];
  const beginnerDashboard = homeActivity?.beginnerDashboard ?? null;
  const beginnerCoachAssignments = homeActivity?.beginnerCoachAssignments ?? [];
  const homeTickerMessage = useMemo(
    () => getHomeTickerMessage(currentUserProfile, beginnerDashboard),
    [beginnerDashboard, currentUserProfile],
  );

  const membersAtRange = useMemo(() => {
    if (!currentUserProfile) {
      return rangeMembers;
    }

    const normalizedCurrentUser = normalizeUserProfile(currentUserProfile);
    const alreadyIncluded = rangeMembers.some((member) =>
      isSameUserProfile(normalizedCurrentUser, member),
    );

    return alreadyIncluded
      ? rangeMembers
      : [normalizedCurrentUser, ...rangeMembers];
  }, [currentUserProfile, rangeMembers]);

  useEffect(() => {
    const refreshAll = () => {
      void queryClient.invalidateQueries({
        queryKey: homeQueryKeys.rangeMembers(),
      });
      if (actorUsername) {
        void queryClient.invalidateQueries({
          queryKey: homeQueryKeys.activity(actorUsername),
        });
      }
      if (canManageTournaments && actorUsername) {
        void queryClient.invalidateQueries({
          queryKey: homeQueryKeys.adminWarnings(actorUsername),
        });
      }
    };

    window.addEventListener("member-bookings-updated", refreshAll);
    window.addEventListener("member-session-updated", refreshAll);
    window.addEventListener("tournament-data-updated", refreshAll);
    window.addEventListener("beginners-course-data-updated", refreshAll);

    return () => {
      window.removeEventListener("member-bookings-updated", refreshAll);
      window.removeEventListener("member-session-updated", refreshAll);
      window.removeEventListener("tournament-data-updated", refreshAll);
      window.removeEventListener("beginners-course-data-updated", refreshAll);
    };
  }, [
    actorUsername,
    canManageTournaments,
    queryClient,
  ]);

  const handleNavigate = (pageId) => {
    const target = pageIdToPath[pageId] || "/";
    navigate(target);
  };

  return (
    <>
      {homeTickerMessage ? (
        <div className="membership-reminder-ticker" role="status" aria-live="polite">
          <div className="membership-reminder-ticker-track">
            <span>{homeTickerMessage}</span>
          </div>
        </div>
      ) : null}

      {adminTournamentWarnings.length > 0 ? (
        <div className="admin-warning-ticker" role="status" aria-live="polite">
          <div className="admin-warning-ticker-track">
            <span>
              {adminTournamentWarnings.join("   |   ")}
            </span>
            <span aria-hidden="true">
              {adminTournamentWarnings.join("   |   ")}
            </span>
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
          activePage === "role-permissions" ? "page-shell--wide" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <section className="page-content">
          {activePage === "home" ? (
            <h1 className="welcome-message">
              Welcome {formatMemberDisplayName(currentUserProfile)}
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
                  members={membersAtRange}
                  signedUpEvents={signedUpEvents}
                  tournamentReminders={tournamentReminders}
                  beginnerDashboard={beginnerDashboard}
                  beginnerCoachAssignments={beginnerCoachAssignments}
                  hideEventPanels={isBeginnerMember}
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
            <Route path="/feedback-form" element={<FeedbackFormPage />} />
            <Route path="/lost-and-found" element={<LostAndFoundPage />} />
            <Route path="/ideas-form" element={<IdeasFormPage />} />
            <Route path="/general-info" element={<GeneralInfoPage />} />
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
    </>
  );
}
