import { subscribeToServerEvent } from "../lib/serverEvents";

const subscribers = new Set();
let unsubscribeServerEvent = null;
let lastSequence = 0;

function startPolling() {
  if (unsubscribeServerEvent || subscribers.size === 0) {
    return;
  }

  unsubscribeServerEvent = subscribeToServerEvent("rfid.scan", (scan) => {
    if (!scan?.rfidTag || scan.sequence <= lastSequence) {
      return;
    }

    lastSequence = scan.sequence;

    for (const subscriber of subscribers) {
      subscriber(scan);
    }
  });
}

function stopPolling() {
  if (subscribers.size > 0) {
    return;
  }

  if (unsubscribeServerEvent) {
    unsubscribeServerEvent();
    unsubscribeServerEvent = null;
  }
}

export function subscribeToRfidScans(listener) {
  subscribers.add(listener);
  startPolling();

  return () => {
    subscribers.delete(listener);
    stopPolling();
  };
}
