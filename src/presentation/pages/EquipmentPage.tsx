import { useIsMobile } from "../hooks/useIsMobile";
import { EquipmentCaseAssignmentModal } from "./equipment/EquipmentCaseAssignmentModal";
import { EquipmentDesktopView } from "./equipment/EquipmentDesktopView";
import { EquipmentMobileView } from "./equipment/EquipmentMobileView";
import { useEquipmentPageState } from "./equipment/useEquipmentPageState";

export function EquipmentPage({ currentUserProfile, equipmentCrud }) {
  const isMobile = useIsMobile();
  const equipmentPageState = useEquipmentPageState({
    currentUserProfile,
    equipmentCrud,
  });

  if (!equipmentPageState.canAccessEquipment) {
    return <p>You do not have permission to manage equipment.</p>;
  }

  return (
    <>
      {isMobile ? (
        <EquipmentMobileView {...equipmentPageState} />
      ) : (
        <EquipmentDesktopView {...equipmentPageState} />
      )}

      <EquipmentCaseAssignmentModal {...equipmentPageState} />
    </>
  );
}
