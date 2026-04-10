import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, Routes, Route } from "react-router-dom";
import { SideDrawer } from "../components/SideDrawer";
import archeryBanner from "../../assets/archery_banner.svg";
import selbyLogo from "../../assets/selby_Archery_Logo.svg";
import { HomeSection } from "./HomeSection";
import { LostAndFoundPage } from "./LostAndFoundPage";
import { FeedbackFormPage } from "./FeedbackFormPage";
import { IdeasFormPage } from "./IdeasFormPage";
import { EventCalendarPage } from "./EventCalendarPage";
import { CoachingCalendarPage } from "./CoachingCalendarPage";
import { TournamentsPage } from "./TournamentsPage";
import { RangeUsagePage } from "./RangeUsagePage";
import { PlaceholderPage } from "./PlaceholderPage";
import { ProfilePage } from "./ProfilePage";
import { UserCreationPage } from "./UserCreationPage";
import { LoanBowRegisterPage } from "./LoanBowRegisterPage";
import { CommitteeOrgChartPage } from "./CommitteeOrgChartPage";
import { RolePermissionsPage } from "./RolePermissionsPage";
import { ApprovalsPage } from "./ApprovalsPage";
import { formatDate } from "../../utils/dateTime";
import { fetchApi } from "../../lib/api";
import {
  hasPermission,
  isSameUserProfile,
  normalizeUserProfile,
} from "../../utils/userProfile";

type HomePageProps = {
  getMembersUseCase?: unknown;
  addMemberUseCase?: unknown;
  currentUserProfile: {
    accountType?: string;
    auth?: {
      username?: string;
    };
    personal?: {
      fullName?: string;
    };
    meta?: {
      membershipFeesDue?: string;
    };
    [key: string]: unknown;
  } | null;
  onCurrentUserProfileUpdate: (userProfile: unknown) => void;
  onLogout: (message?: string) => void;
};

type HomeMember = any;
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
  "loan-bow-register": "Loan Bow Register",
  "event-calendar": "Event/Competition Calendar",
  "range-usage": "Range Usage",
  "feedback-form": "Feedback Form",
  "ideas-form": "Ideas Form",
  "coaching-calendar": "Coaching Calendar",
  tournaments: "Tournaments",
  "tournament-setup": "Tournament Setup",
  "committee-org-chart": "Committee Org Chart",
  "general-info": "General Info",
  "lost-and-found": "Lost and Found",
};

const pathToPageId = {
  "/": "home",
  "/profile": "profile",
  "/user-creation": "user-creation",
  "/role-permissions": "role-permissions",
  "/approvals": "approvals",
  "/loan-bow-register": "loan-bow-register",
  "/event-calendar": "event-calendar",
  "/range-usage": "range-usage",
  "/feedback-form": "feedback-form",
  "/ideas-form": "ideas-form",
  "/coaching-calendar": "coaching-calendar",
  "/tournaments": "tournaments",
  "/tournament-setup": "tournament-setup",
  "/committee-org-chart": "committee-org-chart",
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

async function fetchRangeMembers(): Promise<HomeMember[]> {
  const result = await fetchApi<{ success: true; members?: HomeMember[] }>(
    "/api/range-members",
    {
      cache: "no-store",
    },
  );

  return (result.members ?? []).map((member) => normalizeUserProfile(member));
}

async function fetchHomeActivity(username: string): Promise<{
  signedUpEvents: HomeEvent[];
  tournamentReminders: TournamentReminder[];
}> {
  const headers = { "x-actor-username": username };
  const [coachingResult, eventResult, reminderResult] = await Promise.all([
    fetchApi<{ success: true; bookings?: HomeEvent[] }>("/api/my-coaching-bookings", {
      headers,
      cache: "no-store",
    }),
    fetchApi<{ success: true; bookings?: HomeEvent[] }>("/api/my-event-bookings", {
      headers,
      cache: "no-store",
    }),
    fetchApi<{ success: true; reminders?: TournamentReminder[] }>(
      "/api/my-tournament-reminders",
      {
        headers,
        cache: "no-store",
      },
    ),
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
  };
}

async function fetchAdminTournamentWarnings(username: string): Promise<string[]> {
  const result = await fetchApi<{ success: true; tournaments?: TournamentSummary[] }>(
    "/api/tournaments",
    {
      headers: {
        "x-actor-username": username,
      },
      cache: "no-store",
    },
  );

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
}: HomePageProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManageTournaments = hasPermission(
    currentUserProfile,
    "manage_tournaments",
  );
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const membershipReminderMessage = useMemo(
    () => getMembershipReminderMessage(currentUserProfile),
    [currentUserProfile],
  );
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

    return () => {
      window.removeEventListener("member-bookings-updated", refreshAll);
      window.removeEventListener("member-session-updated", refreshAll);
      window.removeEventListener("tournament-data-updated", refreshAll);
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
      {membershipReminderMessage ? (
        <div className="membership-reminder-ticker" role="status" aria-live="polite">
          <div className="membership-reminder-ticker-track">
            <span>{membershipReminderMessage}</span>
          </div>
        </div>
      ) : null}

      {adminTournamentWarnings.length > 0 ? (
        <div className="admin-warning-ticker" role="status" aria-live="polite">
          <div className="admin-warning-ticker-track">
            <span>
              {adminTournamentWarnings.join("   •   ")}
            </span>
            <span aria-hidden="true">
              {adminTournamentWarnings.join("   •   ")}
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
        <button
          className="menu-button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        >
          <img
            src={selbyLogo}
            alt="Selby Archers Logo"
            className="menu-button-logo"
          />
          <span className="menu-button-label">Menu</span>
        </button>
        <div className="heading-wrap">
          <h1>{pageTitleMap[activePage] || "Archery Club"}</h1>
        </div>
      </section>

      <main className="page-shell">
        <section className="page-content">
          {activePage === "home" ? (
            <h1 className="welcome-message">
              Welcome {currentUserProfile?.personal.fullName}
            </h1>
          ) : null}

          <Routes>
            <Route
              path="/profile"
              element={
                <ProfilePage
                  currentUserProfile={currentUserProfile}
                  onCurrentUserProfileUpdate={onCurrentUserProfileUpdate}
                />
              }
            />
            <Route
              path="/user-creation"
              element={<UserCreationPage currentUserProfile={currentUserProfile} />}
            />
            <Route
              path="/role-permissions"
              element={
                <RolePermissionsPage
                  currentUserProfile={currentUserProfile}
                  onCurrentUserProfileUpdate={onCurrentUserProfileUpdate}
                />
              }
            />
            <Route
              path="/approvals"
              element={<ApprovalsPage currentUserProfile={currentUserProfile} />}
            />
            <Route
              path="/loan-bow-register"
              element={
                <LoanBowRegisterPage currentUserProfile={currentUserProfile} />
              }
            />
            <Route
              path="/"
              element={
                <HomeSection
                  members={membersAtRange}
                  signedUpEvents={signedUpEvents}
                  tournamentReminders={tournamentReminders}
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
              element={<CoachingCalendarPage currentUserProfile={currentUserProfile} />}
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
                />
              }
            />
            <Route
              path="/committee-org-chart"
              element={
                <CommitteeOrgChartPage currentUserProfile={currentUserProfile} />
              }
            />
            <Route path="/feedback-form" element={<FeedbackFormPage />} />
            <Route path="/lost-and-found" element={<LostAndFoundPage />} />
            <Route path="/ideas-form" element={<IdeasFormPage />} />
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
