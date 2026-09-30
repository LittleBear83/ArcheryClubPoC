export async function validateAssignedCaseForBeginnerConversion({
  caseId,
  equipmentGateway,
  caseEquipmentType,
  memberLocationType,
  memberUsername,
}) {
  const caseItem = await equipmentGateway.findEquipmentItemById(caseId);
  if (!caseItem || caseItem.equipment_type !== caseEquipmentType) {
    throw new Error("The assigned case could not be found.");
  }
  if (caseItem.status !== "active") {
    throw new Error("The assigned case is not active.");
  }
  if (caseItem.location_type === memberLocationType &&
      caseItem.location_member_username &&
      caseItem.location_member_username !== memberUsername) {
    throw new Error("The assigned case is already with another member.");
  }
  if (await equipmentGateway.findOpenEquipmentLoanByItemId(caseItem.id)) {
    throw new Error("The assigned case is already on loan.");
  }

  const caseContents = await equipmentGateway.listEquipmentItemsByCaseId(caseItem.id);
  for (const content of caseContents) {
    if (await equipmentGateway.findOpenEquipmentLoanByItemId(content.id)) {
      throw new Error("The assigned case contains equipment that is already on loan.");
    }
  }

  return { caseItem, caseContents };
}

export async function loanAssignedCaseForBeginnerConversion({
  caseId,
  equipmentGateway,
  caseEquipmentType,
  memberLocationType,
  memberUsername,
  actorUsername,
  convertedAtDate,
  convertedAtTime,
  expectedReturnDate,
  preparedCase,
}) {
  const { caseItem, caseContents } = preparedCase ?? await validateAssignedCaseForBeginnerConversion({
    caseId, equipmentGateway, caseEquipmentType, memberLocationType, memberUsername,
  });

  await equipmentGateway.createEquipmentLoan(
    caseItem.id, memberUsername, actorUsername, convertedAtDate,
    convertedAtTime, null, expectedReturnDate,
  );
  await equipmentGateway.updateEquipmentItemStorage({
    id: caseItem.id,
    locationType: memberLocationType,
    locationLabel: null,
    locationCaseId: null,
    locationMemberUsername: memberUsername,
    storageByUsername: actorUsername,
    storageAtDate: convertedAtDate,
    storageAtTime: convertedAtTime,
  });
  await equipmentGateway.updateEquipmentAssignmentMetadata({
    id: caseItem.id,
    assignedByUsername: actorUsername,
    assignedAtDate: convertedAtDate,
    assignedAtTime: convertedAtTime,
  });
  for (const content of caseContents) {
    await equipmentGateway.createEquipmentLoan(
      content.id, memberUsername, actorUsername, convertedAtDate,
      convertedAtTime, caseItem.id, expectedReturnDate,
    );
    await equipmentGateway.updateEquipmentAssignmentMetadata({
      id: content.id,
      assignedByUsername: actorUsername,
      assignedAtDate: convertedAtDate,
      assignedAtTime: convertedAtTime,
    });
  }
}
