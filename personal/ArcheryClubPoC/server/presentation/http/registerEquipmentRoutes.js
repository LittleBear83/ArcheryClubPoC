export function registerEquipmentRoutes({
  actorHasPermission,
  app,
  buildEquipmentCaseResponse,
  buildEquipmentItemResponse,
  buildEquipmentMaps,
  countEquipmentItemsByStorageLocation,
  deleteEquipmentStorageLocation,
  db,
  DEFAULT_EQUIPMENT_CUPBOARD_LABEL,
  EQUIPMENT_LOCATION_TYPES,
  EQUIPMENT_SIZE_CATEGORIES,
  EQUIPMENT_TYPES,
  EQUIPMENT_TYPE_LABELS,
  EQUIPMENT_TYPE_OPTIONS,
  findEquipmentItemById,
  findEquipmentItemByIdWithRelations,
  findEquipmentStorageLocationByLabel,
  findOpenEquipmentLoanByItemId,
  findUserByUsername,
  getActorUser,
  getUtcTimestampParts,
  insertEquipmentItem,
  insertEquipmentLoan,
  insertEquipmentStorageLocation,
  listAllUsers,
  listEquipmentItemsByCaseId,
  listEquipmentStorageLocations,
  listOpenEquipmentLoansByCaseId,
  listOpenEquipmentLoansByMemberUserId,
  PERMISSIONS,
  sanitizeCupboardLabel,
  sanitizeEquipmentCreatePayload,
  updateEquipmentAssignmentMetadata,
  updateEquipmentItemForDecommission,
  updateEquipmentItemStorage,
  validateCaseAssignment,
  closeEquipmentLoan,
}) {
  const getStorageLocationOptions = () => {
    const labels = listEquipmentStorageLocations.all().map((row) => row.label);

    if (labels.includes(DEFAULT_EQUIPMENT_CUPBOARD_LABEL)) {
      return labels;
    }

    return [DEFAULT_EQUIPMENT_CUPBOARD_LABEL, ...labels];
  };

  const assertStorageLocationExists = (label, res) => {
    if (!findEquipmentStorageLocationByLabel.get(label)) {
      res.status(400).json({
        success: false,
        message: "Choose a valid equipment storage location.",
      });
      return false;
    }

    return true;
  };

  app.get("/api/equipment/dashboard", (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const permissions = {
      canAddDecommissionEquipment: actorHasPermission(
        actor,
        PERMISSIONS.ADD_DECOMMISSION_EQUIPMENT,
      ),
      canAssignEquipment: actorHasPermission(actor, PERMISSIONS.ASSIGN_EQUIPMENT),
      canReturnEquipment: actorHasPermission(actor, PERMISSIONS.RETURN_EQUIPMENT),
      canUpdateEquipmentStorage: actorHasPermission(
        actor,
        PERMISSIONS.UPDATE_EQUIPMENT_STORAGE,
      ),
      canManageEquipmentStorageLocations: actorHasPermission(
        actor,
        PERMISSIONS.MANAGE_EQUIPMENT_STORAGE_LOCATIONS,
      ),
    };

    if (!Object.values(permissions).some(Boolean)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to manage equipment.",
      });
      return;
    }

    const maps = buildEquipmentMaps();
    const cases = maps.items
      .filter((item) => item.equipment_type === EQUIPMENT_TYPES.CASE)
      .map((item) => buildEquipmentCaseResponse(item, maps));
    const items = maps.items.map((item) => buildEquipmentItemResponse(item, maps));

    res.json({
      success: true,
      permissions,
      members: listAllUsers.all().map((user) => ({
        username: user.username,
        fullName: `${user.first_name} ${user.surname}`,
        userType: user.user_type,
      })),
      equipmentTypeOptions: EQUIPMENT_TYPE_OPTIONS.map((value) => ({
        value,
        label: EQUIPMENT_TYPE_LABELS[value],
      })),
      sizeCategoryOptions: EQUIPMENT_SIZE_CATEGORIES.map((value) => ({
        value,
        label: value === "junior" ? "Junior" : "Standard",
      })),
      cupboardOptions: getStorageLocationOptions(),
      items,
      cases,
    });
  });

  app.post("/api/equipment/items", (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.ADD_DECOMMISSION_EQUIPMENT)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to add equipment.",
      });
      return;
    }

    const sanitized = sanitizeEquipmentCreatePayload(req.body);

    if (!sanitized.success) {
      res.status(sanitized.status).json(sanitized);
      return;
    }

    const [date, time] = getUtcTimestampParts();
    const payload = sanitized.value;

    try {
      const result = insertEquipmentItem.run({
        equipmentType: payload.equipmentType,
        itemNumber: payload.itemNumber,
        sizeCategory: payload.sizeCategory,
        arrowLength: payload.arrowLength,
        arrowQuantity: payload.arrowQuantity,
        locationType: EQUIPMENT_LOCATION_TYPES.CUPBOARD,
        locationLabel: DEFAULT_EQUIPMENT_CUPBOARD_LABEL,
        locationCaseId: null,
        locationMemberUsername: null,
        addedByUsername: actor.username,
        addedAtDate: date,
        addedAtTime: time,
        storageByUsername: actor.username,
        storageAtDate: date,
        storageAtTime: time,
      });
      const maps = buildEquipmentMaps();
      const createdItem = findEquipmentItemByIdWithRelations.get(result.lastInsertRowid);

      res.status(201).json({
        success: true,
        item: buildEquipmentItemResponse(createdItem, maps),
      });
    } catch (error) {
      if (error?.message?.includes("UNIQUE constraint failed")) {
        res.status(409).json({
          success: false,
          message: "An active equipment item with that number already exists.",
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: "Unable to add equipment.",
      });
    }
  });

  app.post("/api/equipment/items/:id/decommission", (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.ADD_DECOMMISSION_EQUIPMENT)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to decommission equipment.",
      });
      return;
    }

    const item = findEquipmentItemById.get(req.params.id);

    if (!item) {
      res.status(404).json({
        success: false,
        message: "Equipment item not found.",
      });
      return;
    }

    if (item.status !== "active") {
      res.status(400).json({
        success: false,
        message: "This equipment item is already decommissioned.",
      });
      return;
    }

    if (findOpenEquipmentLoanByItemId.get(item.id)) {
      res.status(400).json({
        success: false,
        message: "Equipment cannot be decommissioned while it is on loan.",
      });
      return;
    }

    if (item.equipment_type === EQUIPMENT_TYPES.CASE) {
      const activeContents = listEquipmentItemsByCaseId.all(item.id);

      if (activeContents.length > 0) {
        res.status(400).json({
          success: false,
          message: "Empty the case before decommissioning it.",
        });
        return;
      }
    }

    const reason =
      typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 280) : "";

    if (!reason) {
      res.status(400).json({
        success: false,
        message: "Please record why the equipment was decommissioned.",
      });
      return;
    }

    const [date, time] = getUtcTimestampParts();
    updateEquipmentItemForDecommission.run({
      id: item.id,
      locationLabel: DEFAULT_EQUIPMENT_CUPBOARD_LABEL,
      decommissionedByUsername: actor.username,
      decommissionedAtDate: date,
      decommissionedAtTime: time,
      decommissionReason: reason,
    });

    const maps = buildEquipmentMaps();
    res.json({
      success: true,
      item: buildEquipmentItemResponse(findEquipmentItemByIdWithRelations.get(item.id), maps),
    });
  });

  app.post("/api/equipment/assignments", (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.ASSIGN_EQUIPMENT)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to assign equipment.",
      });
      return;
    }

    const item = findEquipmentItemById.get(req.body?.itemId);

    if (!item) {
      res.status(404).json({
        success: false,
        message: "Equipment item not found.",
      });
      return;
    }

    if (item.status !== "active") {
      res.status(400).json({
        success: false,
        message: "Only active equipment can be assigned.",
      });
      return;
    }

    const targetType = req.body?.targetType;
    const [date, time] = getUtcTimestampParts();

    if (targetType === "case") {
      const caseItem = findEquipmentItemById.get(req.body?.caseId);
      const validationMessage = validateCaseAssignment(caseItem, item);

      if (validationMessage) {
        res.status(400).json({
          success: false,
          message: validationMessage,
        });
        return;
      }

      if (findOpenEquipmentLoanByItemId.get(item.id)) {
        res.status(400).json({
          success: false,
          message: "Return the equipment before assigning it into a case.",
        });
        return;
      }

      updateEquipmentItemStorage.run({
        id: item.id,
        locationType: EQUIPMENT_LOCATION_TYPES.CASE,
        locationLabel: null,
        locationCaseId: caseItem.id,
        locationMemberUsername: null,
        storageByUsername: actor.username,
        storageAtDate: date,
        storageAtTime: time,
      });
      updateEquipmentAssignmentMetadata.run({
        id: item.id,
        assignedByUsername: actor.username,
        assignedAtDate: date,
        assignedAtTime: time,
      });
    } else if (targetType === "member") {
      const memberUsername =
        typeof req.body?.memberUsername === "string" ? req.body.memberUsername.trim() : "";
      const member = findUserByUsername.get(memberUsername);

      if (!member) {
        res.status(404).json({
          success: false,
          message: "Choose a valid member.",
        });
        return;
      }

      if (actor.username === member.username) {
        res.status(400).json({
          success: false,
          message: "The staff member signing equipment out cannot also be the borrowing member.",
        });
        return;
      }

      if (findOpenEquipmentLoanByItemId.get(item.id)) {
        res.status(400).json({
          success: false,
          message: "That equipment is already on loan.",
        });
        return;
      }

      const assignTransaction = db.transaction(() => {
        if (item.equipment_type === EQUIPMENT_TYPES.CASE) {
          const contents = listEquipmentItemsByCaseId.all(item.id);

          insertEquipmentLoan.run(item.id, member.username, actor.username, date, time, null);
          updateEquipmentItemStorage.run({
            id: item.id,
            locationType: EQUIPMENT_LOCATION_TYPES.MEMBER,
            locationLabel: null,
            locationCaseId: null,
            locationMemberUsername: member.username,
            storageByUsername: actor.username,
            storageAtDate: date,
            storageAtTime: time,
          });
          updateEquipmentAssignmentMetadata.run({
            id: item.id,
            assignedByUsername: actor.username,
            assignedAtDate: date,
            assignedAtTime: time,
          });

          for (const content of contents) {
            if (findOpenEquipmentLoanByItemId.get(content.id)) {
              throw new Error("Case contents must all be returned before the case can be loaned out.");
            }

            insertEquipmentLoan.run(
              content.id,
              member.username,
              actor.username,
              date,
              time,
              item.id,
            );
            updateEquipmentAssignmentMetadata.run({
              id: content.id,
              assignedByUsername: actor.username,
              assignedAtDate: date,
              assignedAtTime: time,
            });
          }
        } else {
          insertEquipmentLoan.run(item.id, member.username, actor.username, date, time, null);
          updateEquipmentItemStorage.run({
            id: item.id,
            locationType: EQUIPMENT_LOCATION_TYPES.MEMBER,
            locationLabel: null,
            locationCaseId: null,
            locationMemberUsername: member.username,
            storageByUsername: actor.username,
            storageAtDate: date,
            storageAtTime: time,
          });
          updateEquipmentAssignmentMetadata.run({
            id: item.id,
            assignedByUsername: actor.username,
            assignedAtDate: date,
            assignedAtTime: time,
          });
        }
      });

      try {
        assignTransaction();
      } catch (error) {
        res.status(400).json({
          success: false,
          message: error instanceof Error ? error.message : "Unable to assign equipment to the member.",
        });
        return;
      }
    } else {
      res.status(400).json({
        success: false,
        message: "Choose whether the equipment is being assigned to a case or a member.",
      });
      return;
    }

    const maps = buildEquipmentMaps();
    res.json({
      success: true,
      item: buildEquipmentItemResponse(findEquipmentItemByIdWithRelations.get(item.id), maps),
    });
  });

  app.post("/api/equipment/returns", (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.RETURN_EQUIPMENT)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to return equipment.",
      });
      return;
    }

    const item = findEquipmentItemById.get(req.body?.itemId);

    if (!item) {
      res.status(404).json({
        success: false,
        message: "Equipment item not found.",
      });
      return;
    }

    const openLoan = findOpenEquipmentLoanByItemId.get(item.id);

    if (!openLoan) {
      res.status(400).json({
        success: false,
        message: "That equipment is not currently on loan.",
      });
      return;
    }

    if (actor.username === openLoan.member_username) {
      res.status(400).json({
        success: false,
        message: "The staff member signing equipment in cannot be the borrowing member.",
      });
      return;
    }

    const returnToCaseId =
      req.body?.returnToCaseId === "" || req.body?.returnToCaseId == null
        ? null
        : Number.parseInt(req.body.returnToCaseId, 10);
    const returnCase = returnToCaseId ? findEquipmentItemById.get(returnToCaseId) : null;
    const returnToCupboard = sanitizeCupboardLabel(req.body?.cupboardLabel);

    if (!assertStorageLocationExists(returnToCupboard, res)) {
      return;
    }

    const [date, time] = getUtcTimestampParts();

    if (returnCase) {
      const validationMessage = validateCaseAssignment(returnCase, item);

      if (validationMessage) {
        res.status(400).json({
          success: false,
          message: validationMessage,
        });
        return;
      }
    }

    const returnTransaction = db.transaction(() => {
      if (item.equipment_type === EQUIPMENT_TYPES.CASE) {
        const relatedOpenLoans = listOpenEquipmentLoansByCaseId.all(item.id);
        closeEquipmentLoan.run(
          actor.username,
          date,
          time,
          EQUIPMENT_LOCATION_TYPES.CUPBOARD,
          returnToCupboard,
          null,
          openLoan.id,
        );
        updateEquipmentItemStorage.run({
          id: item.id,
          locationType: EQUIPMENT_LOCATION_TYPES.CUPBOARD,
          locationLabel: returnToCupboard,
          locationCaseId: null,
          locationMemberUsername: null,
          storageByUsername: actor.username,
          storageAtDate: date,
          storageAtTime: time,
        });

        for (const loan of relatedOpenLoans) {
          closeEquipmentLoan.run(
            actor.username,
            date,
            time,
            EQUIPMENT_LOCATION_TYPES.CASE,
            null,
            item.id,
            loan.id,
          );
        }
      } else {
        closeEquipmentLoan.run(
          actor.username,
          date,
          time,
          returnCase ? EQUIPMENT_LOCATION_TYPES.CASE : EQUIPMENT_LOCATION_TYPES.CUPBOARD,
          returnCase ? null : returnToCupboard,
          returnCase?.id ?? null,
          openLoan.id,
        );
        updateEquipmentItemStorage.run({
          id: item.id,
          locationType: returnCase ? EQUIPMENT_LOCATION_TYPES.CASE : EQUIPMENT_LOCATION_TYPES.CUPBOARD,
          locationLabel: returnCase ? null : returnToCupboard,
          locationCaseId: returnCase?.id ?? null,
          locationMemberUsername: null,
          storageByUsername: actor.username,
          storageAtDate: date,
          storageAtTime: time,
        });
      }
    });

    returnTransaction();

    const maps = buildEquipmentMaps();
    res.json({
      success: true,
      item: buildEquipmentItemResponse(findEquipmentItemByIdWithRelations.get(item.id), maps),
    });
  });

  app.post("/api/equipment/storage", (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.UPDATE_EQUIPMENT_STORAGE)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to update equipment storage.",
      });
      return;
    }

    const item = findEquipmentItemById.get(req.body?.itemId);

    if (!item) {
      res.status(404).json({
        success: false,
        message: "Equipment item not found.",
      });
      return;
    }

    const openLoan = findOpenEquipmentLoanByItemId.get(item.id);
    const isLoanedCaseContent =
      openLoan &&
      item.location_type === EQUIPMENT_LOCATION_TYPES.CASE &&
      item.location_case_id &&
      openLoan.loan_context_case_id === item.location_case_id;

    if (openLoan && !isLoanedCaseContent) {
      res.status(400).json({
        success: false,
        message: "Return the equipment before updating its storage location.",
      });
      return;
    }

    const targetCupboard = sanitizeCupboardLabel(req.body?.cupboardLabel);

    if (!assertStorageLocationExists(targetCupboard, res)) {
      return;
    }

    const [date, time] = getUtcTimestampParts();

    const updateStorageTransaction = db.transaction(() => {
      if (isLoanedCaseContent) {
        closeEquipmentLoan.run(
          actor.username,
          date,
          time,
          EQUIPMENT_LOCATION_TYPES.CUPBOARD,
          targetCupboard,
          null,
          openLoan.id,
        );
      }

      updateEquipmentItemStorage.run({
        id: item.id,
        locationType: EQUIPMENT_LOCATION_TYPES.CUPBOARD,
        locationLabel: targetCupboard,
        locationCaseId: null,
        locationMemberUsername: null,
        storageByUsername: actor.username,
        storageAtDate: date,
        storageAtTime: time,
      });
    });

    updateStorageTransaction();

    const maps = buildEquipmentMaps();
    res.json({
      success: true,
      item: buildEquipmentItemResponse(findEquipmentItemByIdWithRelations.get(item.id), maps),
    });
  });

  app.post("/api/equipment/storage-locations", (req, res) => {
    const actor = getActorUser(req);

    if (
      !actor ||
      !actorHasPermission(actor, PERMISSIONS.MANAGE_EQUIPMENT_STORAGE_LOCATIONS)
    ) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to manage storage locations.",
      });
      return;
    }

    const rawLabel = typeof req.body?.locationLabel === "string"
      ? req.body.locationLabel
      : "";
    const label = sanitizeCupboardLabel(rawLabel);

    if (!rawLabel.trim()) {
      res.status(400).json({
        success: false,
        message: "Enter a storage location name.",
      });
      return;
    }

    const [date, time] = getUtcTimestampParts();

    try {
      insertEquipmentStorageLocation.run(label, date, time);
    } catch (error) {
      if (error?.message?.includes("UNIQUE constraint failed")) {
        res.status(409).json({
          success: false,
          message: "That storage location already exists.",
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: "Unable to add the storage location.",
      });
      return;
    }

    res.status(201).json({
      success: true,
      cupboardOptions: getStorageLocationOptions(),
    });
  });

  app.delete("/api/equipment/storage-locations/:label", (req, res) => {
    const actor = getActorUser(req);

    if (
      !actor ||
      !actorHasPermission(actor, PERMISSIONS.MANAGE_EQUIPMENT_STORAGE_LOCATIONS)
    ) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to manage storage locations.",
      });
      return;
    }

    const label = sanitizeCupboardLabel(req.params.label);

    if (label === DEFAULT_EQUIPMENT_CUPBOARD_LABEL) {
      res.status(400).json({
        success: false,
        message: "The main cupboard cannot be removed.",
      });
      return;
    }

    if (!findEquipmentStorageLocationByLabel.get(label)) {
      res.status(404).json({
        success: false,
        message: "Storage location not found.",
      });
      return;
    }

    const assignedItemCount = countEquipmentItemsByStorageLocation.get(label)?.count ?? 0;

    if (assignedItemCount > 0) {
      res.status(409).json({
        success: false,
        message:
          "Move equipment out of this storage location before removing it.",
      });
      return;
    }

    deleteEquipmentStorageLocation.run(label);

    res.json({
      success: true,
      cupboardOptions: getStorageLocationOptions(),
    });
  });

  app.get("/api/member-equipment-loans/:username", (req, res) => {
    const actor = getActorUser(req);
    const requestedUsername = req.params.username;

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const requestedUser = findUserByUsername.get(requestedUsername);

    if (!requestedUser) {
      res.status(404).json({
        success: false,
        message: "Member profile not found.",
      });
      return;
    }

    const canManageMembers = actorHasPermission(actor, PERMISSIONS.MANAGE_MEMBERS);
    const isSelf = actor.username === requestedUser.username;

    if (!isSelf && !canManageMembers) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to view this member's equipment loans.",
      });
      return;
    }

    const loans = listOpenEquipmentLoansByMemberUserId
      .all(requestedUser.username)
      .map((loan) => ({
        id: loan.id,
        type: loan.equipment_type,
        typeLabel: EQUIPMENT_TYPE_LABELS[loan.equipment_type] ?? loan.equipment_type,
        reference:
          loan.equipment_type === EQUIPMENT_TYPES.ARROWS
            ? `${loan.arrow_quantity} x ${loan.arrow_length}"`
            : loan.item_number ?? "",
        loanDate: `${loan.loaned_at_date} ${loan.loaned_at_time}`.trim(),
      }));

    res.json({
      success: true,
      loans,
    });
  });
}
