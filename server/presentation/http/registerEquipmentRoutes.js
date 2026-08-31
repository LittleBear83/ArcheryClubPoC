export function registerEquipmentRoutes({
  actorHasPermission,
  app,
  auditChangeLogger,
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
  sanitizeEquipmentCorrectionPayload,
  sanitizeEquipmentCreatePayload,
  serverEventBus,
  validateCaseAssignment,
}) {
  const EQUIPMENT_PERMISSION_KEYS = [
    PERMISSIONS.ADD_DECOMMISSION_EQUIPMENT,
    PERMISSIONS.ASSIGN_EQUIPMENT,
    PERMISSIONS.RETURN_EQUIPMENT,
    PERMISSIONS.UPDATE_EQUIPMENT_STORAGE,
    PERMISSIONS.MANAGE_EQUIPMENT_STORAGE_LOCATIONS,
  ];

  // Equipment routes combine storage, assignment, and loan state so a case and
  // its contents move together through the club inventory workflow.
  const broadcastEquipmentUpdated = (scope = "equipment") => {
    serverEventBus?.broadcastToAnyPermission(EQUIPMENT_PERMISSION_KEYS, "equipment.updated", {
      changedAt: new Date().toISOString(),
      scope,
    });
  };

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

  const sanitizeReturnDate = (value) => {
    const normalized = String(value ?? "").trim();

    if (!normalized) {
      return new Date().toISOString().slice(0, 10);
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      return null;
    }

    const parsed = new Date(`${normalized}T00:00:00Z`);

    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
      return null;
    }

    return normalized;
  };

  const buildLoanTimestamp = (date, time) =>
    date ? `${date}T${time || "00:00:00"}` : "";

  const getDaysSinceTimestamp = (timestamp) => {
    if (!timestamp) {
      return null;
    }

    const parsed = new Date(timestamp);

    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return Math.max(
      0,
      Math.floor((Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24)),
    );
  };

  const getEquipmentReferenceLabel = (item) => {
    if (item.type === EQUIPMENT_TYPES.ARROWS) {
      return `${item.arrowQuantity} x ${item.arrowLength}"`;
    }

    if (item.number && item.detailSummary) {
      return `${item.number} | ${item.detailSummary}`;
    }

    return item.number || item.detailSummary || "-";
  };

  const buildEquipmentAnalytics = (items, loans) => {
    const inactiveThresholdDays = 60;
    const activeItems = items.filter((item) => item.status === "active");
    const itemStatsById = new Map(
      activeItems.map((item) => [
        item.id,
        {
          item,
          loanCount: 0,
          returnCount: 0,
          isOnLoan: false,
          lastLoanedAt: "",
          lastReturnedAt: "",
        },
      ]),
    );

    for (const loan of loans) {
      const stats = itemStatsById.get(loan.equipment_item_id);

      if (!stats) {
        continue;
      }

      const loanedAt = buildLoanTimestamp(loan.loaned_at_date, loan.loaned_at_time);
      const returnedAt = buildLoanTimestamp(
        loan.returned_at_date,
        loan.returned_at_time,
      );

      stats.loanCount += 1;

      if (loanedAt && (!stats.lastLoanedAt || loanedAt > stats.lastLoanedAt)) {
        stats.lastLoanedAt = loanedAt;
      }

      if (loan.returned_at_date) {
        stats.returnCount += 1;

        if (!stats.lastReturnedAt || returnedAt > stats.lastReturnedAt) {
          stats.lastReturnedAt = returnedAt;
        }
      } else {
        stats.isOnLoan = true;
      }
    }

    const statRows = [...itemStatsById.values()].map((stats) => {
      const daysSinceLastLoan = getDaysSinceTimestamp(stats.lastLoanedAt);

      return {
        id: stats.item.id,
        item: stats.item,
        label: stats.item.label,
        type: stats.item.type,
        typeLabel: stats.item.typeLabel,
        sizeCategory: stats.item.sizeCategory,
        referenceLabel: getEquipmentReferenceLabel(stats.item),
        locationLabel: stats.item.currentLocation?.label || "Main Cupboard",
        loanCount: stats.loanCount,
        returnCount: stats.returnCount,
        isOnLoan: stats.isOnLoan,
        lastLoanedAt: stats.lastLoanedAt,
        lastReturnedAt: stats.lastReturnedAt,
        addedAt: stats.item.addedAt,
        daysSinceLastLoan,
      };
    });

    const usageByTypeMap = new Map();

    for (const row of statRows) {
      const current = usageByTypeMap.get(row.type) ?? {
        type: row.type,
        typeLabel: row.typeLabel,
        totalItems: 0,
        onLoanCount: 0,
        totalLoans: 0,
        neverLoanedCount: 0,
      };

      current.totalItems += 1;
      current.onLoanCount += row.isOnLoan ? 1 : 0;
      current.totalLoans += row.loanCount;
      current.neverLoanedCount += row.loanCount === 0 ? 1 : 0;
      usageByTypeMap.set(row.type, current);
    }

    const usageByType = [...usageByTypeMap.values()].sort((left, right) => {
      if (right.totalLoans !== left.totalLoans) {
        return right.totalLoans - left.totalLoans;
      }

      return left.typeLabel.localeCompare(right.typeLabel, undefined, {
        sensitivity: "base",
      });
    });

    const mostUsedItems = statRows
      .filter((row) => row.loanCount > 0)
      .sort((left, right) => {
        if (right.loanCount !== left.loanCount) {
          return right.loanCount - left.loanCount;
        }

        return right.lastLoanedAt.localeCompare(left.lastLoanedAt);
      })
      .slice(0, 10);

    const neverLoanedItems = statRows
      .filter((row) => row.loanCount === 0)
      .sort((left, right) => left.addedAt.localeCompare(right.addedAt))
      .slice(0, 10);

    const allInactiveItems = statRows
      .filter(
        (row) =>
          !row.isOnLoan &&
          row.loanCount > 0 &&
          row.daysSinceLastLoan != null &&
          row.daysSinceLastLoan >= inactiveThresholdDays,
      )
      .sort((left, right) => {
        if ((right.daysSinceLastLoan ?? 0) !== (left.daysSinceLastLoan ?? 0)) {
          return (right.daysSinceLastLoan ?? 0) - (left.daysSinceLastLoan ?? 0);
        }

        return left.label.localeCompare(right.label, undefined, {
          sensitivity: "base",
        });
      });
    const inactiveItems = allInactiveItems.slice(0, 10);

    return {
      inactiveThresholdDays,
      summary: {
        activeItemsCount: activeItems.length,
        currentlyOnLoanCount: statRows.filter((row) => row.isOnLoan).length,
        totalLoanRecords: loans.length,
        totalReturnRecords: loans.filter((loan) => Boolean(loan.returned_at_date)).length,
        neverLoanedCount: statRows.filter((row) => row.loanCount === 0).length,
        inactiveItemsCount: allInactiveItems.length,
      },
      usageByType,
      mostUsedItems,
      neverLoanedItems,
      inactiveItems,
    };
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
    const analytics = buildEquipmentAnalytics(items, maps.loans);

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
      analytics,
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
        detailsJson: payload.detailsJson,
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
      const createdItemResponse = buildEquipmentItemResponse(createdItem, maps);

      if (auditChangeLogger) {
        void auditChangeLogger.recordEntityChange({
          action: "created",
          actorUsername: actor.username,
          after: createdItemResponse,
          before: null,
          changedAtDate: date,
          changedAtTime: time,
          entityId: createdItem.id,
          entityLabel: createdItem.item_number ?? createdItem.equipment_type,
          entityType: "equipment_item",
          req,
          statusCode: 201,
          target: `/api/equipment/items/${createdItem.id}`,
        }).catch((auditError) => {
          console.error("Failed to record equipment audit event", auditError);
        });
      }
      broadcastEquipmentUpdated("equipment.create");

      res.status(201).json({
        success: true,
        item: createdItemResponse,
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

  app.post("/api/equipment/items/:id/corrections", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.ADD_DECOMMISSION_EQUIPMENT)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to correct equipment details.",
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

    const sanitized = sanitizeEquipmentCorrectionPayload(req.body, item);

    if (!sanitized.success) {
      res.status(sanitized.status).json(sanitized);
      return;
    }

    const previousItem = await equipmentGateway.findEquipmentItemByIdWithRelations(item.id);

    try {
      await equipmentGateway.updateEquipmentItemDetails({
        id: item.id,
        itemNumber: sanitized.value.itemNumber,
        sizeCategory: sanitized.value.sizeCategory,
        arrowLength: sanitized.value.arrowLength,
        arrowQuantity: sanitized.value.arrowQuantity,
        detailsJson: sanitized.value.detailsJson,
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
        message: "Unable to correct the equipment details.",
      });
      return;
    }

    const [date, time] = getUtcTimestampParts();
    const maps = await buildEquipmentMaps();
    const updatedItem = await equipmentGateway.findEquipmentItemByIdWithRelations(item.id);
    const updatedItemResponse = buildEquipmentItemResponse(updatedItem, maps);

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "corrected",
        actorUsername: actor.username,
        after: updatedItemResponse,
        before: previousItem ? buildEquipmentItemResponse(previousItem, maps) : item,
        changedAtDate: date,
        changedAtTime: time,
        entityId: item.id,
        entityLabel: item.item_number ?? item.equipment_type,
        entityType: "equipment_item",
        req,
        target: `/api/equipment/items/${item.id}/corrections`,
      }).catch((auditError) => {
        console.error("Failed to record equipment audit event", auditError);
      });
    }

    broadcastEquipmentUpdated("equipment.correction");

    res.json({
      success: true,
      item: updatedItemResponse,
    });
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
    const previousItem = await equipmentGateway.findEquipmentItemByIdWithRelations(item.id);
    await equipmentGateway.updateEquipmentItemForDecommission({
      id: item.id,
      locationLabel: DEFAULT_EQUIPMENT_CUPBOARD_LABEL,
      decommissionedByUsername: actor.username,
      decommissionedAtDate: date,
      decommissionedAtTime: time,
      decommissionReason: reason,
    });
    broadcastEquipmentUpdated("equipment.decommission");

    const maps = await buildEquipmentMaps();
    const updatedItem = await equipmentGateway.findEquipmentItemByIdWithRelations(item.id);
    const updatedItemResponse = buildEquipmentItemResponse(updatedItem, maps);

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "decommissioned",
        actorUsername: actor.username,
        after: updatedItemResponse,
        before: previousItem ? buildEquipmentItemResponse(previousItem, maps) : item,
        changedAtDate: date,
        changedAtTime: time,
        entityId: item.id,
        entityLabel: item.item_number ?? item.equipment_type,
        entityType: "equipment_item",
        req,
        target: `/api/equipment/items/${item.id}`,
      }).catch((auditError) => {
        console.error("Failed to record equipment audit event", auditError);
      });
    }
    res.json({
      success: true,
      item: updatedItemResponse,
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
    const previousItem = await equipmentGateway.findEquipmentItemByIdWithRelations(item.id);

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
    const updatedItem = await equipmentGateway.findEquipmentItemByIdWithRelations(item.id);
    const updatedItemResponse = buildEquipmentItemResponse(updatedItem, maps);

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "assigned",
        actorUsername: actor.username,
        after: updatedItemResponse,
        before: previousItem ? buildEquipmentItemResponse(previousItem, maps) : item,
        changedAtDate: date,
        changedAtTime: time,
        entityId: item.id,
        entityLabel: item.item_number ?? item.equipment_type,
        entityType: "equipment_item",
        req,
        target: `/api/equipment/items/${item.id}/assignment`,
      }).catch((auditError) => {
        console.error("Failed to record equipment audit event", auditError);
      });
    }
    broadcastEquipmentUpdated("equipment.assign");
    res.json({
      success: true,
      item: updatedItemResponse,
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

    const returnDate = sanitizeReturnDate(req.body?.returnDate);

    if (!returnDate) {
      res.status(400).json({
        success: false,
        message: "Choose a valid return date.",
      });
      return;
    }

    const [date, time] = getUtcTimestampParts();
    const previousItem = await equipmentGateway.findEquipmentItemByIdWithRelations(item.id);

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
        returnedAtDate: returnDate,
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
        storageAtDate: returnDate,
        storageAtTime: time,
      });

      for (const loan of relatedOpenLoans) {
        await equipmentGateway.closeEquipmentLoan({
          id: loan.id,
          returnCaseId: item.id,
          returnLocationLabel: null,
          returnLocationType: EQUIPMENT_LOCATION_TYPES.CASE,
          returnedAtDate: returnDate,
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
        returnedAtDate: returnDate,
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
        storageAtDate: returnDate,
        storageAtTime: time,
      });
    }

    const maps = await buildEquipmentMaps();
    const updatedItem = await equipmentGateway.findEquipmentItemByIdWithRelations(item.id);
    const updatedItemResponse = buildEquipmentItemResponse(updatedItem, maps);

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "returned",
        actorUsername: actor.username,
        after: updatedItemResponse,
        before: previousItem ? buildEquipmentItemResponse(previousItem, maps) : item,
        changedAtDate: date,
        changedAtTime: time,
        entityId: item.id,
        entityLabel: item.item_number ?? item.equipment_type,
        entityType: "equipment_item",
        req,
        target: `/api/equipment/items/${item.id}/return`,
      }).catch((auditError) => {
        console.error("Failed to record equipment audit event", auditError);
      });
    }
    broadcastEquipmentUpdated("equipment.return");
    res.json({
      success: true,
      item: updatedItemResponse,
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
    const previousItem = await equipmentGateway.findEquipmentItemByIdWithRelations(item.id);

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
    const updatedItem = await equipmentGateway.findEquipmentItemByIdWithRelations(item.id);
    const updatedItemResponse = buildEquipmentItemResponse(updatedItem, maps);

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "storage_updated",
        actorUsername: actor.username,
        after: updatedItemResponse,
        before: previousItem ? buildEquipmentItemResponse(previousItem, maps) : item,
        changedAtDate: date,
        changedAtTime: time,
        entityId: item.id,
        entityLabel: item.item_number ?? item.equipment_type,
        entityType: "equipment_item",
        req,
        target: `/api/equipment/items/${item.id}/storage`,
      }).catch((auditError) => {
        console.error("Failed to record equipment audit event", auditError);
      });
    }
    broadcastEquipmentUpdated("equipment.storage");

    res.json({
      success: true,
      item: updatedItemResponse,
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

    broadcastEquipmentUpdated("equipment.storage-location.create");
    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "created",
        actorUsername: actor.username,
        after: { label },
        before: null,
        changedAtDate: date,
        changedAtTime: time,
        entityId: label,
        entityLabel: label,
        entityType: "equipment_storage_location",
        req,
        statusCode: 201,
        target: `/api/equipment/storage-locations/${encodeURIComponent(label)}`,
      }).catch((auditError) => {
        console.error("Failed to record storage location audit event", auditError);
      });
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

    const [deletedAtDate, deletedAtTime] = getUtcTimestampParts();
    await equipmentGateway.deleteEquipmentStorageLocation(label);
    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "deleted",
        actorUsername: actor.username,
        after: null,
        before: { label },
        changedAtDate: deletedAtDate,
        changedAtTime: deletedAtTime,
        entityId: label,
        entityLabel: label,
        entityType: "equipment_storage_location",
        req,
        target: `/api/equipment/storage-locations/${encodeURIComponent(label)}`,
      }).catch((auditError) => {
        console.error("Failed to record storage location audit event", auditError);
      });
    }
    broadcastEquipmentUpdated("equipment.storage-location.delete");

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
