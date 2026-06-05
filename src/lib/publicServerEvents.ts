import { createEventStreamClient } from "./createEventStreamClient";

const publicServerEventsClient = createEventStreamClient("/api/public-events");

export const connectPublicServerEvents = () => publicServerEventsClient.connect();
export const disconnectPublicServerEvents = () => publicServerEventsClient.disconnect();
export const subscribeToPublicServerEvent = (
  eventName: string,
  handler: (payload: unknown) => void,
) => publicServerEventsClient.subscribe(eventName, handler);
