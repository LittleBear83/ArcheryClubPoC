type EventHandler = (payload: unknown) => void;
type ConnectionState = "idle" | "connecting" | "open" | "error" | "closed";
type DiagnosticsListener = () => void;

export type EventStreamDiagnostics = {
  connectionState: ConnectionState;
  connectCount: number;
  errorCount: number;
  eventCount: number;
  lastEventAt: string | null;
  lastEventName: string | null;
};

export function createEventStreamClient(endpoint: string) {
  let eventSource: EventSource | null = null;
  const subscribers = new Map<string, Set<EventHandler>>();
  const eventListeners = new Map<string, EventListener>();
  const diagnosticsListeners = new Set<DiagnosticsListener>();
  let diagnostics: EventStreamDiagnostics = {
    connectionState: "idle",
    connectCount: 0,
    errorCount: 0,
    eventCount: 0,
    lastEventAt: null,
    lastEventName: null,
  };

  function notifyDiagnosticsListeners() {
    for (const listener of diagnosticsListeners) {
      listener();
    }
  }

  function updateDiagnostics(update: Partial<EventStreamDiagnostics>) {
    diagnostics = {
      ...diagnostics,
      ...update,
    };
    notifyDiagnosticsListeners();
  }

  function dispatchEvent(eventName: string, payload: unknown) {
    updateDiagnostics({
      eventCount: diagnostics.eventCount + 1,
      lastEventAt: new Date().toISOString(),
      lastEventName: eventName,
    });

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
        dispatchEvent(eventName, event.data ? JSON.parse(event.data) : null);
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

  return {
    connect() {
      if (eventSource || typeof window === "undefined") {
        return;
      }

      updateDiagnostics({
        connectionState: "connecting",
        connectCount: diagnostics.connectCount + 1,
      });
      eventSource = new EventSource(endpoint);
      eventSource.onopen = () => {
        updateDiagnostics({
          connectionState: "open",
        });
      };
      eventSource.onerror = () => {
        // Native EventSource reconnects automatically, so we keep the
        // connection object alive and let the browser retry.
        updateDiagnostics({
          connectionState: "error",
          errorCount: diagnostics.errorCount + 1,
        });
      };

      for (const eventName of subscribers.keys()) {
        attachEventListener(eventName);
      }
    },
    disconnect() {
      if (!eventSource) {
        return;
      }

      detachAllEventListeners();
      eventSource.close();
      eventSource = null;
      updateDiagnostics({
        connectionState: "closed",
      });
    },
    subscribe(eventName: string, handler: EventHandler) {
      const existingHandlers = subscribers.get(eventName) ?? new Set<EventHandler>();
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
    },
    getDiagnostics() {
      return diagnostics;
    },
    subscribeDiagnostics(listener: DiagnosticsListener) {
      diagnosticsListeners.add(listener);

      return () => {
        diagnosticsListeners.delete(listener);
      };
    },
  };
}
