import assert from "node:assert/strict";
import test from "node:test";

import {
  RFID_AGENT_DOWNLOAD_PATH,
  canStartRfidAgentInstall,
  getRfidAgentInstallControlState,
  startRfidAgentInstallerDownload,
} from "./rfidAgentInstall.js";

test("RFID agent installation requires permission and reader confirmation", () => {
  assert.equal(
    canStartRfidAgentInstall({
      canManageMembers: true,
      readerConnectedConfirmed: false,
    }),
    false,
  );
  assert.equal(
    canStartRfidAgentInstall({
      canManageMembers: false,
      readerConnectedConfirmed: true,
    }),
    false,
  );
  assert.equal(
    canStartRfidAgentInstall({
      canManageMembers: true,
      readerConnectedConfirmed: true,
    }),
    true,
  );
});

test("RFID agent installation control is hidden from users without manage_members", () => {
  assert.deepEqual(
    getRfidAgentInstallControlState({
      canManageMembers: false,
      status: { connectionState: "agent-unavailable" },
    }),
    {
      visible: false,
      statusMessage: "",
      showInstallButton: false,
    },
  );
});

test("RFID agent installation control distinguishes agent and reader states", () => {
  assert.deepEqual(
    getRfidAgentInstallControlState({
      canManageMembers: true,
      status: { connectionState: "agent-unavailable" },
    }),
    {
      visible: true,
      statusMessage: "RFID agent unavailable",
      showInstallButton: true,
    },
  );
  const readerNotConnectedState = getRfidAgentInstallControlState({
    canManageMembers: true,
    status: { connectionState: "reader-not-connected" },
  });
  assert.equal(
    readerNotConnectedState.statusMessage,
    "RFID reader not connected",
  );
  assert.equal(readerNotConnectedState.showInstallButton, false);

  const connectedState = getRfidAgentInstallControlState({
    canManageMembers: true,
    status: { connectionState: "connected" },
  });
  assert.equal(connectedState.statusMessage, "RFID reader connected");
  assert.equal(connectedState.showInstallButton, false);

  const blockedState = getRfidAgentInstallControlState({
    canManageMembers: true,
    status: { connectionState: "local-access-blocked" },
  });
  assert.equal(
    blockedState.statusMessage,
    "Browser access to the local RFID agent is blocked",
  );
  assert.equal(blockedState.showInstallButton, false);
});

test("RFID agent installer download uses the authenticated same-origin endpoint", () => {
  let clicked = false;
  let removed = false;
  let appendedElement = null;
  const attributes = new Map();
  const downloadLink = {
    href: "",
    download: null,
    hidden: false,
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    click() {
      clicked = true;
    },
    remove() {
      removed = true;
    },
  };
  const documentObject = {
    createElement(tagName) {
      assert.equal(tagName, "a");
      return downloadLink;
    },
    body: {
      appendChild(element) {
        appendedElement = element;
      },
    },
  };

  startRfidAgentInstallerDownload({ documentObject });

  assert.equal(downloadLink.href, RFID_AGENT_DOWNLOAD_PATH);
  assert.equal(downloadLink.href, "/api/admin/rfid-agent/download/latest");
  assert.equal(downloadLink.href.includes("storage.googleapis.com"), false);
  assert.equal(downloadLink.download, "");
  assert.equal(downloadLink.hidden, true);
  assert.equal(attributes.get("aria-hidden"), "true");
  assert.equal(appendedElement, downloadLink);
  assert.equal(clicked, true);
  assert.equal(removed, true);
});
