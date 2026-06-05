type ServerEventHandler = (payload: unknown) => void;

let eventSource: EventSource | null = null;
const subscribers = new Map<string, Set<ServerEventHandler>>();
const eventListeners = new Map<string, EventListener>();

function dispatchEvent(eventName: string, payload: unknown) {
  const handlers = subscribers.get(eventName);

  if (!handlers) {
    return;
  }

  for (const handler of handlers) {
    handler(payload);
  }
}

function createEventListener(eventName: string) {
  return (event: Event) => {
    if (!(event instanceof MessageEvent)) {
      return;
    }

    try {
      dispatchEvent(
        eventName,
        event.data ? JSON.parse(event.data) : null,
      );
    } catch {
      dispatchEvent(eventName, event.data ?? null);
    }
  };
}

function attachEventListener(eventName: string) {
  if (!eventSource || eventListeners.has(eventName)) {
    return;
  }

  const listener = createEventListener(eventName);
  eventListeners.set(eventName, listener);
  eventSource.addEventListener(eventName, listener);
}

function detachAllEventListeners() {
  if (!eventSource) {
    eventListeners.clear();
    return;
  }

  for (const [eventName, listener] of eventListeners.entries()) {
    eventSource.removeEventListener(eventName, listener);
  }

  eventListeners.clear();
}

export function connectServerEvents() {
  if (eventSource || typeof window === "undefined") {
    return;
  }

  eventSource = new EventSource("/api/events");
  eventSource.onerror = () => {
    // Native EventSource reconnects automatically, so we only keep the
    // connection object alive and let the browser retry.
  };

  for (const eventName of subscribers.keys()) {
    attachEventListener(eventName);
  }
}

export function disconnectServerEvents() {
  if (!eventSource) {
    return;
  }

  detachAllEventListeners();
  eventSource.close();
  eventSource = null;
}

export function subscribeToServerEvent(
  eventName: string,
  handler: ServerEventHandler,
) {
  const existingHandlers = subscribers.get(eventName) ?? new Set<ServerEventHandler>();
  existingHandlers.add(handler);
  subscribers.set(eventName, existingHandlers);
  attachEventListener(eventName);

  return () => {
    const currentHandlers = subscribers.get(eventName);

    if (!currentHandlers) {
      return;
    }

    currentHandlers.delete(handler);

    if (currentHandlers.size === 0) {
      subscribers.delete(eventName);

      if (eventSource) {
        const listener = eventListeners.get(eventName);

        if (listener) {
          eventSource.removeEventListener(eventName, listener);
          eventListeners.delete(eventName);
        }
      }
    }
  };
}
