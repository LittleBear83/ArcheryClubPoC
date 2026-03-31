import { useEffect, useState } from "react";
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
import { RangeUsagePage } from "./RangeUsagePage";
import { PlaceholderPage } from "./PlaceholderPage";

const pageTitleMap = {
  home: "Home",
  "event-calendar": "Event/Competition Calendar",
  "range-usage": "Range Usage",
  "feedback-form": "Feedback Form",
  "ideas-form": "Ideas Form",
  "coaching-calendar": "Coaching Calendar",
  "committee-org-chart": "Committee Org Chart",
  "general-info": "General Info",
  "lost-and-found": "Lost and Found",
};

const pathToPageId = {
  "/": "home",
  "/event-calendar": "event-calendar",
  "/range-usage": "range-usage",
  "/feedback-form": "feedback-form",
  "/ideas-form": "ideas-form",
  "/coaching-calendar": "coaching-calendar",
  "/committee-org-chart": "committee-org-chart",
  "/general-info": "general-info",
  "/lost-and-found": "lost-and-found",
};

const pageIdToPath = Object.entries(pathToPageId).reduce(
  (acc, [path, id]) => ({ ...acc, [id]: path }),
  {},
);

const signedUpEventsByUser = {
  Cfleetham: [
    { id: "cf-1", date: "2026-04-06", title: "County Outdoor Practice" },
    { id: "cf-2", date: "2026-04-12", title: "York Handicap Shoot" },
    { id: "cf-3", date: "2026-04-26", title: "Club Spring Open" },
  ],
  LTaylor: [
    { id: "lt-1", date: "2026-04-04", title: "Coaches Planning Session" },
    { id: "lt-2", date: "2026-04-19", title: "Regional Field Shoot" },
  ],
  "guest": [
    { id: "guest-1", date: "2026-04-10", title: "Beginner Welcome Session" },
  ],
};

export function HomePage({ currentUser, onLogout }) {
  const [members, setMembers] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const activePage = pathToPageId[location.pathname] || "home";
  const membersAtRange = currentUser
    ? (() => {
        const currentMember = {
          username: currentUser.username,
          firstName: currentUser.firstName,
          surname: currentUser.surname,
          archeryGbMembershipNumber: currentUser.archeryGbMembershipNumber,
          userType: currentUser.userType,
        };

        const alreadyIncluded = members.some((member) => {
          if (currentMember.username && member.username) {
            return member.username === currentMember.username;
          }

          return (
            member.firstName === currentMember.firstName &&
            member.surname === currentMember.surname &&
            member.archeryGbMembershipNumber ===
              currentMember.archeryGbMembershipNumber
          );
        });

        return alreadyIncluded ? members : [currentMember, ...members];
      })()
    : members;
  const signedUpEvents = [...(signedUpEventsByUser[currentUser?.username] ??
    signedUpEventsByUser[currentUser?.userType] ??
    [])].sort((left, right) => left.date.localeCompare(right.date));

  useEffect(() => {
    let isMounted = true;

    const loadRangeMembers = async () => {
      try {
        const response = await fetch("/api/range-members");
        const result = await response.json();

        if (!response.ok || !result.success) {
          return;
        }

        if (isMounted) {
          setMembers(result.members);
        }
      } catch {
        if (isMounted) {
          setMembers([]);
        }
      }
    };

    loadRangeMembers();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleNavigate = (pageId) => {
    const target = pageIdToPath[pageId] || "/";
    navigate(target);
  };

  return (
    <>
      <SideDrawer
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

      <main
        style={{
          maxWidth: 900,
          margin: "0 auto",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <section style={{ marginBottom: 24 }}>
          <h2>{pageTitleMap[activePage] || "Archery Club"}</h2>
          {activePage === "home" ? (
            <p className="welcome-message">
              Welcome {currentUser?.firstName} {currentUser?.surname}
            </p>
          ) : null}

          <Routes>
            <Route
              path="/"
              element={
                <HomeSection
                  members={membersAtRange}
                  signedUpEvents={signedUpEvents}
                />
              }
            />
            <Route path="/event-calendar" element={<EventCalendarPage />} />
            <Route path="/range-usage" element={<RangeUsagePage />} />
            <Route
              path="/coaching-calendar"
              element={<CoachingCalendarPage />}
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
