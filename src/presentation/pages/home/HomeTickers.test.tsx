import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { AnnouncementRecord } from "../../../api/announcementApi";
import { HomeTickers } from "./HomeTickers";
import { getAnnouncementTickerState, getHomeTickerMessage } from "./homeTickerUtils";

test("announcement rows keep severity order and desktop ticker repeats only decorative text", () => {
  const announcements = [
    { severity: "information", message: "Club news", escalateSeverity: false },
    { severity: "urgent_important", message: "Range closed", escalateSeverity: false },
  ] as AnnouncementRecord[];
  const rows = getAnnouncementTickerState(announcements);
  assert.deepEqual(rows.map((row) => row.tone), ["red", "green"]);
  const props = {
    announcementTicker: rows,
    homeTickerMessage: "Membership reminder",
    lostArrowNoticeMessages: ["Arrow found"],
    adminTournamentWarnings: ["Registration closes"],
  };
  const desktop = renderToStaticMarkup(<HomeTickers {...props} isMobile={false} />);
  const mobile = renderToStaticMarkup(<HomeTickers {...props} isMobile />);
  assert.match(desktop, /announcement-ticker--red/);
  assert.equal((desktop.match(/Range closed/g) ?? []).length, 2);
  assert.equal((mobile.match(/Range closed/g) ?? []).length, 1);
  assert.match(mobile, /membership-reminder-ticker--mobile/);
  assert.match(mobile, /Arrow found/);
  assert.match(mobile, /Registration closes/);
});

test("safety reminder remains visible when no membership fee reminder applies", () => {
  assert.match(getHomeTickerMessage(null, { showSafetyMessage: true }), /safety talk/);
  assert.equal(getHomeTickerMessage(null, null), "");
});
