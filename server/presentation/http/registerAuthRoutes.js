export function registerAuthRoutes({
  announcementGateway,
  app,
  auditChangeLogger,
  buildGuestUserProfile,
  buildMemberUserProfile,
  clearCsrfCookie,
  clearSessionCookie,
  createCsrfCookie,
  createSessionCookie,
  getDeactivatedRfidTag,
  getCsrfToken,
  getSessionUsername,
  getUtcTimestampParts,
  hashPassword,
  memberAuthGateway,
  rfidReaderStatus,
  serverEventBus,
  syncMemberStatusWithFees,
  verifyPassword,
}) {
  // Auth routes own session-cookie creation and login-event recording; callers
  // receive normalized profile payloads for the frontend session snapshot.
  const buildAuthFailureActor = ({
    attemptedRfidTag,
    attemptedUsername,
  }) => {
    const normalizedUsername = String(attemptedUsername ?? "").trim();

    if (normalizedUsername) {
      return normalizedUsername;
    }

    const normalizedRfidTag = String(attemptedRfidTag ?? "").trim();

    if (normalizedRfidTag) {
      return `rfid:${normalizedRfidTag.slice(-4)}`;
    }

    return "anonymous";
  };

  const recordFailedAuthAttempt = ({
    attemptedRfidTag = "",
    attemptedUsername = "",
    failureReason,
    incorrectFields = [],
    method,
    req,
    statusCode,
    target,
  }) => {
    if (!auditChangeLogger) {
      return;
    }

    const normalizedAttemptedUsername = String(attemptedUsername ?? "").trim();
    const normalizedAttemptedRfidTag = String(attemptedRfidTag ?? "").trim();
    const [changedAtDate, changedAtTime] = getUtcTimestampParts();
    const attemptedRfidTagSuffix = normalizedAttemptedRfidTag
      ? normalizedAttemptedRfidTag.slice(-4)
      : null;

    void auditChangeLogger.recordEntityChange({
      action: "created",
      actorUsername: buildAuthFailureActor({
        attemptedRfidTag: normalizedAttemptedRfidTag,
        attemptedUsername: normalizedAttemptedUsername,
      }),
      after: {
        activityType: "login_failed",
        attemptedRfidTagSuffix,
        attemptedUsername: normalizedAttemptedUsername || null,
        failureReason,
        incorrectFields,
        method,
      },
      before: null,
      changedAtDate,
      changedAtTime,
      entityId: [
        method,
        normalizedAttemptedUsername || attemptedRfidTagSuffix || "anonymous",
        changedAtDate,
        changedAtTime,
        failureReason,
      ].join(":"),
      entityLabel:
        normalizedAttemptedUsername ||
        (attemptedRfidTagSuffix
          ? `RFID ending ${attemptedRfidTagSuffix}`
          : "Unknown login attempt"),
      entityType: "auth_activity",
      req,
      statusCode,
      target,
    }).catch((auditError) => {
      console.error("Failed to record failed login audit event", auditError);
    });
  };

  const setSessionCookies = (req, res, username) => {
    const csrfToken = getCsrfToken(req);

    res.setHeader("Set-Cookie", [
      createSessionCookie(username),
      createCsrfCookie(csrfToken),
    ]);

    return csrfToken;
  };

  const markActiveAnnouncementsSeen = async (username) => {
    if (!announcementGateway || !username) {
      return;
    }

    const [seenAtDate, seenAtTime] = getUtcTimestampParts();
    const activeAnnouncements = await announcementGateway.listActiveAnnouncements(
      seenAtDate,
    );

    if (activeAnnouncements.length === 0) {
      return;
    }

    await announcementGateway.markActiveAnnouncementsSeenByUsername({
      activeAnnouncements,
      seenAtDate,
      seenAtTime,
      username,
    });
  };

  const broadcastRangeMembersUpdated = (scope = "range-members") => {
    serverEventBus?.broadcastToAll("range-members.updated", {
      changedAt: new Date().toISOString(),
      scope,
    });
  };

  app.post("/api/auth/login", async (req, res) => {
    const { username, password, deviceType } = req.body ?? {};

    if (!username || !password) {
      recordFailedAuthAttempt({
        attemptedUsername: username,
        failureReason: "missing_credentials",
        incorrectFields: [
          ...(!username ? ["username"] : []),
          ...(!password ? ["password"] : []),
        ],
        method: "password",
        req,
        statusCode: 400,
        target: "/api/auth/login",
      });
      res.status(400).json({
        success: false,
        message: "Username and password are required.",
      });
      return;
    }

    const loginUser = await memberAuthGateway.findUserByCredentials(username);
    const isValidPassword = verifyPassword(password, loginUser?.password);
    const user = await syncMemberStatusWithFees(isValidPassword ? loginUser : null);

    if (!user) {
      recordFailedAuthAttempt({
        attemptedUsername: username,
        failureReason: loginUser ? "password_incorrect" : "username_not_found",
        incorrectFields: [loginUser ? "password" : "username"],
        method: "password",
        req,
        statusCode: 401,
        target: "/api/auth/login",
      });
      res.status(401).json({
        success: false,
        message:
          "Incorrect username or password. have you tried using your Fob instead?",
      });
      return;
    }

    if (!user.active_member) {
      recordFailedAuthAttempt({
        attemptedUsername: user.username,
        failureReason: "account_inactive",
        incorrectFields: [],
        method: "password",
        req,
        statusCode: 403,
        target: "/api/auth/login",
      });
      res.status(403).json({
        success: false,
        message:
          "Your member account has been susspended because your membership renewal date has passed.\nPlease contact a committee member.",
      });
      return;
    }

    if (loginUser.password === password) {
      await memberAuthGateway.updateUserPassword(
        user.username,
        hashPassword(password),
      );
    }

    const timestampParts = getUtcTimestampParts();
    const loginMethod = deviceType === "mobile" ? "password-mobile" : "password";

    await memberAuthGateway.recordLoginEvent({
      method: loginMethod,
      timestampParts,
      username: user.username,
    });
    const [loggedAtDate, loggedAtTime] = timestampParts;

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "created",
        actorUsername: user.username,
        after: {
          activityType: "login",
          method: loginMethod,
          username: user.username,
        },
        before: null,
        changedAtDate: loggedAtDate,
        changedAtTime: loggedAtTime,
        entityId: `${user.username}:${loggedAtDate}:${loggedAtTime}:${loginMethod}`,
        entityLabel: `${user.first_name} ${user.surname}`.trim() || user.username,
        entityType: "member_activity",
        req,
        statusCode: 200,
        target: "/api/auth/login",
      }).catch((auditError) => {
        console.error("Failed to record login audit event", auditError);
      });
    }
    await markActiveAnnouncementsSeen(user.username);
    broadcastRangeMembersUpdated("auth.login");
    const csrfToken = setSessionCookies(req, res, user.username);
    const disciplines = await memberAuthGateway.findDisciplinesByUsername(
      user.username,
    );

    res.json({
      success: true,
      csrfToken,
      userProfile: buildMemberUserProfile(
        user,
        disciplines.map((discipline) => discipline.discipline),
      ),
    });
  });

  app.post("/api/auth/rfid", async (req, res) => {
    const { rfidTag } = req.body ?? {};

    if (!rfidTag) {
      recordFailedAuthAttempt({
        failureReason: "missing_rfid_tag",
        incorrectFields: ["rfid_tag"],
        method: "rfid",
        req,
        statusCode: 400,
        target: "/api/auth/rfid",
      });
      res.status(400).json({
        success: false,
        message: "RFID tag is required.",
      });
      return;
    }

    const user =
      (await syncMemberStatusWithFees(await memberAuthGateway.findUserByRfid(rfidTag))) ??
      (await syncMemberStatusWithFees(
        await memberAuthGateway.findUserByRfid(getDeactivatedRfidTag(rfidTag)),
      ));

    if (!user) {
      recordFailedAuthAttempt({
        attemptedRfidTag: rfidTag,
        failureReason: "rfid_tag_not_recognised",
        incorrectFields: ["rfid_tag"],
        method: "rfid",
        req,
        statusCode: 401,
        target: "/api/auth/rfid",
      });
      res.status(401).json({
        success: false,
        message: "RFID tag not recognised.",
      });
      return;
    }

    if (!user.active_member) {
      recordFailedAuthAttempt({
        attemptedRfidTag: rfidTag,
        attemptedUsername: user.username,
        failureReason: "account_inactive",
        incorrectFields: [],
        method: "rfid",
        req,
        statusCode: 403,
        target: "/api/auth/rfid",
      });
      res.status(403).json({
        success: false,
        message:
          "Your member account has been susspended because your membership renewal date has passed.\nPlease contact a committee member.",
      });
      return;
    }

    const timestampParts = getUtcTimestampParts();

    await memberAuthGateway.recordLoginEvent({
      method: "rfid",
      timestampParts,
      username: user.username,
    });
    const [loggedAtDate, loggedAtTime] = timestampParts;

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "created",
        actorUsername: user.username,
        after: {
          activityType: "login",
          method: "rfid",
          username: user.username,
        },
        before: null,
        changedAtDate: loggedAtDate,
        changedAtTime: loggedAtTime,
        entityId: `${user.username}:${loggedAtDate}:${loggedAtTime}:rfid`,
        entityLabel: `${user.first_name} ${user.surname}`.trim() || user.username,
        entityType: "member_activity",
        req,
        statusCode: 200,
        target: "/api/auth/rfid",
      }).catch((auditError) => {
        console.error("Failed to record RFID login audit event", auditError);
      });
    }
    await markActiveAnnouncementsSeen(user.username);
    broadcastRangeMembersUpdated("auth.rfid-login");
    const csrfToken = setSessionCookies(req, res, user.username);
    const disciplines = await memberAuthGateway.findDisciplinesByUsername(
      user.username,
    );

    res.json({
      success: true,
      csrfToken,
      userProfile: buildMemberUserProfile(
        user,
        disciplines.map((discipline) => discipline.discipline),
      ),
    });
  });

  app.get("/api/auth/rfid/status", (_req, res) => {
    res.json({
      success: true,
      checked: Boolean(rfidReaderStatus?.checked),
      detected: Boolean(rfidReaderStatus?.detected),
    });
  });

  app.post("/api/auth/logout", (_req, res) => {
    res.setHeader("Set-Cookie", [clearSessionCookie(), clearCsrfCookie()]);
    res.json({ success: true });
  });

  app.get("/api/auth/csrf", (req, res) => {
    const csrfToken = getCsrfToken(req);

    res.setHeader("Set-Cookie", createCsrfCookie(csrfToken));
    res.json({ success: true, csrfToken });
  });

  app.get("/api/auth/session", async (req, res) => {
    const sessionUsername = getSessionUsername(req);

    if (!sessionUsername) {
      res.status(401).json({
        success: false,
        message: "Your session has expired. Please sign in again.",
      });
      return;
    }

    const user = await syncMemberStatusWithFees(
      await memberAuthGateway.findUserByUsername(sessionUsername),
    );

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

    const disciplines = await memberAuthGateway.findDisciplinesByUsername(
      user.username,
    );

    res.json({
      success: true,
      userProfile: buildMemberUserProfile(
        user,
        disciplines.map((discipline) => discipline.discipline),
      ),
    });
  });

  app.post("/api/auth/guest-login", async (req, res) => {
    const {
      firstName,
      surname,
      archeryGbMembershipNumber,
      invitedByUsername,
      paymentMethod,
    } = req.body ?? {};
    const sessionUsername = getSessionUsername(req)?.trim?.() ?? "";
    const trimmedMembershipNumber = archeryGbMembershipNumber?.trim() ?? "";
    const membershipDigits = trimmedMembershipNumber.replace(/\D/g, "");
    const trimmedInvitedByUsername =
      sessionUsername || invitedByUsername?.trim() || "";
    const normalizedPaymentMethod = String(paymentMethod ?? "")
      .trim()
      .toLowerCase();

    if (
      !firstName ||
      !surname ||
      !archeryGbMembershipNumber ||
      !trimmedInvitedByUsername ||
      !normalizedPaymentMethod
    ) {
      res.status(400).json({
        success: false,
        message:
          "First name, surname, Archery GB membership number, inviting member, and payment method are required.",
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

    if (
      normalizedPaymentMethod !== "paypal" &&
      normalizedPaymentMethod !== "cash"
    ) {
      res.status(400).json({
        success: false,
        message: "Payment method must be either PayPal or Cash.",
      });
      return;
    }

    const invitingMember = await memberAuthGateway.findUserByUsername(
      trimmedInvitedByUsername,
    );

    if (!invitingMember) {
      res.status(400).json({
        success: false,
        message: "Inviting member could not be found.",
      });
      return;
    }

    const timestampParts = getUtcTimestampParts();

    await memberAuthGateway.recordGuestLoginEvent({
      archeryGbMembershipNumber: trimmedMembershipNumber,
      firstName: firstName.trim(),
      invitedByName: `${invitingMember.first_name} ${invitingMember.surname}`,
      invitedByUsername: invitingMember.username,
      paymentMethod: normalizedPaymentMethod,
      surname: surname.trim(),
      timestampParts,
    });
    const [loggedAtDate, loggedAtTime] = timestampParts;

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "created",
        actorUsername: `guest:${membershipDigits}`,
        after: {
          activityType: "guest_login",
          archeryGbMembershipNumber: trimmedMembershipNumber,
          firstName: firstName.trim(),
          surname: surname.trim(),
          invitedByUsername: invitingMember.username,
          invitedByName: `${invitingMember.first_name} ${invitingMember.surname}`,
          paymentMethod: normalizedPaymentMethod,
        },
        before: null,
        changedAtDate: loggedAtDate,
        changedAtTime: loggedAtTime,
        entityId: `${membershipDigits}:${loggedAtDate}:${loggedAtTime}`,
        entityLabel: `${firstName.trim()} ${surname.trim()}`.trim(),
        entityType: "guest_activity",
        req,
        statusCode: 200,
        target: "/api/auth/guest-login",
      }).catch((auditError) => {
        console.error("Failed to record guest login audit event", auditError);
      });
    }
    broadcastRangeMembersUpdated("auth.guest-login");

    res.json({
      success: true,
      userProfile: buildGuestUserProfile({
        firstName: firstName.trim(),
        surname: surname.trim(),
        archeryGbMembershipNumber: trimmedMembershipNumber,
        invitedByUsername: invitingMember.username,
        invitedByName: `${invitingMember.first_name} ${invitingMember.surname}`,
        paymentMethod: normalizedPaymentMethod,
      }),
    });
  });

  app.get("/api/guest-inviter-members", async (_req, res) => {
    const users = await memberAuthGateway.listAllUsers();

    res.json({
      success: true,
      members: users.map((user) => ({
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
    });
  });
}
