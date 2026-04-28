export function registerEquipmentRoutes({
  actorHasPermission,
  app,
  buildEquipmentCaseResponse,
  buildEquipmentItemResponse,
  buildEquipmentMaps,
  DEFAULT_EQUIPMENT_CUPBOARD_LABEL,
  EQUIPMENT_LOCATION_TYPES,
  EQUIPMENT_SIZE_CATEGORIES,
  EQUIPMENT_TYPES,
  EQUIPMENT_TYPE_LABELS,
  EQUIPMENT_TYPE_OPTIONS,
  equipmentGateway,
  getActorUser,
  getUtcTimestampParts,
  memberDirectoryGateway,
  PERMISSIONS,
  sanitizeCupboardLabel,
  sanitizeEquipmentCreatePayload,
  validateCaseAssignment,
}) {
  // Equipment routes combine storage, assignment, and loan state so a case and
  // its contents move together through the club inventory workflow.
  const getStorageLocationOptions = async () => {
    const labels = (await equipmentGateway.listEquipmentStorageLocations()).map((row) => row.label);

    if (labels.includes(DEFAULT_EQUIPMENT_CUPBOARD_LABEL)) {
      return labels;
    }

    return [DEFAULT_EQUIPMENT_CUPBOARD_LABEL, ...labels];
  };

  const assertStorageLocationExists = async (label, res) => {
    if (!(await equipmentGateway.findEquipmentStorageLocationByLabel(label))) {
      res.status(400).json({
        success: false,
        message: "Choose a valid equipment storage location.",
      });
      return false;
    }

    return true;
  };

  app.get("/api/equipment/dashboard", async (req, res) => {
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

    const maps = await buildEquipmentMaps();
    const cases = maps.items
      .filter((item) => item.equipment_type === EQUIPMENT_TYPES.CASE)
      .map((item) => buildEquipmentCaseResponse(item, maps));
    const items = maps.items.map((item) => buildEquipmentItemResponse(item, maps));

    res.json({
      success: true,
      permissions,
      members: (await memberDirectoryGateway.listAllUsers()).map((user) => ({
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
      cupboardOptions: await getStorageLocationOptions(),
      items,
      cases,
    });
  });

  app.post("/api/equipment/items", async (req, res) => {
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
      const result = await equipmentGateway.createEquipmentItem({
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
      const maps = await buildEquipmentMaps();
      const createdItem = await equipmentGateway.findEquipmentItemByIdWithRelations(
        result.lastInsertRowid,
      );

      res.status(201).json({
        success: true,
        item: buildEquipmentItemResponse(createdItem, maps),
      });
    } catch (error) {
      if (
        error?.message?.includes("UNIQUE constraint failed") ||
        error?.message?.includes("duplicate key value violates unique constraint")
      ) {
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

  app.post("/api/equipment/items/:id/decommission", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.ADD_DECOMMISSION_EQUIPMENT)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to decommission equipment.",
      });
      return;
    }

    const item = await equipmentGateway.findEquipmentItemById(req.params.id);

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

    if (await equipmentGateway.findOpenEquipmentLoanByItemId(item.id)) {
      res.status(400).json({
        success: false,
        message: "Equipment cannot be decommissioned while it is on loan.",
      });
      return;
    }

    if (item.equipment_type === EQUIPMENT_TYPES.CASE) {
      const activeContents = await equipmentGateway.listEquipmentItemsByCaseId(item.id);

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
    await equipmentGateway.updateEquipmentItemForDecommission({
      id: item.id,
      locationLabel: DEFAULT_EQUIPMENT_CUPBOARD_LABEL,
      decommissionedByUsername: actor.username,
      decommissionedAtDate: date,
      decommissionedAtTime: time,
      decommissionReason: reason,
    });

    const maps = await buildEquipmentMaps();
    res.json({
      success: true,
      item: buildEquipmentItemResponse(
        await equipmentGateway.findEquipmentItemByIdWithRelations(item.id),
        maps,
      ),
    });
  });

  app.post("/api/equipment/assignments", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.ASSIGN_EQUIPMENT)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to assign equipment.",
      });
      return;
    }

    const item = await equipmentGateway.findEquipmentItemById(req.body?.itemId);

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
      const caseItem = await equipmentGateway.findEquipmentItemById(req.body?.caseId);
      const validationMessage = await validateCaseAssignment(caseItem, item);

      if (validationMessage) {
        res.status(400).json({
          success: false,
          message: validationMessage,
        });
        return;
      }

      if (await equipmentGateway.findOpenEquipmentLoanByItemId(item.id)) {
        res.status(400).json({
          success: false,
          message: "Return the equipment before assigning it into a case.",
        });
        return;
      }

      await equipmentGateway.updateEquipmentItemStorage({
        id: item.id,
        locationType: EQUIPMENT_LOCATION_TYPES.CASE,
        locationLabel: null,
        locationCaseId: caseItem.id,
        locationMemberUsername: null,
        storageByUsername: actor.username,
        storageAtDate: date,
        storageAtTime: time,
      });
      await equipmentGateway.updateEquipmentAssignmentMetadata({
        id: item.id,
        assignedByUsername: actor.username,
        assignedAtDate: date,
        assignedAtTime: time,
      });
    } else if (targetType === "member") {
      const memberUsername =
        typeof req.body?.memberUsername === "string" ? req.body.memberUsername.trim() : "";
      const member = await memberDirectoryGateway.findUserByUsername(memberUsername);

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

      if (await equipmentGateway.findOpenEquipmentLoanByItemId(item.id)) {
        res.status(400).json({
          success: false,
          message: "That equipment is already on loan.",
        });
        return;
      }

      try {
        if (item.equipment_type === EQUIPMENT_TYPES.CASE) {
          const contents = await equipmentGateway.listEquipmentItemsByCaseId(item.id);

          await equipmentGateway.createEquipmentLoan(
            item.id,
            member.username,
            actor.username,
            date,
            time,
            null,
          );
          await equipmentGateway.updateEquipmentItemStorage({
            id: item.id,
            locationType: EQUIPMENT_LOCATION_TYPES.MEMBER,
            locationLabel: null,
            locationCaseId: null,
            locationMemberUsername: member.username,
            storageByUsername: actor.username,
            storageAtDate: date,
            storageAtTime: time,
          });
          await equipmentGateway.updateEquipmentAssignmentMetadata({
            id: item.id,
            assignedByUsername: actor.username,
            assignedAtDate: date,
            assignedAtTime: time,
          });

          for (const content of contents) {
            if (await equipmentGateway.findOpenEquipmentLoanByItemId(content.id)) {
              throw new Error("Case contents must all be returned before the case can be loaned out.");
            }

            await equipmentGateway.createEquipmentLoan(
              content.id,
              member.username,
              actor.username,
              date,
              time,
              item.id,
            );
            await equipmentGateway.updateEquipmentAssignmentMetadata({
              id: content.id,
              assignedByUsername: actor.username,
              assignedAtDate: date,
              assignedAtTime: time,
            });
          }
        } else {
          await equipmentGateway.createEquipmentLoan(
            item.id,
            member.username,
            actor.username,
            date,
            time,
            null,
          );
          await equipmentGateway.updateEquipmentItemStorage({
            id: item.id,
            locationType: EQUIPMENT_LOCATION_TYPES.MEMBER,
            locationLabel: null,
            locationCaseId: null,
            locationMemberUsername: member.username,
            storageByUsername: actor.username,
            storageAtDate: date,
            storageAtTime: time,
          });
          await equipmentGateway.updateEquipmentAssignmentMetadata({
            id: item.id,
            assignedByUsername: actor.username,
            assignedAtDate: date,
            assignedAtTime: time,
          });
        }
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

    const maps = await buildEquipmentMaps();
    res.json({
      success: true,
      item: buildEquipmentItemResponse(
        await equipmentGateway.findEquipmentItemByIdWithRelations(item.id),
        maps,
      ),
    });
  });

  app.post("/api/equipment/returns", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.RETURN_EQUIPMENT)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to return equipment.",
      });
      return;
    }

    const item = await equipmentGateway.findEquipmentItemById(req.body?.itemId);

    if (!item) {
      res.status(404).json({
        success: false,
        message: "Equipment item not found.",
      });
      return;
    }

    const openLoan = await equipmentGateway.findOpenEquipmentLoanByItemId(item.id);

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
    const returnCase = returnToCaseId
      ? await equipmentGateway.findEquipmentItemById(returnToCaseId)
      : null;
    const returnToCupboard = sanitizeCupboardLabel(req.body?.cupboardLabel);

    if (!(await assertStorageLocationExists(returnToCupboard, res))) {
      return;
    }

    const [date, time] = getUtcTimestampParts();

    if (returnCase) {
      const validationMessage = await validateCaseAssignment(returnCase, item);

      if (validationMessage) {
        res.status(400).json({
          success: false,
          message: validationMessage,
        });
        return;
      }
    }

    if (item.equipment_type === EQUIPMENT_TYPES.CASE) {
      const relatedOpenLoans = await equipmentGateway.listOpenEquipmentLoansByCaseId(item.id);
      await equipmentGateway.closeEquipmentLoan({
        id: openLoan.id,
        returnCaseId: null,
        returnLocationLabel: returnToCupboard,
        returnLocationType: EQUIPMENT_LOCATION_TYPES.CUPBOARD,
        returnedAtDate: date,
        returnedAtTime: time,
        returnedByUsername: actor.username,
      });
      await equipmentGateway.updateEquipmentItemStorage({
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
        await equipmentGateway.closeEquipmentLoan({
          id: loan.id,
          returnCaseId: item.id,
          returnLocationLabel: null,
          returnLocationType: EQUIPMENT_LOCATION_TYPES.CASE,
          returnedAtDate: date,
          returnedAtTime: time,
          returnedByUsername: actor.username,
        });
      }
    } else {
      await equipmentGateway.closeEquipmentLoan({
        id: openLoan.id,
        returnCaseId: returnCase?.id ?? null,
        returnLocationLabel: returnCase ? null : returnToCupboard,
        returnLocationType: returnCase
          ? EQUIPMENT_LOCATION_TYPES.CASE
          : EQUIPMENT_LOCATION_TYPES.CUPBOARD,
        returnedAtDate: date,
        returnedAtTime: time,
        returnedByUsername: actor.username,
      });
      await equipmentGateway.updateEquipmentItemStorage({
        id: item.id,
        locationType: returnCase
          ? EQUIPMENT_LOCATION_TYPES.CASE
          : EQUIPMENT_LOCATION_TYPES.CUPBOARD,
        locationLabel: returnCase ? null : returnToCupboard,
        locationCaseId: returnCase?.id ?? null,
        locationMemberUsername: null,
        storageByUsername: actor.username,
        storageAtDate: date,
        storageAtTime: time,
      });
    }

    const maps = await buildEquipmentMaps();
    res.json({
      success: true,
      item: buildEquipmentItemResponse(
        await equipmentGateway.findEquipmentItemByIdWithRelations(item.id),
        maps,
      ),
    });
  });

  app.post("/api/equipment/storage", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.UPDATE_EQUIPMENT_STORAGE)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to update equipment storage.",
      });
      return;
    }

    const item = await equipmentGateway.findEquipmentItemById(req.body?.itemId);

    if (!item) {
      res.status(404).json({
        success: false,
        message: "Equipment item not found.",
      });
      return;
    }

    const openLoan = await equipmentGateway.findOpenEquipmentLoanByItemId(item.id);
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

    if (!(await assertStorageLocationExists(targetCupboard, res))) {
      return;
    }

    const [date, time] = getUtcTimestampParts();

    if (isLoanedCaseContent) {
      await equipmentGateway.closeEquipmentLoan({
        id: openLoan.id,
        returnCaseId: null,
        returnLocationLabel: targetCupboard,
        returnLocationType: EQUIPMENT_LOCATION_TYPES.CUPBOARD,
        returnedAtDate: date,
        returnedAtTime: time,
        returnedByUsername: actor.username,
      });
    }

    await equipmentGateway.updateEquipmentItemStorage({
      id: item.id,
      locationType: EQUIPMENT_LOCATION_TYPES.CUPBOARD,
      locationLabel: targetCupboard,
      locationCaseId: null,
      locationMemberUsername: null,
      storageByUsername: actor.username,
      storageAtDate: date,
      storageAtTime: time,
    });

    const maps = await buildEquipmentMaps();
    res.json({
      success: true,
      item: buildEquipmentItemResponse(
        await equipmentGateway.findEquipmentItemByIdWithRelations(item.id),
        maps,
      ),
    });
  });

  app.post("/api/equipment/storage-locations", async (req, res) => {
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
      await equipmentGateway.createEquipmentStorageLocation(label, date, time);
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
      cupboardOptions: await getStorageLocationOptions(),
    });
  });

  app.delete("/api/equipment/storage-locations/:label", async (req, res) => {
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

    if (!(await equipmentGateway.findEquipmentStorageLocationByLabel(label))) {
      res.status(404).json({
        success: false,
        message: "Storage location not found.",
      });
      return;
    }

    const assignedItemCount =
      (await equipmentGateway.countEquipmentItemsByStorageLocation(label))?.count ?? 0;

    if (assignedItemCount > 0) {
      res.status(409).json({
        success: false,
        message:
          "Move equipment out of this storage location before removing it.",
      });
      return;
    }

    await equipmentGateway.deleteEquipmentStorageLocation(label);

    res.json({
      success: true,
      cupboardOptions: await getStorageLocationOptions(),
    });
  });

  app.get("/api/member-equipment-loans/:username", async (req, res) => {
    const actor = getActorUser(req);
    const requestedUsername = req.params.username;

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const requestedUser = await memberDirectoryGateway.findUserByUsername(requestedUsername);

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

    const loans = (await equipmentGateway.listOpenEquipmentLoansByMemberUserId(
      requestedUser.username,
    ))
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
