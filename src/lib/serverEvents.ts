import { createEventStreamClient } from "./createEventStreamClient";

const serverEventsClient = createEventStreamClient("/api/events");

export const connectServerEvents = () => serverEventsClient.connect();
export const disconnectServerEvents = () => serverEventsClient.disconnect();
export const subscribeToServerEvent = (eventName: string, handler: (payload: unknown) => void) =>
  serverEventsClient.subscribe(eventName, handler);
export const getServerEventDiagnostics = () => serverEventsClient.getDiagnostics();
export const subscribeToServerEventDiagnostics = (listener: () => void) =>
  serverEventsClient.subscribeDiagnostics(listener);
