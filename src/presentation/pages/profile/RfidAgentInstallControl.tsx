import { Button } from "../../components/Button";
import { SectionPanel } from "../../components/SectionPanel";
import { getRfidAgentInstallControlState } from "./rfidAgentInstall";

export function RfidAgentInstallControl({
  canManageMembers,
  fullWidth = false,
  onInstall,
  rfidReaderStatus,
}) {
  const controlState = getRfidAgentInstallControlState({
    canManageMembers,
    status: rfidReaderStatus,
  });

  if (!controlState.visible) {
    return null;
  }

  return (
    <SectionPanel className="profile-admin-panel" title="RFID reader">
      <div className="profile-rfid-agent-control">
        <p>
          Reader setup applies to this computer, not the selected member
          profile.
        </p>
        <p className="profile-card-issue-status" role="status">
          {controlState.statusMessage}
        </p>
        {controlState.showInstallButton ? (
          <Button type="button" fullWidth={fullWidth} onClick={onInstall}>
            Install RFID reader
          </Button>
        ) : null}
      </div>
    </SectionPanel>
  );
}
