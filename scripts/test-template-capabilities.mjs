// Uses an existing Playwright installation without adding an application dependency.
// Set PLAYWRIGHT_MODULE_PATH to its index.mjs file URL if it is installed elsewhere.
// Set BROWSER_EXECUTABLE to use an installed Chromium/Edge executable.
import assert from "node:assert/strict";
import { createServer } from "vite";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const fixture = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '/src/theme/ThemeProvider.tsx';
import { TournamentsPage } from '/src/presentation/pages/TournamentsPage.tsx';
import { createAppDependencies } from '/src/bootstrap/createAppDependencies.ts';
import '/src/index.css';
import '/src/App.css';
const profile = { auth: { username: 'captain' }, membership: { role: 'general', permissions: ['manage_tournaments'] } };
createRoot(document.getElementById('root')).render(
  React.createElement(ThemeProvider, null,
    React.createElement(TournamentsPage, { currentUserProfile: profile, showSetupForm: true, tournamentCrud: createAppDependencies() })
  )
);
`;
const server = await createServer({
  server: { host: "127.0.0.1", port: 5199, open: false },
  plugins: [{
    name: "template-capability-test",
    resolveId(id) { if (id === "virtual:template-test") return "\0template-test"; },
    load(id) { if (id === "\0template-test") return fixture; },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/__template-test.html")) return next();
        res.setHeader("Content-Type", "text/html");
        res.end(await vite.transformIndexHtml(req.url, '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">import "virtual:template-test";</script></body></html>'));
      });
    },
  }],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined });
  for (const width of [360, 390, 412, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.setDefaultTimeout(30000);
    const errors = [];
    const writes = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const templates = [{
      key: "standard-knockout", label: "Standard Knockout", tournamentType: "head-to-head",
      format: "knockout", roundType: "head-to-head", defaults: {}, capabilities: { supportsRandomizedDraw: false },
    }];
    await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/auth/csrf") return route.fulfill({ json: { success: true, csrfToken: "test-only" } });
      if (path === "/api/tournaments" && request.method() === "GET") {
        return route.fulfill({ json: { success: true, tournaments: [], tournamentTemplates: templates, tournamentTypes: [{ value: "head-to-head", label: "Head to head" }] } });
      }
      if (path.startsWith("/api/tournament-templates") && ["POST", "PUT"].includes(request.method())) {
        const payload = request.postDataJSON();
        writes.push({ method: request.method(), path, payload });
        const key = request.method() === "POST" ? "test-template" : decodeURIComponent(path.split("/").at(-1));
        const base = templates.find((template) => template.key === payload.baseTemplateKey);
        const saved = { ...base, ...payload, key, isCustom: true };
        const index = templates.findIndex((template) => template.key === key);
        if (index < 0) templates.push(saved); else templates[index] = saved;
        return route.fulfill({ json: { success: true, tournamentTemplate: saved, tournamentTemplates: templates } });
      }
      errors.push(`Unexpected API request: ${request.method()} ${path}`);
      return route.fulfill({ status: 500, json: { success: false } });
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__template-test.html`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.getByRole("button", { name: "Create template", exact: true }).click();
    let modal = page.getByRole("dialog", { name: "Create Tournament Template", exact: true });
    await modal.waitFor();
    const checkbox = modal.getByRole("checkbox", { name: "Randomise every round", exact: true });
    assert.equal(await page.getByRole("checkbox", { name: "Randomise every round", exact: true }).count(), 1);
    assert.ok(!(await checkbox.isChecked()), "Old template defaults to false");
    const group = modal.locator(".tournament-template-option-group").filter({ hasText: "Capabilities" });
    assert.equal(await group.getByRole("checkbox", { name: "Randomise every round", exact: true }).count(), 1);
    const styles = await group.locator(".tournament-template-checkbox").evaluateAll((labels) => labels.map((label) => {
      const style = getComputedStyle(label);
      const input = label.querySelector('input');
      const text = label.querySelector('span');
      const box = label.getBoundingClientRect();
      const inputBox = input.getBoundingClientRect();
      const textBox = text.getBoundingClientRect();
      return {
        layout: [style.display, style.alignItems, style.gap, style.padding, getComputedStyle(text).font, getComputedStyle(input).appearance],
        aligned: Math.abs(inputBox.y + inputBox.height / 2 - textBox.y - textBox.height / 2) < 1,
        contained: box.x >= 0 && box.right <= innerWidth && inputBox.width === 18,
      };
    }));
    for (const style of styles) {
      assert.deepEqual(style.layout, styles[0].layout, "All capabilities use matching typography and spacing");
      assert.ok(style.aligned && style.contained, `Misaligned or clipped capability at ${width}px`);
    }
    assert.ok(await modal.evaluate((element) => element.scrollWidth <= element.clientWidth));
    await checkbox.check();
    assert.ok(await checkbox.isChecked());
    assert.ok(!(await modal.getByRole("checkbox", { name: "Randomised draw", exact: true }).isChecked()), "Settings are independent");
    await modal.getByLabel("Template name", { exact: true }).fill("Test template");
    await modal.getByRole("button", { name: "Save template", exact: true }).click();
    await modal.waitFor({ state: "detached" });
    assert.equal(writes[0].method, "POST");
    assert.equal(writes[0].payload.capabilities.randomiseEveryRound, true);
    await page.reload();
    await page.getByRole("button", { name: "Edit template", exact: true }).click();
    modal = page.getByRole("dialog", { name: "Edit Tournament Template", exact: true });
    await modal.waitFor();
    const templateSelect = modal.locator("label").filter({ hasText: /^Template/ }).locator("select");
    await templateSelect.selectOption("test-template");
    const editCheckbox = modal.getByRole("checkbox", { name: "Randomise every round", exact: true });
    assert.ok(await editCheckbox.isChecked(), "Saved value loads on edit after reload");
    await editCheckbox.uncheck();
    await modal.getByRole("button", { name: "Save template", exact: true }).click();
    await modal.waitFor({ state: "detached" });
    assert.equal(writes[1].method, "PUT");
    assert.equal(writes[1].path, "/api/tournament-templates/test-template");
    assert.equal(writes[1].payload.capabilities.randomiseEveryRound, false);
    await page.getByRole("button", { name: "Edit template", exact: true }).click();
    await modal.locator("label").filter({ hasText: /^Template/ }).locator("select").selectOption("test-template");
    assert.ok(!(await editCheckbox.isChecked()), "Updated false value loads correctly");
    await modal.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Create tournament", exact: true }).click();
    assert.equal(await page.getByRole("checkbox", { name: "Randomise every round", exact: true }).count(), 0, "Ordinary tournament creation has no duplicate control");
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS template capability create/edit/save/load and alignment: ${width}px`);
  }
} finally {
  await browser?.close();
  await server.close();
}
