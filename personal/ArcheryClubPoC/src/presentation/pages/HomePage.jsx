import { useCallback, useEffect, useState } from "react";
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
import {
  isSameUserProfile,
  normalizeUserProfile,
} from "../../utils/userProfile";

const TOURNAMENT_WARNING_CLOSE_WINDOW_DAYS = 2;

const pageTitleMap = {
  home: "Home",
  profile: "Profile",
  "user-creation": "User Creation",
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

const pageIdToPath = Object.entries(pathToPageId).reduce(
  (acc, [path, id]) => ({ ...acc, [id]: path }),
  {},
);

export function HomePage({
  currentUserProfile,
  onCurrentUserProfileUpdate,
  onLogout,
}) {
  const [members, setMembers] = useState([]);
  const [signedUpEvents, setSignedUpEvents] = useState([]);
  const [tournamentReminders, setTournamentReminders] = useState([]);
  const [adminTournamentWarnings, setAdminTournamentWarnings] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = currentUserProfile?.membership?.role === "admin";

  const activePage = pathToPageId[location.pathname] || "home";
  const membersAtRange = currentUserProfile
    ? (() => {
        const alreadyIncluded = members.some((member) =>
          isSameUserProfile(currentUserProfile, member),
        );

        return alreadyIncluded ? members : [currentUserProfile, ...members];
      })()
    : members;

  useEffect(() => {
    if (!currentUserProfile) {
      return;
    }

    setMembers((current) => {
      const normalizedCurrentUser = normalizeUserProfile(currentUserProfile);
      const alreadyIncluded = current.some((member) =>
        isSameUserProfile(normalizedCurrentUser, member),
      );

      if (alreadyIncluded) {
        return current;
      }

      return [normalizedCurrentUser, ...current];
    });
  }, [currentUserProfile]);

  const loadRangeMembers = useCallback(async (signal) => {
    try {
      const response = await fetch("/api/range-members", {
        cache: "no-store",
        signal,
      });
      const result = await response.json();

      if (!response.ok || !result.success || signal?.aborted) {
        return;
      }

      setMembers(result.members.map((member) => normalizeUserProfile(member)));
    } catch {
      if (!signal?.aborted) {
        setMembers([]);
      }
    }
  }, []);

  const refreshHomeActivity = useCallback(async (signal) => {
    if (!currentUserProfile?.auth?.username) {
      setSignedUpEvents([]);
      setTournamentReminders([]);
      return;
    }

    try {
      const headers = {
        "x-actor-username": currentUserProfile.auth.username,
      };
      const [coachingResponse, eventResponse, reminderResponse] = await Promise.all([
        fetch("/api/my-coaching-bookings", { headers, cache: "no-store", signal }),
        fetch("/api/my-event-bookings", { headers, cache: "no-store", signal }),
        fetch("/api/my-tournament-reminders", { headers, cache: "no-store", signal }),
      ]);
      const [coachingResult, eventResult, reminderResult] = await Promise.all([
        coachingResponse.json(),
        eventResponse.json(),
        reminderResponse.json(),
      ]);

      if (
        !coachingResponse.ok ||
        !coachingResult.success ||
        !eventResponse.ok ||
        !eventResult.success ||
        !reminderResponse.ok ||
        !reminderResult.success ||
        signal?.aborted
      ) {
        return;
      }

      setSignedUpEvents(
        [...coachingResult.bookings, ...eventResult.bookings].sort((left, right) => {
          const byDate = left.date.localeCompare(right.date);
          return byDate !== 0
            ? byDate
            : (left.startTime ?? "").localeCompare(right.startTime ?? "");
          }),
      );
      setTournamentReminders(reminderResult.reminders ?? []);
    } catch {
      if (!signal?.aborted) {
        setSignedUpEvents([]);
        setTournamentReminders([]);
      }
    }
  }, [currentUserProfile]);

  const loadAdminTournamentWarnings = useCallback(async (signal) => {
    if (!isAdmin || !currentUserProfile?.auth?.username) {
      setAdminTournamentWarnings([]);
      return;
    }

    try {
      const response = await fetch("/api/tournaments", {
        headers: {
          "x-actor-username": currentUserProfile.auth.username,
        },
        cache: "no-store",
        signal,
      });
      const result = await response.json();

      if (!response.ok || !result.success || signal?.aborted) {
        throw new Error("Unable to load tournament warnings.");
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const warnings = (result.tournaments ?? []).flatMap((tournament) => {
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

      setAdminTournamentWarnings(warnings);
    } catch {
      if (!signal?.aborted) {
        setAdminTournamentWarnings([]);
      }
    }
  }, [currentUserProfile, isAdmin]);

  useEffect(() => {
    const abortController = new AbortController();

    loadRangeMembers(abortController.signal);
    refreshHomeActivity(abortController.signal);
    loadAdminTournamentWarnings(abortController.signal);

    const refreshAll = () => {
      const signal = abortController.signal;
      loadRangeMembers(signal);
      refreshHomeActivity(signal);
      loadAdminTournamentWarnings(signal);
    };
    const intervalId = window.setInterval(refreshAll, 30000);

    window.addEventListener("member-bookings-updated", refreshAll);
    window.addEventListener("tournament-data-updated", refreshAll);

    return () => {
      abortController.abort();
      window.clearInterval(intervalId);
      window.removeEventListener("member-bookings-updated", refreshAll);
      window.removeEventListener("tournament-data-updated", refreshAll);
    };
  }, [
    currentUserProfile?.auth?.username,
    isAdmin,
    location.pathname,
    loadAdminTournamentWarnings,
    loadRangeMembers,
    refreshHomeActivity,
  ]);

  const handleNavigate = (pageId) => {
    const target = pageIdToPath[pageId] || "/";
    navigate(target);
  };

  return (
    <>
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
        </button>
        <div className="heading-wrap">
          <h1>{pageTitleMap[activePage] || "Archery Club"}</h1>
        </div>
      </section>

      <main className="page-shell">
        <section className="page-content">
          <h2>{pageTitleMap[activePage] || "Archery Club"}</h2>
          {activePage === "home" ? (
            <p className="welcome-message">
              Welcome {currentUserProfile?.personal.fullName}
            </p>
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
                  onBookingsChanged={refreshHomeActivity}
                />
              }
            />
            <Route path="/range-usage" element={<RangeUsagePage />} />
            <Route
              path="/coaching-calendar"
              element={<CoachingCalendarPage currentUserProfile={currentUserProfile} />}
            />
            <Route
              path="/tournaments"
              element={
                <TournamentsPage
                  currentUserProfile={currentUserProfile}
                  onTournamentActivity={refreshHomeActivity}
                />
              }
            />
            <Route
              path="/tournament-setup"
              element={
                <TournamentsPage
                  currentUserProfile={currentUserProfile}
                  onTournamentActivity={refreshHomeActivity}
                  showSetupForm
                />
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
