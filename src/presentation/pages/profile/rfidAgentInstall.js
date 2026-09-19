export const RFID_AGENT_DOWNLOAD_PATH =
  "/api/admin/rfid-agent/download/latest";

export function getRfidAgentInstallControlState({
  canManageMembers,
  status,
}) {
  if (!canManageMembers) {
    return {
      visible: false,
      statusMessage: "",
      showInstallButton: false,
    };
  }

  const connectionState = status?.connectionState;

  return {
    visible: true,
    statusMessage:
      connectionState === "connected"
        ? "RFID reader connected"
        : connectionState === "reader-not-connected"
          ? "RFID reader not connected"
          : connectionState === "local-access-blocked"
            ? "Browser access to the local RFID agent is blocked"
            : connectionState === "agent-unavailable"
              ? "RFID agent unavailable"
              : "Checking RFID reader...",
    showInstallButton: connectionState === "agent-unavailable",
  };
}

export function canStartRfidAgentInstall({
  canManageMembers,
  readerConnectedConfirmed,
}) {
  return Boolean(canManageMembers && readerConnectedConfirmed);
}

export function startRfidAgentInstallerDownload({
  documentObject = document,
} = {}) {
  const downloadLink = documentObject.createElement("a");
  downloadLink.href = RFID_AGENT_DOWNLOAD_PATH;
  downloadLink.download = "";
  downloadLink.hidden = true;
  downloadLink.setAttribute("aria-hidden", "true");
  documentObject.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
}
