export function registerAdminMemberRoutes({
  actorHasPermission,
  ALLOWED_DISCIPLINES,
  app,
  buildCommitteeRole,
  buildEditableMemberProfile,
  buildLoanBowRecord,
  buildRoleDefinitionResponse,
  buildUniqueRoleKeyFromTitle,
  countUsersByRoleKey,
  CURRENT_PERMISSION_KEY_SET,
  db,
  deleteCommitteeRoleById,
  deleteRoleDefinition,
  deleteRolePermissionsByRoleKey,
  findCommitteeRoleById,
  findCommitteeRoleByKey,
  findDisciplinesByUsername,
  findLoanBowByUsername,
  findRoleDefinitionByKey,
  findUserByUsername,
  findMaxCommitteeRoleDisplayOrder,
  getActorUser,
  getPermissionsForRole,
  insertCommitteeRole,
  listAllUsers,
  listAssignableRoleKeys,
  listCommitteeRoles,
  listPermissionDefinitions,
  listProfilePageMembers,
  listRoleDefinitions,
  PERMISSIONS,
  sanitizeLoanBow,
  sanitizeLoanBowReturn,
  saveLoanBowRecord,
  saveMemberProfile,
  TOURNAMENT_TYPE_OPTIONS,
  updateCommitteeRoleDetails,
  updateRoleDefinition,
  upsertRole,
  insertRolePermission,
  buildMemberUserProfile,
}) {
  app.get("/api/profile-options", (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!actorHasPermission(actor, PERMISSIONS.MANAGE_MEMBERS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to load member options.",
      });
      return;
    }

    res.json({
      success: true,
      members: listProfilePageMembers().map((user) => ({
        username: user.username,
        fullName: `${user.first_name} ${user.surname}`,
        userType: user.user_type,
      })),
      userTypes: listAssignableRoleKeys(),
      disciplines: ALLOWED_DISCIPLINES,
    });
  });

  app.get("/api/roles", (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!actorHasPermission(actor, PERMISSIONS.MANAGE_ROLES_PERMISSIONS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to manage roles.",
      });
      return;
    }

    res.json({
      success: true,
      roles: listRoleDefinitions.all().map(buildRoleDefinitionResponse),
      permissions: listPermissionDefinitions.all().map((permission) => ({
        key: permission.permission_key,
        label: permission.label,
        description: permission.description,
      })),
    });
  });

  app.post("/api/roles", (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!actorHasPermission(actor, PERMISSIONS.MANAGE_ROLES_PERMISSIONS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to create roles.",
      });
      return;
    }

    const titleRaw = typeof req.body?.title === "string" ? req.body.title : "";
    const permissionsRaw = Array.isArray(req.body?.permissions)
      ? req.body.permissions
      : [];
    const title = titleRaw.trim();
    const normalizedPermissions = [
      ...new Set(
        permissionsRaw
          .filter((permission) => typeof permission === "string")
          .map((permission) => permission.trim())
          .filter((permission) => CURRENT_PERMISSION_KEY_SET.has(permission)),
      ),
    ];

    if (!title) {
      res.status(400).json({
        success: false,
        message: "Role title is required.",
      });
      return;
    }

    const roleKey = buildUniqueRoleKeyFromTitle(title);

    if (!roleKey) {
      res.status(400).json({
        success: false,
        message: "Role title must contain letters or numbers.",
      });
      return;
    }

    const createRoleTransaction = db.transaction(() => {
      upsertRole.run({
        roleKey,
        title,
        isSystem: 0,
      });
      deleteRolePermissionsByRoleKey.run(roleKey);

      for (const permissionKey of normalizedPermissions) {
        insertRolePermission.run(roleKey, permissionKey);
      }
    });

    createRoleTransaction();

    const createdRole = findRoleDefinitionByKey.get(roleKey);

    res.status(201).json({
      success: true,
      role: buildRoleDefinitionResponse(createdRole),
    });
  });

  app.put("/api/roles/:roleKey", (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!actorHasPermission(actor, PERMISSIONS.MANAGE_ROLES_PERMISSIONS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to update roles.",
      });
      return;
    }

    const roleKey = req.params.roleKey;
    const existingRole = findRoleDefinitionByKey.get(roleKey);

    if (!existingRole) {
      res.status(404).json({
        success: false,
        message: "Role not found.",
      });
      return;
    }

    const titleRaw = typeof req.body?.title === "string" ? req.body.title : "";
    const permissionsRaw = Array.isArray(req.body?.permissions)
      ? req.body.permissions
      : [];
    const title = titleRaw.trim();

    if (!title) {
      res.status(400).json({
        success: false,
        message: "Role title is required.",
      });
      return;
    }

    const normalizedPermissions = [
      ...new Set(
        permissionsRaw
          .filter((permission) => typeof permission === "string")
          .map((permission) => permission.trim())
          .filter((permission) => CURRENT_PERMISSION_KEY_SET.has(permission)),
      ),
    ];

    const updateRoleTransaction = db.transaction(() => {
      updateRoleDefinition.run(title, roleKey);
      deleteRolePermissionsByRoleKey.run(roleKey);

      for (const permissionKey of normalizedPermissions) {
        insertRolePermission.run(roleKey, permissionKey);
      }
    });

    updateRoleTransaction();

    res.json({
      success: true,
      role: buildRoleDefinitionResponse(findRoleDefinitionByKey.get(roleKey)),
    });
  });

  app.delete("/api/roles/:roleKey", (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!actorHasPermission(actor, PERMISSIONS.MANAGE_ROLES_PERMISSIONS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to delete roles.",
      });
      return;
    }

    const roleKey = req.params.roleKey;
    const existingRole = findRoleDefinitionByKey.get(roleKey);

    if (!existingRole) {
      res.status(404).json({
        success: false,
        message: "Role not found.",
      });
      return;
    }

    if (existingRole.is_system) {
      res.status(400).json({
        success: false,
        message: "System roles cannot be deleted.",
      });
      return;
    }

    const assignedUserCount = countUsersByRoleKey.get(roleKey)?.count ?? 0;

    if (assignedUserCount > 0) {
      res.status(409).json({
        success: false,
        message: "This role is still assigned to members and cannot be deleted.",
      });
      return;
    }

    const deleteRoleTransaction = db.transaction(() => {
      deleteRolePermissionsByRoleKey.run(roleKey);
      deleteRoleDefinition.run(roleKey);
    });

    deleteRoleTransaction();

    res.json({
      success: true,
      deletedRoleKey: roleKey,
    });
  });

  app.get("/api/tournament-options", (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_TOURNAMENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to load tournament setup options.",
      });
      return;
    }

    res.json({
      success: true,
      tournamentTypes: TOURNAMENT_TYPE_OPTIONS,
    });
  });

  function normalizeCommitteeRoleText(value, fallback = "") {
    return typeof value === "string" ? value.trim() : fallback;
  }

  function normalizeCommitteeRolePhotoDataUrl(value) {
    if (typeof value !== "string") {
      return null;
    }

    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return null;
    }

    return trimmedValue.startsWith("data:image/") ? trimmedValue : null;
  }

  function buildUniqueCommitteeRoleKey(title) {
    const baseTitle = normalizeCommitteeRoleText(title);

    if (!baseTitle) {
      return "";
    }

    let nextKey = buildUniqueRoleKeyFromTitle(baseTitle);

    if (!nextKey) {
      return "";
    }

    let counter = 2;

    while (findCommitteeRoleByKey.get(nextKey) || findRoleDefinitionByKey.get(nextKey)) {
      nextKey = buildUniqueRoleKeyFromTitle(`${baseTitle} ${counter}`);
      counter += 1;
    }

    return nextKey;
  }

  function resolveCommitteeRolePayload(body, existingRole = null) {
    const title = normalizeCommitteeRoleText(body?.title, existingRole?.title ?? "");
    const summary = normalizeCommitteeRoleText(body?.summary, existingRole?.summary ?? "");
    const responsibilities = normalizeCommitteeRoleText(
      body?.responsibilities,
      existingRole?.responsibilities ?? summary,
    );
    const personalBlurb = normalizeCommitteeRoleText(
      body?.personalBlurb,
      existingRole?.personal_blurb ?? "",
    );
    const photoDataUrl =
      body?.photoDataUrl === null
        ? null
        : normalizeCommitteeRolePhotoDataUrl(
            body?.photoDataUrl ?? existingRole?.photo_data_url ?? null,
          );
    const assignedUsername = normalizeCommitteeRoleText(body?.assignedUsername);

    return {
      title,
      summary,
      responsibilities: responsibilities || summary,
      personalBlurb,
      photoDataUrl,
      assignedUsername: assignedUsername || null,
    };
  }

  function buildEditableProfileResponse(user, disciplines, loanBow, canViewRfidTag) {
    const editableProfile = buildEditableMemberProfile(user, disciplines, loanBow);

    if (canViewRfidTag) {
      return editableProfile;
    }

    return {
      ...editableProfile,
      rfidTag: "",
    };
  }

  app.get("/api/committee-roles", (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    res.json({
      success: true,
      roles: listCommitteeRoles.all().map(buildCommitteeRole),
      members: actorHasPermission(actor, PERMISSIONS.MANAGE_COMMITTEE_ROLES)
        ? listAllUsers.all().map((user) => ({
            username: user.username,
            fullName: `${user.first_name} ${user.surname}`,
            userType: user.user_type,
          }))
        : [],
    });
  });

  app.post("/api/committee-roles", (req, res) => {
    const actor = getActorUser(req);

    if (
      !actor ||
      !actorHasPermission(actor, PERMISSIONS.MANAGE_COMMITTEE_ROLES)
    ) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to create committee roles.",
      });
      return;
    }

    const payload = resolveCommitteeRolePayload(req.body);

    if (!payload.title || !payload.summary) {
      res.status(400).json({
        success: false,
        message: "A title and summary are required.",
      });
      return;
    }

    if (
      payload.assignedUsername &&
      !findUserByUsername.get(payload.assignedUsername)
    ) {
      res.status(404).json({
        success: false,
        message: "Assigned member not found.",
      });
      return;
    }

    const roleKey = buildUniqueCommitteeRoleKey(payload.title);

    if (!roleKey) {
      res.status(400).json({
        success: false,
        message: "A valid committee role title is required.",
      });
      return;
    }

    const displayOrder = findMaxCommitteeRoleDisplayOrder.get().maxDisplayOrder + 1;

    insertCommitteeRole.run({
      roleKey,
      title: payload.title,
      summary: payload.summary,
      responsibilities: payload.responsibilities,
      personalBlurb: payload.personalBlurb,
      photoDataUrl: payload.photoDataUrl,
      displayOrder,
      assignedUsername: payload.assignedUsername,
    });

    const createdRole = listCommitteeRoles
      .all()
      .map(buildCommitteeRole)
      .find((entry) => entry.roleKey === roleKey);

    res.status(201).json({
      success: true,
      role: createdRole,
    });
  });

  app.put("/api/committee-roles/:id", (req, res) => {
    const actor = getActorUser(req);

    if (
      !actor ||
      !actorHasPermission(actor, PERMISSIONS.MANAGE_COMMITTEE_ROLES)
    ) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to update committee roles.",
      });
      return;
    }

    const role = findCommitteeRoleById.get(req.params.id);

    if (!role) {
      res.status(404).json({
        success: false,
        message: "Committee role not found.",
      });
      return;
    }

    const payload = resolveCommitteeRolePayload(req.body, role);

    if (
      payload.assignedUsername &&
      !findUserByUsername.get(payload.assignedUsername)
    ) {
      res.status(404).json({
        success: false,
        message: "Assigned member not found.",
      });
      return;
    }

    if (!payload.title || !payload.summary) {
      res.status(400).json({
        success: false,
        message: "A title and summary are required.",
      });
      return;
    }

    updateCommitteeRoleDetails.run({
      id: role.id,
      title: payload.title,
      summary: payload.summary,
      responsibilities: payload.responsibilities,
      personalBlurb: payload.personalBlurb,
      photoDataUrl: payload.photoDataUrl,
      assignedUsername: payload.assignedUsername,
    });

    const updatedRole = listCommitteeRoles
      .all()
      .map(buildCommitteeRole)
      .find((entry) => entry.id === role.id);

    res.json({
      success: true,
      role: updatedRole,
    });
  });

  app.delete("/api/committee-roles/:id", (req, res) => {
    const actor = getActorUser(req);

    if (
      !actor ||
      !actorHasPermission(actor, PERMISSIONS.MANAGE_COMMITTEE_ROLES)
    ) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to delete committee roles.",
      });
      return;
    }

    const role = findCommitteeRoleById.get(req.params.id);

    if (!role) {
      res.status(404).json({
        success: false,
        message: "Committee role not found.",
      });
      return;
    }

    deleteCommitteeRoleById.run(role.id);

    res.json({
      success: true,
      deletedRoleId: role.id,
    });
  });

  app.get("/api/user-profiles/:username", (req, res) => {
    const actor = getActorUser(req);
    const requestedUsername = req.params.username;

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const isSelf =
      actor.username.localeCompare(requestedUsername, undefined, {
        sensitivity: "accent",
      }) === 0;

    const canManageMembers = actorHasPermission(
      actor,
      PERMISSIONS.MANAGE_MEMBERS,
    );

    if (!isSelf && !canManageMembers) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to edit another member profile.",
      });
      return;
    }

    const user = findUserByUsername.get(requestedUsername);

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Member profile not found.",
      });
      return;
    }

    const disciplines = findDisciplinesByUsername
      .all(user.username)
      .map((discipline) => discipline.discipline);
    const loanBow = findLoanBowByUsername.get(user.username);

    res.json({
      success: true,
      editableProfile: buildEditableProfileResponse(
        user,
        disciplines,
        loanBow,
        canManageMembers,
      ),
      userProfile: buildMemberUserProfile(user, disciplines),
      userTypes: listAssignableRoleKeys(),
      disciplines: ALLOWED_DISCIPLINES,
    });
  });

  app.post("/api/user-profiles", (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_MEMBERS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to create member profiles.",
      });
      return;
    }

    const {
      username,
      firstName,
      surname,
      password,
      rfidTag,
      activeMember,
      membershipFeesDue,
      coachingVolunteer,
      userType,
      disciplines,
      loanBow,
    } = req.body ?? {};

    if (findUserByUsername.get(username ?? "")) {
      res.status(409).json({
        success: false,
        message: "A member with that username already exists.",
      });
      return;
    }

    const result = saveMemberProfile({
      username,
      firstName,
      surname,
      password,
      rfidTag,
      activeMember,
      membershipFeesDue,
      coachingVolunteer,
      userType,
      disciplines,
      loanBow,
      existingUser: null,
    });

    if (!result.success) {
      res.status(result.status).json(result);
      return;
    }

    res.status(201).json({
      success: true,
      ...result,
    });
  });

  app.put("/api/user-profiles/:username", (req, res) => {
    const actor = getActorUser(req);
    const requestedUsername = req.params.username;

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const existingUser = findUserByUsername.get(requestedUsername);

    if (!existingUser) {
      res.status(404).json({
        success: false,
        message: "Member profile not found.",
      });
      return;
    }

    const isSelf =
      actor.username.localeCompare(existingUser.username, undefined, {
        sensitivity: "accent",
      }) === 0;

    const canManageMembers = actorHasPermission(
      actor,
      PERMISSIONS.MANAGE_MEMBERS,
    );

    if (!isSelf && !canManageMembers) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to update another member profile.",
      });
      return;
    }

    const {
      firstName,
      surname,
      password,
      rfidTag,
      activeMember,
      membershipFeesDue,
      coachingVolunteer,
      userType,
      disciplines,
      loanBow,
    } = req.body ?? {};

    const result = saveMemberProfile({
      username: existingUser.username,
      firstName,
      surname,
      password,
      rfidTag: canManageMembers ? rfidTag : existingUser.rfid_tag,
      activeMember: canManageMembers ? activeMember : existingUser.active_member,
      membershipFeesDue: canManageMembers
        ? membershipFeesDue
        : existingUser.membership_fees_due,
      coachingVolunteer: canManageMembers
        ? coachingVolunteer
        : existingUser.coaching_volunteer,
      userType: canManageMembers ? userType : existingUser.user_type,
      disciplines,
      loanBow: canManageMembers
        ? loanBow
        : buildLoanBowRecord(findLoanBowByUsername.get(existingUser.username)),
      existingUser,
    });

    if (!result.success) {
      res.status(result.status).json(result);
      return;
    }

    res.json({
      success: true,
      ...result,
      editableProfile: buildEditableProfileResponse(
        findUserByUsername.get(existingUser.username),
        result.editableProfile?.disciplines ?? [],
        findLoanBowByUsername.get(existingUser.username),
        canManageMembers,
      ),
    });
  });

  app.post("/api/user-profiles/:username/assign-rfid", (req, res) => {
    const actor = getActorUser(req);
    const requestedUsername = req.params.username;

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_MEMBERS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to issue member cards.",
      });
      return;
    }

    const existingUser = findUserByUsername.get(requestedUsername);
    const rfidTag =
      typeof req.body?.rfidTag === "string" ? req.body.rfidTag.trim() : "";

    if (!existingUser) {
      res.status(404).json({
        success: false,
        message: "Member profile not found.",
      });
      return;
    }

    if (!rfidTag) {
      res.status(400).json({
        success: false,
        message: "An RFID tag is required to issue a member card.",
      });
      return;
    }

    const disciplines = findDisciplinesByUsername
      .all(existingUser.username)
      .map((discipline) => discipline.discipline);
    const loanBow = buildLoanBowRecord(findLoanBowByUsername.get(existingUser.username));
    const result = saveMemberProfile({
      username: existingUser.username,
      firstName: existingUser.first_name,
      surname: existingUser.surname,
      password: existingUser.password,
      rfidTag,
      activeMember: existingUser.active_member,
      membershipFeesDue: existingUser.membership_fees_due,
      userType: existingUser.user_type,
      disciplines,
      loanBow,
      existingUser,
    });

    if (!result.success) {
      res.status(result.status).json(result);
      return;
    }

    res.json({
      success: true,
      ...result,
    });
  });

  app.get("/api/loan-bow-options", (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!actorHasPermission(actor, PERMISSIONS.MANAGE_LOAN_BOWS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to manage loan bow records.",
      });
      return;
    }

    res.json({
      success: true,
      members: listAllUsers
        .all()
        .filter(
          (user) =>
            !getPermissionsForRole(user.user_type).includes(
              PERMISSIONS.MANAGE_MEMBERS,
            ),
        )
        .map((user) => ({
          username: user.username,
          fullName: `${user.first_name} ${user.surname}`,
          userType: user.user_type,
        })),
    });
  });

  app.get("/api/loan-bow-profiles/:username", (req, res) => {
    const actor = getActorUser(req);
    const requestedUsername = req.params.username;

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!actorHasPermission(actor, PERMISSIONS.MANAGE_LOAN_BOWS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to manage loan bow records.",
      });
      return;
    }

    const user = findUserByUsername.get(requestedUsername);

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Member profile not found.",
      });
      return;
    }

    res.json({
      success: true,
      member: {
        username: user.username,
        fullName: `${user.first_name} ${user.surname}`,
        userType: user.user_type,
      },
      loanBow: buildLoanBowRecord(findLoanBowByUsername.get(user.username)),
    });
  });

  app.put("/api/loan-bow-profiles/:username", (req, res) => {
    const actor = getActorUser(req);
    const requestedUsername = req.params.username;

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!actorHasPermission(actor, PERMISSIONS.MANAGE_LOAN_BOWS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to manage loan bow records.",
      });
      return;
    }

    const user = findUserByUsername.get(requestedUsername);

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Member profile not found.",
      });
      return;
    }

    const loanBow = sanitizeLoanBow(req.body?.loanBow);

    saveLoanBowRecord(user.username, loanBow);

    res.json({
      success: true,
      member: {
        username: user.username,
        fullName: `${user.first_name} ${user.surname}`,
        userType: user.user_type,
      },
      loanBow: buildLoanBowRecord(findLoanBowByUsername.get(user.username)),
    });
  });

  app.post("/api/loan-bow-profiles/:username/return", (req, res) => {
    const actor = getActorUser(req);
    const requestedUsername = req.params.username;

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!actorHasPermission(actor, PERMISSIONS.MANAGE_LOAN_BOWS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to manage loan bow records.",
      });
      return;
    }

    const user = findUserByUsername.get(requestedUsername);

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Member profile not found.",
      });
      return;
    }

    const existingLoanBow = buildLoanBowRecord(
      findLoanBowByUsername.get(user.username),
    );
    const returnResult = sanitizeLoanBowReturn(
      existingLoanBow,
      req.body?.loanBowReturn,
    );

    if (!returnResult.success) {
      res.status(returnResult.status).json(returnResult);
      return;
    }

    saveLoanBowRecord(user.username, returnResult.loanBow);

    res.json({
      success: true,
      member: {
        username: user.username,
        fullName: `${user.first_name} ${user.surname}`,
        userType: user.user_type,
      },
      loanBow: buildLoanBowRecord(findLoanBowByUsername.get(user.username)),
    });
  });
}
