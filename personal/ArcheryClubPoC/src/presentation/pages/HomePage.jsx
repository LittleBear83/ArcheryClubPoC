import { useState } from "react";
import { useLocation, useNavigate, Routes, Route } from "react-router-dom";
import { useMembers } from "../state/useMembers";
import { SideDrawer } from "../components/SideDrawer";
import archeryBanner from "../../assets/archery_banner.svg";
import { HomeSection } from "./HomeSection";
import { LostAndFoundPage } from "./LostAndFoundPage";
import { FeedbackFormPage } from "./FeedbackFormPage";
import { IdeasFormPage } from "./IdeasFormPage";
import { EventCalendarPage } from "./EventCalendarPage";
import { CoachingCalendarPage } from "./CoachingCalendarPage";
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

export function HomePage({ getMembersUseCase, addMemberUseCase }) {
  const { members } = useMembers({
    getMembersUseCase,
    addMemberUseCase,
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const activePage = pathToPageId[location.pathname] || "home";

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
        <button className="menu-button" onClick={() => setDrawerOpen(true)}>
          ☰ Menu
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

          <Routes>
            <Route path="/" element={<HomeSection members={members} />} />
            <Route path="/event-calendar" element={<EventCalendarPage />} />
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
