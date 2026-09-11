import { subscribeToServerEvent } from "../lib/serverEvents";
import { subscribeToLocalRfidBridgeScans } from "./localRfidBridge";

const subscribers = new Set();
const statusSubscribers = new Set();

let latestLocalStatus = null;
let unsubscribeServerEvent = null;
let unsubscribeLocalBridge = null;

let lastServerSequence = 0;

let lastDeliveredTag = "";
let lastDeliveredAt = 0;

function deliverScan(scan) {
  if (!scan?.rfidTag) {
    return;
  }

  const rfidTag = String(scan.rfidTag).trim().toUpperCase();

  if (!rfidTag) {
    return;
  }

  const now = Date.now();

  // Prevent the same physical tap being emitted twice when two scan
  // transports happen to observe it at almost the same time.
  if (rfidTag === lastDeliveredTag && now - lastDeliveredAt < 1000) {
    return;
  }

  lastDeliveredTag = rfidTag;
  lastDeliveredAt = now;

  const normalisedScan = {
    ...scan,
    rfidTag,
  };

  for (const subscriber of subscribers) {
    subscriber(normalisedScan);
  }
}

function deliverLocalStatus(status) {
  latestLocalStatus = status;

  for (const subscriber of statusSubscribers) {
    subscriber(status);
  }
}

function startSources() {
  if (subscribers.size === 0) {
    return;
  }

  if (!unsubscribeServerEvent) {
    unsubscribeServerEvent = subscribeToServerEvent("rfid.scan", (scan) => {
      const sequence = Number(scan?.sequence ?? 0);

      if (!scan?.rfidTag || sequence <= lastServerSequence) {
        return;
      }

      lastServerSequence = sequence;

      deliverScan({
        ...scan,
        source: scan.source ?? "server",
      });
    });
  }

  if (!unsubscribeLocalBridge) {
    unsubscribeLocalBridge = subscribeToLocalRfidBridgeScans(
      (scan) => {
        if (!scan?.rfidTag) {
          return;
        }

        deliverScan(scan);
      },
      {
        onStatus: deliverLocalStatus,
      },
    );
  }
}

function stopSources() {
  if (subscribers.size > 0) {
    return;
  }

  if (unsubscribeServerEvent) {
    unsubscribeServerEvent();
    unsubscribeServerEvent = null;
  }

  if (unsubscribeLocalBridge) {
    unsubscribeLocalBridge();
    unsubscribeLocalBridge = null;
  }

  latestLocalStatus = null;
}

export function subscribeToRfidScans(listener, { onStatus } = {}) {
  subscribers.add(listener);

  if (typeof onStatus === "function") {
    statusSubscribers.add(onStatus);

    if (latestLocalStatus) {
      onStatus(latestLocalStatus);
    }
  }

  startSources();

  return () => {
    subscribers.delete(listener);

    if (typeof onStatus === "function") {
      statusSubscribers.delete(onStatus);
    }

    stopSources();
  };
}
