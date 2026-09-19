// Run with an existing Playwright installation; no application dependency is needed.
// PLAYWRIGHT_MODULE_PATH may be a file URL to playwright/index.mjs.
// BROWSER_EXECUTABLE may select an installed Chromium/Edge browser.
import assert from "node:assert/strict";
import { createServer } from "vite";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const fixture = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '/src/theme/ThemeProvider.tsx';
import { AskQuestionPage } from '/src/presentation/pages/AskQuestionPage.tsx';
import { FeedbackFormPage } from '/src/presentation/pages/FeedbackFormPage.tsx';
import { EventCalendarPage } from '/src/presentation/pages/EventCalendarPage.tsx';
import { AnnouncementsPage } from '/src/presentation/pages/AnnouncementsPage.tsx';
import '/src/index.css';
import '/src/App.css';
const pages = { questions: AskQuestionPage, suggestions: FeedbackFormPage, calendar: EventCalendarPage, announcements: AnnouncementsPage };
const profile = { auth: { username: 'ui-test' }, membership: { role: 'general', permissions: ['manage_announcements'] } };
createRoot(document.getElementById('root')).render(
  React.createElement(ThemeProvider, null,
    React.createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      React.createElement(BrowserRouter, null,
        React.createElement('main', { style: { padding: 16, width: '100%' } },
          React.createElement(pages[new URLSearchParams(location.search).get('page')], { currentUserProfile: profile })
        )
      )
    )
  )
);
`;
const server = await createServer({
  server: { host: "127.0.0.1", port: 5199, open: false },
  plugins: [{
    name: "urgent-ui-test-fixture",
    resolveId(id) { if (id === "virtual:urgent-ui") return "\0urgent-ui"; },
    load(id) { if (id === "\0urgent-ui") return fixture; },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/__urgent-ui.html")) return next();
        res.setHeader("Content-Type", "text/html");
        res.end(await vite.transformIndexHtml(req.url, '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">import "virtual:urgent-ui";</script></body></html>'));
      });
    },
  }],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined });
  const base = `http://127.0.0.1:${server.httpServer.address().port}/__urgent-ui.html`;
  for (const width of [360, 390, 412, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.setFixedTime(new Date("2026-09-19T12:00:00Z"));
    await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const common = { id: 1, status: "new", createdAtDate: "2026-09-19", createdAtTime: "12:00:00" };
      const lessons = ["have-a-go", "taster-session", "beginners"].map((courseType, index) => ({
        id: `${courseType}-course-${index + 1}-lesson-${index + 1}`,
        courseId: index + 1, lessonId: index + 1, courseType,
        title: ["Have a Go session", "Taster session", "Beginners course"][index],
        date: index === 2 ? "2026-09-07" : "2026-09-19", startTime: "19:00", endTime: "21:00", lessonNumber: 1,
        coordinatorName: "Test Coordinator", coachNames: ["Test Coach"], beginnerCount: 2, beginnerCapacity: 8,
      }));
      const bodies = {
        "/api/member-questions/mine": { questions: [{ ...common, questionTitle: "Question " + "x".repeat(100) }] },
        "/api/suggestions/mine": { suggestions: [{ ...common, suggestionTitle: "Suggestion " + "x".repeat(100) }] },
        "/api/events": { events: [] },
        "/api/coaching-sessions": { sessions: [] },
        "/api/beginners-courses/calendar": { lessons },
        "/api/announcements": { announcements: [] },
      };
      assert.ok(pathname in bodies, `Unexpected API request: ${pathname}`);
      await route.fulfill({ json: { success: true, ...bodies[pathname] } });
    });
    const noOverflow = async () => {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Page overflow at ${width}`);
    };
    for (const name of ["questions", "suggestions"]) {
      await page.goto(`${base}?page=${name}`);
      await page.locator(".suggestion-member-history-row").waitFor();
      const form = await page.locator(".utility-form-card").boundingBox();
      const history = await page.locator(".suggestion-member-history").boundingBox();
      assert.ok(history.x >= 0 && history.x + history.width <= width, `${name}: clipped history`);
      assert.ok(form.width >= (width < 900 ? width - 34 : 400), `${name}: collapsed form at ${width}`);
      if (width < 900) assert.ok(history.y >= form.y + form.height, `${name}: overlapping sections`);
      else assert.ok(history.x >= form.x + form.width, `${name}: desktop columns regressed`);
      for (const control of await page.locator(".utility-form-card input, .utility-form-card textarea").all()) {
        const box = await control.boundingBox();
        assert.ok(box.width > 240 && box.x + box.width <= form.x + form.width, `${name}: collapsed/overflowing input`);
      }
      assert.ok(await page.locator('.utility-form-card button[type="submit"]').evaluate((button) =>
        button.scrollWidth <= button.clientWidth && button.getBoundingClientRect().width >= 120
      ), `${name}: malformed submit button`);
      await noOverflow();
    }
    await page.goto(`${base}?page=calendar`);
    if (width < 900) {
      await page.locator(".event-mobile-agenda-card").first().waitFor();
      assert.equal(await page.locator(".event-mobile-agenda-card").count(), 3);
      assert.equal(await page.locator(".event-summary-panel").count(), 0, "Agenda must not repeat the selected-day cards");
      for (const title of ["Have a Go session", "Taster session", "Beginners course"]) {
        assert.equal(await page.getByText(title, { exact: true }).count(), 1, `${title} rendered more than once`);
      }
      await page.locator(".event-mobile-agenda-card").filter({ hasText: "Have a Go session" }).getByRole("button").click();
      await page.getByRole("region", { name: "Selected day", exact: true }).waitFor();
      assert.equal(await page.locator(".event-mobile-agenda-card").count(), 0);
      assert.equal(await page.locator(".event-summary-panel .event-summary-card").count(), 2);
      assert.equal(await page.locator("h3:focus").textContent(), "Selected day");
      await page.getByRole("button", { name: "Back to month agenda" }).click();
      await page.locator(".event-mobile-agenda-card").first().waitFor();
      assert.equal(await page.locator(".event-mobile-agenda-card").count(), 3);
      await page.locator(".event-mobile-agenda-card").filter({ hasText: "Beginners course" }).getByRole("button").click();
      assert.equal(await page.locator(".event-summary-panel .event-summary-card").count(), 1);
      assert.ok((await page.locator(".event-summary-panel").textContent()).includes("07/09/2026"));
    } else {
      await page.locator(".calendar-table").waitFor();
      assert.equal(await page.locator(".event-mobile-agenda-card").count(), 0);
    }
    await noOverflow();
    await page.goto(`${base}?page=announcements`);
    const yes = page.getByRole("radio", { name: "Yes", exact: true });
    const no = page.getByRole("radio", { name: "No", exact: true });
    await yes.waitFor();
    const yesBox = await yes.boundingBox();
    const noBox = await no.boundingBox();
    assert.ok(Math.abs(yesBox.y - noBox.y) <= 1 && noBox.x > yesBox.x, "Severity choices must be side by side");
    await yes.check();
    assert.ok(await yes.isChecked());
    assert.ok(!(await no.isChecked()));
    await no.check();
    assert.ok(await no.isChecked());
    assert.ok(!(await yes.isChecked()));
    assert.equal(await page.getByRole("radiogroup", { name: "Increase severity as the active till date gets closer" }).count(), 1);
    await noOverflow();
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS responsive forms, calendar identities/day navigation, severity choices: ${width}px`);
  }
} finally {
  await browser?.close();
  await server.close();
}
