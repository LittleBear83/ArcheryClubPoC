export function registerAuthRoutes({
  app,
  buildGuestUserProfile,
  buildMemberUserProfile,
  clearSessionCookie,
  createSessionCookie,
  databasePath,
  findDisciplinesByUsername,
  findUserByCredentials,
  findUserByRfid,
  findUserByUsername,
  getDeactivatedRfidTag,
  getSessionUsername,
  getUtcTimestampParts,
  hashPassword,
  insertGuestLoginEvent,
  insertLoginEvent,
  latestRfidScan,
  listAllUsers,
  syncMemberStatusWithFees,
  updateUserPassword,
  verifyPassword,
}) {
  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body ?? {};

    if (!username || !password) {
      res.status(400).json({
        success: false,
        message: "Username and password are required.",
      });
      return;
    }

    const loginUser = findUserByCredentials.get(username);
    const isValidPassword = verifyPassword(password, loginUser?.password);
    const user = syncMemberStatusWithFees(isValidPassword ? loginUser : null);

    if (!user) {
      res.status(401).json({
        success: false,
        message:
          "Incorrect username or password. have you tried using your Fob instead?",
      });
      return;
    }

    if (!user.active_member) {
      res.status(403).json({
        success: false,
        message:
          "Your member account has been susspended because your membership renewal date has passed.\nPlease contact a committee member.",
      });
      return;
    }

    if (loginUser.password === password) {
      updateUserPassword.run(hashPassword(password), user.username);
    }

    insertLoginEvent.run(user.username, "password", ...getUtcTimestampParts());
    res.setHeader("Set-Cookie", createSessionCookie(user.username));

    res.json({
      success: true,
      userProfile: buildMemberUserProfile(
        user,
        findDisciplinesByUsername
          .all(user.username)
          .map((discipline) => discipline.discipline),
      ),
    });
  });

  app.post("/api/auth/rfid", (req, res) => {
    const { rfidTag } = req.body ?? {};

    if (!rfidTag) {
      res.status(400).json({
        success: false,
        message: "RFID tag is required.",
      });
      return;
    }

    const user =
      syncMemberStatusWithFees(findUserByRfid.get(rfidTag)) ??
      syncMemberStatusWithFees(findUserByRfid.get(getDeactivatedRfidTag(rfidTag)));

    if (!user) {
      res.status(401).json({
        success: false,
        message: "RFID tag not recognised.",
      });
      return;
    }

    if (!user.active_member) {
      res.status(403).json({
        success: false,
        message:
          "Your member account has been susspended because your membership renewal date has passed.\nPlease contact a committee member.",
      });
      return;
    }

    insertLoginEvent.run(user.username, "rfid", ...getUtcTimestampParts());
    res.setHeader("Set-Cookie", createSessionCookie(user.username));

    res.json({
      success: true,
      userProfile: buildMemberUserProfile(
        user,
        findDisciplinesByUsername
          .all(user.username)
          .map((discipline) => discipline.discipline),
      ),
    });
  });

  app.post("/api/auth/logout", (_req, res) => {
    res.setHeader("Set-Cookie", clearSessionCookie());
    res.json({ success: true });
  });

  app.get("/api/auth/session", (req, res) => {
    const sessionUsername = getSessionUsername(req);

    if (!sessionUsername) {
      res.status(401).json({
        success: false,
        message: "Your session has expired. Please sign in again.",
      });
      return;
    }

    const user = syncMemberStatusWithFees(findUserByUsername.get(sessionUsername));

    if (!user) {
      res.status(401).json({
        success: false,
        message: "Your session could not be found. Please sign in again.",
      });
      return;
    }

    if (!user.active_member) {
      res.status(403).json({
        success: false,
        message:
          "Your member account has been susspended because your membership renewal date has passed.\nPlease contact a committee member.",
      });
      return;
    }

    res.json({
      success: true,
      userProfile: buildMemberUserProfile(
        user,
        findDisciplinesByUsername
          .all(user.username)
          .map((discipline) => discipline.discipline),
      ),
    });
  });

  app.get("/api/auth/rfid/latest-scan", (_req, res) => {
    const hasUndeliveredScan =
      latestRfidScan.sequence > latestRfidScan.deliveredSequence;

    if (hasUndeliveredScan) {
      latestRfidScan.deliveredSequence = latestRfidScan.sequence;
    }

    res.json({
      success: true,
      scan: hasUndeliveredScan
        ? {
            sequence: latestRfidScan.sequence,
            rfidTag: latestRfidScan.rfidTag,
            scannedAt: latestRfidScan.scannedAt,
            source: latestRfidScan.source,
            scanType: latestRfidScan.scanType,
            cardBrand: latestRfidScan.cardBrand,
          }
        : null,
    });
  });

  app.post("/api/auth/guest-login", (req, res) => {
    const { firstName, surname, archeryGbMembershipNumber, invitedByUsername } =
      req.body ?? {};
    const trimmedMembershipNumber = archeryGbMembershipNumber?.trim() ?? "";
    const membershipDigits = trimmedMembershipNumber.replace(/\D/g, "");
    const trimmedInvitedByUsername = invitedByUsername?.trim() ?? "";

    if (
      !firstName ||
      !surname ||
      !archeryGbMembershipNumber ||
      !trimmedInvitedByUsername
    ) {
      res.status(400).json({
        success: false,
        message:
          "First name, surname, Archery GB membership number, and inviting member are required.",
      });
      return;
    }

    if (membershipDigits.length < 7) {
      res.status(400).json({
        success: false,
        message: "Archery GB membership number must contain at least 7 digits.",
      });
      return;
    }

    const invitingMember = findUserByUsername.get(trimmedInvitedByUsername);

    if (!invitingMember) {
      res.status(400).json({
        success: false,
        message: "Inviting member could not be found.",
      });
      return;
    }

    insertGuestLoginEvent.run(
      firstName.trim(),
      surname.trim(),
      trimmedMembershipNumber,
      invitingMember.username,
      `${invitingMember.first_name} ${invitingMember.surname}`,
      ...getUtcTimestampParts(),
    );

    res.json({
      success: true,
      userProfile: buildGuestUserProfile({
        firstName: firstName.trim(),
        surname: surname.trim(),
        archeryGbMembershipNumber: trimmedMembershipNumber,
        invitedByUsername: invitingMember.username,
        invitedByName: `${invitingMember.first_name} ${invitingMember.surname}`,
      }),
    });
  });

  app.get("/api/guest-inviter-members", (_req, res) => {
    res.json({
      success: true,
      members: listAllUsers.all().map((user) => ({
        username: user.username,
        firstName: user.first_name,
        surname: user.surname,
        fullName: `${user.first_name} ${user.surname}`,
        userType: user.user_type,
      })),
    });
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      success: true,
      databasePath,
    });
  });
}
