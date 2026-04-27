export function registerAdminMemberRoutes({
  actorHasPermission,
  ALLOWED_DISCIPLINES,
  app,
  buildCommitteeRole,
  buildEditableMemberProfile,
  buildLoanBowRecord,
  buildUniqueRoleKeyFromTitle,
  CURRENT_PERMISSION_KEY_SET,
  DISTANCE_SIGN_OFF_YARDS,
  getActorUser,
  getUtcTimestampParts,
  getPermissionsForRole,
  listAssignableRoleKeys,
  listProfilePageMembers,
  memberDirectoryGateway,
  roleCommitteeGateway,
  PERMISSIONS,
  refreshRoleAccessSnapshot,
  sanitizeLoanBow,
  sanitizeLoanBowReturn,
  saveLoanBowRecord,
  saveMemberProfile,
  TOURNAMENT_TYPE_OPTIONS,
  buildMemberUserProfile,
  memberDistanceSignOffRepository,
}) {
  async function buildEditableProfileWithDistanceSignOffs(
    user,
    disciplines,
    loanBow,
    canViewRfidTag,
  ) {
    return {
      ...buildEditableProfileResponse(user, disciplines, loanBow, canViewRfidTag),
      distanceSignOffs: await memberDistanceSignOffRepository.listByDiscipline(
        user.username,
        disciplines,
      ),
    };
  }

  async function buildRoleDefinitionPayload(role) {
    const [assignedUserCount, permissions] = await Promise.all([
      roleCommitteeGateway.countUsersByRoleKey(role.role_key),
      roleCommitteeGateway.listRolePermissionKeysByRoleKey(role.role_key),
    ]);

    return {
      roleKey: role.role_key,
      title: role.title,
      isSystem: Boolean(role.is_system),
      assignedUserCount: assignedUserCount.count ?? 0,
      permissions: permissions.filter((permissionKey) =>
        CURRENT_PERMISSION_KEY_SET.has(permissionKey),
      ),
    };
  }

  async function findMemberByUsername(username) {
    return memberDirectoryGateway.findUserByUsername(username);
  }

  async function listMemberDisciplines(username) {
    return (await memberDirectoryGateway.findDisciplinesByUsername(username)).map(
      (discipline) => discipline.discipline,
    );
  }

  async function findMemberLoanBow(username) {
    return memberDirectoryGateway.findLoanBowByUsername(username);
  }

  app.get("/api/profile-options", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (
      !actorHasPermission(actor, PERMISSIONS.MANAGE_MEMBERS) &&
      !actorHasPermission(actor, PERMISSIONS.SIGN_OFF_DISTANCES)
    ) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to load member options.",
      });
      return;
    }

    res.json({
      success: true,
      members: (await listProfilePageMembers()).map((user) => ({
        username: user.username,
        fullName: `${user.first_name} ${user.surname}`,
        userType: user.user_type,
      })),
      userTypes: listAssignableRoleKeys(),
      disciplines: ALLOWED_DISCIPLINES,
    });
  });

  app.get("/api/roles", async (req, res) => {
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

    const [roles, permissions] = await Promise.all([
      roleCommitteeGateway.listRoleDefinitions(),
      roleCommitteeGateway.listPermissionDefinitions(),
    ]);

    res.json({
      success: true,
      roles: await Promise.all(roles.map(buildRoleDefinitionPayload)),
      permissions: permissions.map((permission) => ({
        key: permission.permission_key,
        label: permission.label,
        description: permission.description,
      })),
    });
  });

  app.post("/api/roles", async (req, res) => {
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

    const createdRole = await roleCommitteeGateway.createRole({
      permissions: normalizedPermissions,
      roleKey,
      title,
    });
    await refreshRoleAccessSnapshot();

    res.status(201).json({
      success: true,
      role: await buildRoleDefinitionPayload(createdRole),
    });
  });

  app.put("/api/roles/:roleKey", async (req, res) => {
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
    const existingRole = await roleCommitteeGateway.findRoleDefinitionByKey(roleKey);

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

    const updatedRole = await roleCommitteeGateway.updateRole({
      permissions: normalizedPermissions,
      roleKey,
      title,
    });
    await refreshRoleAccessSnapshot();

    res.json({
      success: true,
      role: await buildRoleDefinitionPayload(updatedRole),
    });
  });

  app.delete("/api/roles/:roleKey", async (req, res) => {
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
    const existingRole = await roleCommitteeGateway.findRoleDefinitionByKey(roleKey);

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

    const assignedUserCount =
      (await roleCommitteeGateway.countUsersByRoleKey(roleKey))?.count ?? 0;

    if (assignedUserCount > 0) {
      res.status(409).json({
        success: false,
        message: "This role is still assigned to members and cannot be deleted.",
      });
      return;
    }

    await roleCommitteeGateway.deleteRole(roleKey);
    await refreshRoleAccessSnapshot();

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

  const MAX_COMMITTEE_PHOTO_DATA_URL_LENGTH = 1_000_000;
  const COMMITTEE_PHOTO_DATA_URL_PATTERN =
    /^data:image\/(?:png|jpeg|jpg|webp);base64,[a-z0-9+/=]+$/i;

  function normalizeCommitteeRolePhotoDataUrl(value) {
    if (typeof value !== "string") {
      return null;
    }

    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return null;
    }

    if (
      trimmedValue.length > MAX_COMMITTEE_PHOTO_DATA_URL_LENGTH ||
      !COMMITTEE_PHOTO_DATA_URL_PATTERN.test(trimmedValue)
    ) {
      return null;
    }

    return trimmedValue;
  }

  async function buildUniqueCommitteeRoleKey(title) {
    const baseTitle = normalizeCommitteeRoleText(title);

    if (!baseTitle) {
      return "";
    }

    let nextKey = buildUniqueRoleKeyFromTitle(baseTitle);

    if (!nextKey) {
      return "";
    }

    let counter = 2;

    while (
      (await roleCommitteeGateway.findCommitteeRoleByKey(nextKey)) ||
      (await roleCommitteeGateway.findRoleDefinitionByKey(nextKey))
    ) {
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

  app.get("/api/committee-roles", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const committeeRoles = await roleCommitteeGateway.listCommitteeRoles();

    res.json({
      success: true,
      roles: committeeRoles.map(buildCommitteeRole),
      members: actorHasPermission(actor, PERMISSIONS.MANAGE_COMMITTEE_ROLES)
        ? (await memberDirectoryGateway.listAllUsers()).map((user) => ({
            username: user.username,
            fullName: `${user.first_name} ${user.surname}`,
            userType: user.user_type,
          }))
        : [],
    });
  });

  app.post("/api/committee-roles", async (req, res) => {
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
      !(await findMemberByUsername(payload.assignedUsername))
    ) {
      res.status(404).json({
        success: false,
        message: "Assigned member not found.",
      });
      return;
    }

    const roleKey = await buildUniqueCommitteeRoleKey(payload.title);

    if (!roleKey) {
      res.status(400).json({
        success: false,
        message: "A valid committee role title is required.",
      });
      return;
    }

    const displayOrder =
      (await roleCommitteeGateway.findMaxCommitteeRoleDisplayOrder())
        .maxDisplayOrder + 1;

    await roleCommitteeGateway.insertCommitteeRole({
      roleKey,
      title: payload.title,
      summary: payload.summary,
      responsibilities: payload.responsibilities,
      personalBlurb: payload.personalBlurb,
      photoDataUrl: payload.photoDataUrl,
      displayOrder,
      assignedUsername: payload.assignedUsername,
    });

    const createdRole = (await roleCommitteeGateway.listCommitteeRoles())
      .map(buildCommitteeRole)
      .find((entry) => entry.roleKey === roleKey);

    res.status(201).json({
      success: true,
      role: createdRole,
    });
  });

  app.put("/api/committee-roles/:id", async (req, res) => {
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

    const role = await roleCommitteeGateway.findCommitteeRoleById(req.params.id);

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
      !(await findMemberByUsername(payload.assignedUsername))
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

    await roleCommitteeGateway.updateCommitteeRoleDetails({
      id: role.id,
      title: payload.title,
      summary: payload.summary,
      responsibilities: payload.responsibilities,
      personalBlurb: payload.personalBlurb,
      photoDataUrl: payload.photoDataUrl,
      assignedUsername: payload.assignedUsername,
    });

    const updatedRole = (await roleCommitteeGateway.listCommitteeRoles())
      .map(buildCommitteeRole)
      .find((entry) => entry.id === role.id);

    res.json({
      success: true,
      role: updatedRole,
    });
  });

  app.delete("/api/committee-roles/:id", async (req, res) => {
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

    const role = await roleCommitteeGateway.findCommitteeRoleById(req.params.id);

    if (!role) {
      res.status(404).json({
        success: false,
        message: "Committee role not found.",
      });
      return;
    }

    await roleCommitteeGateway.deleteCommitteeRoleById(role.id);

    res.json({
      success: true,
      deletedRoleId: role.id,
    });
  });

  app.get("/api/user-profiles/:username", async (req, res) => {
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
    const canSignOffDistances = actorHasPermission(
      actor,
      PERMISSIONS.SIGN_OFF_DISTANCES,
    );

    if (!isSelf && !canManageMembers && !canSignOffDistances) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to edit another member profile.",
      });
      return;
    }

    const user = await findMemberByUsername(requestedUsername);

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Member profile not found.",
      });
      return;
    }

    const disciplines = await listMemberDisciplines(user.username);
    const loanBow = await findMemberLoanBow(user.username);

    res.json({
      success: true,
      editableProfile: await buildEditableProfileWithDistanceSignOffs(
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

  app.post("/api/user-profiles", async (req, res) => {
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

    if (await findMemberByUsername(username ?? "")) {
      res.status(409).json({
        success: false,
        message: "A member with that username already exists.",
      });
      return;
    }

    const result = await saveMemberProfile({
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

  app.put("/api/user-profiles/:username", async (req, res) => {
    const actor = getActorUser(req);
    const requestedUsername = req.params.username;

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const existingUser = await findMemberByUsername(requestedUsername);

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
    const canManageMemberDisciplines =
      canManageMembers ||
      actorHasPermission(actor, PERMISSIONS.MANAGE_MEMBER_DISCIPLINES);

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

    const result = await saveMemberProfile({
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
      disciplines: canManageMemberDisciplines
        ? disciplines
        : await listMemberDisciplines(existingUser.username),
      loanBow: canManageMembers
        ? loanBow
        : buildLoanBowRecord(await findMemberLoanBow(existingUser.username)),
      existingUser,
    });

    if (!result.success) {
      res.status(result.status).json(result);
      return;
    }

    res.json({
      success: true,
      ...result,
      editableProfile: await buildEditableProfileWithDistanceSignOffs(
        await findMemberByUsername(existingUser.username),
        result.editableProfile?.disciplines ?? [],
        await findMemberLoanBow(existingUser.username),
        canManageMembers,
      ),
    });
  });

  app.post("/api/user-profiles/:username/distance-sign-offs", async (req, res) => {
    const actor = getActorUser(req);
    const requestedUsername = req.params.username;

    if (!actor || !actorHasPermission(actor, PERMISSIONS.SIGN_OFF_DISTANCES)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to sign off member distances.",
      });
      return;
    }

    const member = await findMemberByUsername(requestedUsername);

    if (!member) {
      res.status(404).json({
        success: false,
        message: "Member profile not found.",
      });
      return;
    }

    const discipline =
      typeof req.body?.discipline === "string" ? req.body.discipline.trim() : "";
    const distanceYards = Number.parseInt(req.body?.distanceYards, 10);
    const memberUsernameConfirmation =
      typeof req.body?.memberUsernameConfirmation === "string"
        ? req.body.memberUsernameConfirmation.trim()
        : "";
    const disciplines = await listMemberDisciplines(member.username);

    if (!disciplines.includes(discipline)) {
      res.status(400).json({
        success: false,
        message: "Choose a discipline recorded on this member profile.",
      });
      return;
    }

    if (!DISTANCE_SIGN_OFF_YARDS.includes(distanceYards)) {
      res.status(400).json({
        success: false,
        message: "Choose a valid distance to sign off.",
      });
      return;
    }

    if (
      member.username.localeCompare(memberUsernameConfirmation, undefined, {
        sensitivity: "accent",
      }) !== 0
    ) {
      res.status(400).json({
        success: false,
        message: "The member username confirmation does not match.",
      });
      return;
    }

    const [signedOffAtDate, signedOffAtTime] = getUtcTimestampParts();

    await memberDistanceSignOffRepository.upsert({
      username: member.username,
      discipline,
      distanceYards,
      signedOffByUsername: actor.username,
      signedOffAtDate,
      signedOffAtTime,
    });

    const loanBow = await findMemberLoanBow(member.username);

    res.status(201).json({
      success: true,
      message: `${discipline} ${distanceYards} yds signed off for ${member.first_name} ${member.surname}.`,
      signOff:
        (await memberDistanceSignOffRepository
          .listByUsername(member.username))
          .find(
            (entry) =>
              entry.discipline === discipline &&
              entry.distanceYards === distanceYards,
          ) ?? null,
      editableProfile: await buildEditableProfileWithDistanceSignOffs(
        member,
        disciplines,
        loanBow,
        actorHasPermission(actor, PERMISSIONS.MANAGE_MEMBERS),
      ),
    });
  });

  app.post("/api/user-profiles/:username/assign-rfid", async (req, res) => {
    const actor = getActorUser(req);
    const requestedUsername = req.params.username;

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_MEMBERS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to issue member cards.",
      });
      return;
    }

    const existingUser = await findMemberByUsername(requestedUsername);
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

    const disciplines = await listMemberDisciplines(existingUser.username);
    const loanBow = buildLoanBowRecord(await findMemberLoanBow(existingUser.username));
    const result = await saveMemberProfile({
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

  app.get("/api/loan-bow-options", async (req, res) => {
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
      members: (await memberDirectoryGateway
        .listAllUsers())
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

  app.get("/api/loan-bow-profiles/:username", async (req, res) => {
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

    const user = await findMemberByUsername(requestedUsername);

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
      loanBow: buildLoanBowRecord(await findMemberLoanBow(user.username)),
    });
  });

  app.put("/api/loan-bow-profiles/:username", async (req, res) => {
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

    const user = await findMemberByUsername(requestedUsername);

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Member profile not found.",
      });
      return;
    }

    const loanBow = sanitizeLoanBow(req.body?.loanBow);

    await saveLoanBowRecord(user.username, loanBow);

    res.json({
      success: true,
      member: {
        username: user.username,
        fullName: `${user.first_name} ${user.surname}`,
        userType: user.user_type,
      },
      loanBow: buildLoanBowRecord(await findMemberLoanBow(user.username)),
    });
  });

  app.post("/api/loan-bow-profiles/:username/return", async (req, res) => {
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

    const user = await findMemberByUsername(requestedUsername);

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Member profile not found.",
      });
      return;
    }

    const existingLoanBow = buildLoanBowRecord(
      await findMemberLoanBow(user.username),
    );
    const returnResult = sanitizeLoanBowReturn(
      existingLoanBow,
      req.body?.loanBowReturn,
    );

    if (!returnResult.success) {
      res.status(returnResult.status).json(returnResult);
      return;
    }

    await saveLoanBowRecord(user.username, returnResult.loanBow);

    res.json({
      success: true,
      member: {
        username: user.username,
        fullName: `${user.first_name} ${user.surname}`,
        userType: user.user_type,
      },
      loanBow: buildLoanBowRecord(await findMemberLoanBow(user.username)),
    });
  });
}
