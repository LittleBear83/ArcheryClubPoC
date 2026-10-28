import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { HomeSection } from "./HomeSection";

function renderHome(hideEventPanels = false) {
  return renderToStaticMarkup(<MemoryRouter>
    <HomeSection
      members={[]}
      signedUpEvents={[{ id: 1, date: "2099-11-15", startTime: "10:00", title: "Club shoot" }]}
      tournamentReminders={[]}
      lostArrows={[]}
      beginnerCoachAssignments={[]}
      beginnerDashboard={null}
      hideEventPanels={hideEventPanels}
      onOpenGuestLogin={() => {}}
      onOpenLostAndFound={() => {}}
      onOpenApprovals={() => {}}
      onOpenBeginnersCourses={() => {}}
      onOpenHaveAGoSessions={() => {}}
      onOpenTasterSessions={() => {}}
    />
  </MemoryRouter>);
}

test("the entire existing events card links to My Events and retains its contents", () => {
  const html = renderHome();
  assert.match(html, /<a[^>]*class="home-panel home-panel--interactive"[^>]*href="\/event-calendar\?view=my-events"/);
  assert.match(html, /aria-label="Open My Events in the club calendar"/);
  assert.match(html, /Your Club Events List/);
  assert.match(html, /Club shoot/);
});

test("the event card remains hidden for restricted programme members", () => {
  assert.doesNotMatch(renderHome(true), /Your Club Events List/);
});
