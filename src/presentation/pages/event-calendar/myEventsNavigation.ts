export const MY_EVENTS_PATH = "/event-calendar?view=my-events";

export function isMyEventsView(params: URLSearchParams, signedIn: boolean) {
  return signedIn && params.get("view") === "my-events";
}

export function showMyEventsView(params: URLSearchParams) {
  const next = new URLSearchParams(params);
  next.set("view", "my-events");
  return next;
}

export function clearMyEventsView(params: URLSearchParams) {
  const next = new URLSearchParams(params);
  if (next.get("view") === "my-events") next.delete("view");
  return next;
}
