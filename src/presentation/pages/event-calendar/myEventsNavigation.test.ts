import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryRouter } from "react-router-dom";
import {
  clearMyEventsView, isMyEventsView, MY_EVENTS_PATH, showMyEventsView,
} from "./myEventsNavigation.ts";

test("direct and refreshed My Events URLs open only for signed-in members", () => {
  const params = new URLSearchParams("view=my-events");
  assert.equal(isMyEventsView(params, true), true);
  assert.equal(isMyEventsView(new URLSearchParams(params), true), true);
  assert.equal(isMyEventsView(params, false), false);
  assert.equal(isMyEventsView(new URLSearchParams(), true), false);
  assert.equal(isMyEventsView(new URLSearchParams("view=other"), true), false);
});

test("opening and closing preserve unrelated query parameters", () => {
  const original = new URLSearchParams("source=home");
  const open = showMyEventsView(original);
  assert.equal(open.get("view"), "my-events");
  assert.equal(open.get("source"), "home");
  assert.equal(original.has("view"), false);
  const closed = clearMyEventsView(open);
  assert.equal(closed.get("source"), "home");
  assert.equal(closed.has("view"), false);
  assert.equal(clearMyEventsView(new URLSearchParams("view=other")).get("view"), "other");
});

test("home shortcut, Back, close replacement and repeated navigation retain history", async () => {
  const router = createMemoryRouter([
    { path: "/", element: null },
    { path: "/event-calendar", element: null },
  ], { initialEntries: ["/"] });
  await router.navigate(MY_EVENTS_PATH);
  assert.equal(router.state.location.pathname + router.state.location.search, MY_EVENTS_PATH);
  await router.navigate(-1);
  assert.equal(router.state.location.pathname, "/");
  await router.navigate(MY_EVENTS_PATH);
  await router.navigate("/event-calendar", { replace: true });
  assert.equal(router.state.location.pathname + router.state.location.search, "/event-calendar");
  await router.navigate(-1);
  assert.equal(router.state.location.pathname, "/");
  await router.navigate(MY_EVENTS_PATH);
  assert.equal(router.state.location.search, "?view=my-events");
  router.dispose();
});
