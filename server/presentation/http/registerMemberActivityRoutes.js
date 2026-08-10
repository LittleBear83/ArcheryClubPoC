export function registerMemberActivityRoutes({
  activityReportingGateway,
  addUtcDays,
  app,
  actorHasPermission,
  auditChangeLogger,
  buildGuestUserProfile,
  buildMemberUserProfile,
  buildPersonalUsageWindow,
  buildTournament,
  buildTournamentDataMaps,
  buildUsageWindow,
  getActorUser,
  getUtcTimestampParts,
  listTournaments,
  memberAuthGateway,
  PERMISSIONS,
  serverEventBus,
  startOfUtcDay,
  toUtcDateString,
}) {
  const RANGE_USAGE_MAX_DAYS = 366;
  const REPORTING_MAX_DAYS = 366;
  const RANGE_PRESENCE_DEFAULT_WINDOW_MS = 2 * 60 * 60 * 1000;
  const RANGE_PRESENCE_MIN_EXTENSION_HOURS = 2;
  const RANGE_PRESENCE_MAX_EXTENSION_HOURS = 12;

  const getDefaultPresenceEndsAt = (lastLoggedInAt) => {
    const lastLoggedInMs = new Date(String(lastLoggedInAt)).getTime();

    if (Number.isNaN(lastLoggedInMs)) {
      return null;
    }

    return new Date(lastLoggedInMs + RANGE_PRESENCE_DEFAULT_WINDOW_MS).toISOString();
  };

  const getActivePresenceEndsAt = (lastLoggedInAt, extension) => {
    const defaultEndsAt = getDefaultPresenceEndsAt(lastLoggedInAt);
    const extensionEndsAt = extension?.active_until_at ?? null;

    if (!defaultEndsAt) {
      return extensionEndsAt;
    }

    if (!extensionEndsAt) {
      return defaultEndsAt;
    }

    return new Date(extensionEndsAt).getTime() > new Date(defaultEndsAt).getTime()
      ? extensionEndsAt
      : defaultEndsAt;
  };

  const getInclusiveDayCount = (startDate, endDate) => {
    return Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  };

  const rejectDateRangeIfTooLong = (res, startDate, endDate, maxDays) => {
    if (getInclusiveDayCount(startDate, endDate) <= maxDays) {
      return false;
    }

    res.status(400).json({
      success: false,
      message: `Date range cannot be longer than ${maxDays} days.`,
    });
    return true;
  };

  const broadcastRangeMembersUpdated = (scope = "range-members") => {
    serverEventBus?.broadcastToAll("range-members.updated", {
      changedAt: new Date().toISOString(),
      scope,
    });
  };

  app.get("/api/my-coaching-bookings", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.json({
        success: true,
        bookings: [],
      });
      return;
    }

    const bookings = await activityReportingGateway.findMemberCoachingBookingsByUserId(
      actor.id,
    );

    res.json({
      success: true,
      bookings: bookings.map((booking) => ({
        id: booking.id,
        date: booking.session_date,
        title: `${booking.topic} with ${booking.coach_first_name} ${booking.coach_surname}`,
        summary: booking.summary,
        startTime: booking.start_time,
        endTime: booking.end_time,
        venue: booking.venue,
      })),
    });
  });

  app.get("/api/my-event-bookings", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.json({
        success: true,
        bookings: [],
      });
      return;
    }

    const bookings = await activityReportingGateway.findMemberEventBookingsByUserId(
      actor.id,
    );

    res.json({
      success: true,
      bookings: bookings.map((booking) => ({
        id: `event-${booking.id}`,
        date: booking.event_date,
        title: booking.title,
        summary:
          booking.type === "competition" ? "Competition event" : "Social event",
        startTime: booking.start_time,
        endTime: booking.end_time,
        type: booking.type,
      })),
    });
  });

  app.get("/api/my-tournament-reminders", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.json({
        success: true,
        reminders: [],
      });
      return;
    }

    const today = toUtcDateString(new Date());
    const { registrationsByTournamentId, scoresByTournamentId } =
      await buildTournamentDataMaps();
    const reminders = (await listTournaments())
      .map((tournament) =>
        buildTournament(
          tournament,
          registrationsByTournamentId.get(tournament.id) ?? [],
          scoresByTournamentId.get(tournament.id) ?? [],
          actor.username,
        ),
      )
      .flatMap((tournament) => {
        if (!tournament.isRegistered) {
          return [];
        }

        if (tournament.needsScoreReminder) {
          return [
            {
              id: `tournament-score-${tournament.id}`,
              title: `${tournament.name} score reminder`,
              date: tournament.scoreWindow.endDate,
              summary: `Submit your round ${tournament.currentRoundNumber} score by ${tournament.scoreWindow.endDate}.`,
              startTime: "00:00",
              endTime: "23:59",
              type: "tournament-reminder",
            },
          ];
        }

        if (today > tournament.scoreWindow.endDate) {
          return [];
        }

        if (
          tournament.registrationWindow.isUpcoming ||
          tournament.registrationWindow.isOpen
        ) {
          return [
            {
              id: `tournament-registration-${tournament.id}`,
              title: `${tournament.name} registration confirmed`,
              date: tournament.registrationWindow.endDate,
              summary: `You are registered. Registration closes on ${tournament.registrationWindow.endDate}.`,
              startTime: "00:00",
              endTime: "23:59",
              type: "tournament-reminder",
            },
          ];
        }

        return [
          {
            id: `tournament-upcoming-${tournament.id}`,
            title: `${tournament.name} is underway`,
            date: tournament.scoreWindow.endDate,
            summary: `You are registered for this tournament. The score window closes on ${tournament.scoreWindow.endDate}.`,
            startTime: "00:00",
            endTime: "23:59",
            type: "tournament-reminder",
          },
        ];
      });

    res.json({
      success: true,
      reminders,
    });
  });

  app.get("/api/range-members", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const disciplineRows = await activityReportingGateway.listAllUserDisciplines();
    const disciplinesByUsername = new Map();

    for (const row of disciplineRows) {
      const current = disciplinesByUsername.get(row.username) ?? [];
      current.push(row.discipline);
      disciplinesByUsername.set(row.username, current);
    }

    const latestMembers = await activityReportingGateway.findLatestRangeMembers();
    const memberExtensions = new Map();

    for (const member of latestMembers) {
      const extension = await memberAuthGateway.findRangePresenceExtensionByUsername(
        member.username,
      );

      if (extension) {
        memberExtensions.set(member.username.toLowerCase(), extension);
      }
    }

    const members = latestMembers
      .map((member) => {
        const extension = memberExtensions.get(member.username.toLowerCase()) ?? null;
        const activeRangePresenceEndsAt = getActivePresenceEndsAt(
          member.last_logged_in_at,
          extension,
        );

        if (
          !activeRangePresenceEndsAt ||
          new Date(activeRangePresenceEndsAt).getTime() <= Date.now()
        ) {
          return null;
        }

        return buildMemberUserProfile(
          member,
          disciplinesByUsername.get(member.username) ?? [],
          {
            activeRangePresenceEndsAt,
            lastLoggedInAt: member.last_logged_in_at,
          },
        );
      })
      .filter(Boolean);
    const guests = (await activityReportingGateway.findRecentGuestLogins(cutoff)).map((guest) =>
      buildGuestUserProfile(guest, {
        lastLoggedInAt: guest.last_logged_in_at,
      }),
    );
    const distinctEntries = new Map();

    for (const entry of [...members, ...guests]) {
      const key = entry.id;
      const existingEntry = distinctEntries.get(key);

      if (
        !existingEntry ||
        new Date(entry.meta.lastLoggedInAt).getTime() >
          new Date(existingEntry.meta.lastLoggedInAt).getTime()
      ) {
        distinctEntries.set(key, entry);
      }
    }

    res.json({
      success: true,
      members: [...distinctEntries.values()].sort((a, b) => {
        return `${a.personal.surname} ${a.personal.firstName}`.localeCompare(
          `${b.personal.surname} ${b.personal.firstName}`,
        );
      }),
    });
  });

  app.post("/api/range-members/mobile-check-in", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const timestampParts = getUtcTimestampParts();

    await memberAuthGateway.recordLoginEvent({
      method: "mobile-app",
      timestampParts,
      username: actor.username,
    });
    const [loggedAtDate, loggedAtTime] = timestampParts;

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "created",
        actorUsername: actor.username,
        after: {
          activityType: "mobile_check_in",
          method: "mobile-app",
          username: actor.username,
        },
        before: null,
        changedAtDate: loggedAtDate,
        changedAtTime: loggedAtTime,
        entityId: `${actor.username}:${loggedAtDate}:${loggedAtTime}:mobile-app`,
        entityLabel: `${actor.first_name} ${actor.surname}`.trim() || actor.username,
        entityType: "member_activity",
        req,
        statusCode: 200,
        target: "/api/range-members/mobile-check-in",
      }).catch((auditError) => {
        console.error("Failed to record mobile check-in audit event", auditError);
      });
    }
    broadcastRangeMembersUpdated("range-members.mobile-check-in");

    res.json({
      success: true,
      message: "Your on-site mobile check-in has been recorded.",
    });
  });

  app.put("/api/range-members/presence-extension", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const requestedHours = Number.parseInt(String(req.body?.hours ?? ""), 10);

    if (
      !Number.isInteger(requestedHours) ||
      requestedHours < RANGE_PRESENCE_MIN_EXTENSION_HOURS ||
      requestedHours > RANGE_PRESENCE_MAX_EXTENSION_HOURS
    ) {
      res.status(400).json({
        success: false,
        message: `Choose a duration between ${RANGE_PRESENCE_MIN_EXTENSION_HOURS} and ${RANGE_PRESENCE_MAX_EXTENSION_HOURS} hours.`,
      });
      return;
    }

    const latestRangeMembers = await activityReportingGateway.findLatestRangeMembers();
    const actorEntry =
      latestRangeMembers.find(
        (member) => member.username.toLowerCase() === actor.username.toLowerCase(),
      ) ?? null;

    if (!actorEntry?.last_logged_in_at) {
      res.status(400).json({
        success: false,
        message: "Check in on site before extending your range presence.",
      });
      return;
    }

    const existingExtension =
      await memberAuthGateway.findRangePresenceExtensionByUsername(actor.username);
    const activePresenceEndsAt = getActivePresenceEndsAt(
      actorEntry.last_logged_in_at,
      existingExtension,
    );

    if (
      !activePresenceEndsAt ||
      new Date(activePresenceEndsAt).getTime() <= Date.now()
    ) {
      res.status(400).json({
        success: false,
        message: "Your current range presence has expired. Please check in again first.",
      });
      return;
    }

    const activeUntil = new Date(Date.now() + requestedHours * 60 * 60 * 1000);
    const [activeUntilDate, activeUntilTime] = getUtcTimestampParts(activeUntil);
    const [updatedAtDate, updatedAtTime] = getUtcTimestampParts();

    await memberAuthGateway.upsertRangePresenceExtension({
      activeUntilParts: [activeUntilDate, activeUntilTime],
      timestampParts: [updatedAtDate, updatedAtTime],
      updatedByUsername: actor.username,
      username: actor.username,
    });

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "updated",
        actorUsername: actor.username,
        after: {
          activeRangePresenceEndsAt: `${activeUntilDate}T${activeUntilTime}`,
          hours: requestedHours,
          username: actor.username,
        },
        before: existingExtension
          ? {
              activeRangePresenceEndsAt: existingExtension.active_until_at,
              username: actor.username,
            }
          : null,
        changedAtDate: updatedAtDate,
        changedAtTime: updatedAtTime,
        entityId: actor.username,
        entityLabel: `${actor.first_name} ${actor.surname}`.trim() || actor.username,
        entityType: "range_presence_extension",
        req,
        statusCode: 200,
        target: "/api/range-members/presence-extension",
      }).catch((auditError) => {
        console.error("Failed to record range presence extension audit event", auditError);
      });
    }

    broadcastRangeMembersUpdated("range-members.presence-extension");

    res.json({
      success: true,
      activeRangePresenceEndsAt: `${activeUntilDate}T${activeUntilTime}`,
      message: `Your range presence has been extended for the next ${requestedHours} hours.`,
    });
  });

  app.get("/api/range-usage-dashboard", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const now = new Date();
    const currentMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const nextMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const todayUtc = startOfUtcDay(now);
    const dayOfWeek = todayUtc.getUTCDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const currentWeekStart = addUtcDays(todayUtc, mondayOffset);
    const nextWeekStart = addUtcDays(currentWeekStart, 7);

    const requestedStart = req.query.start;
    const requestedEnd = req.query.end;
    const filteredStart = requestedStart
      ? new Date(`${requestedStart}T00:00:00.000Z`)
      : currentMonthStart;
    const filteredEndDay = requestedEnd
      ? new Date(`${requestedEnd}T00:00:00.000Z`)
      : todayUtc;

    if (
      Number.isNaN(filteredStart.getTime()) ||
      Number.isNaN(filteredEndDay.getTime())
    ) {
      res.status(400).json({
        success: false,
        message: "Invalid start or end date.",
      });
      return;
    }

    if (filteredStart.getTime() > filteredEndDay.getTime()) {
      res.status(400).json({
        success: false,
        message: "Start date cannot be after end date.",
      });
      return;
    }

    if (
      rejectDateRangeIfTooLong(
        res,
        filteredStart,
        filteredEndDay,
        RANGE_USAGE_MAX_DAYS,
      )
    ) {
      return;
    }

    const filteredEndExclusive = addUtcDays(filteredEndDay, 1);

    const currentMonth = await buildUsageWindow(
      `${toUtcDateString(currentMonthStart)} to ${toUtcDateString(
        addUtcDays(nextMonthStart, -1),
      )}`,
      currentMonthStart,
      nextMonthStart,
    );
    const currentWeek = await buildUsageWindow(
      `${toUtcDateString(currentWeekStart)} to ${toUtcDateString(
        addUtcDays(nextWeekStart, -1),
      )}`,
      currentWeekStart,
      nextWeekStart,
    );
    const filteredRange = await buildUsageWindow(
      `${toUtcDateString(filteredStart)} to ${toUtcDateString(filteredEndDay)}`,
      filteredStart,
      filteredEndExclusive,
    );
    const myCurrentMonth = actor
      ? await buildPersonalUsageWindow(
          actor.username,
          `${toUtcDateString(currentMonthStart)} to ${toUtcDateString(
            addUtcDays(nextMonthStart, -1),
          )}`,
          currentMonthStart,
          nextMonthStart,
        )
      : null;
    const myCurrentWeek = actor
      ? await buildPersonalUsageWindow(
          actor.username,
          `${toUtcDateString(currentWeekStart)} to ${toUtcDateString(
            addUtcDays(nextWeekStart, -1),
          )}`,
          currentWeekStart,
          nextWeekStart,
        )
      : null;
    const myFilteredRange = actor
      ? await buildPersonalUsageWindow(
          actor.username,
          `${toUtcDateString(filteredStart)} to ${toUtcDateString(
            filteredEndDay,
          )}`,
          filteredStart,
          filteredEndExclusive,
        )
      : null;

    res.json({
      success: true,
      currentMonth,
      currentWeek,
      filteredRange,
      myCurrentMonth,
      myCurrentWeek,
      myFilteredRange,
    });
  });

  app.get("/api/reporting/attendance", async (req, res) => {
    const actor = getActorUser(req);

    if (!actorHasPermission(actor, PERMISSIONS.VIEW_REPORTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to view reports.",
      });
      return;
    }

    const requestedStart = req.query.start;
    const requestedEnd = req.query.end;
    const includeMembers = req.query.members !== "false";
    const includeGuests = req.query.guests !== "false";
    const filteredStart = requestedStart
      ? new Date(`${requestedStart}T00:00:00.000Z`)
      : startOfUtcDay(new Date());
    const filteredEndDay = requestedEnd
      ? new Date(`${requestedEnd}T00:00:00.000Z`)
      : startOfUtcDay(new Date());

    if (
      Number.isNaN(filteredStart.getTime()) ||
      Number.isNaN(filteredEndDay.getTime())
    ) {
      res.status(400).json({
        success: false,
        message: "Invalid start or end date.",
      });
      return;
    }

    if (filteredStart.getTime() > filteredEndDay.getTime()) {
      res.status(400).json({
        success: false,
        message: "Start date cannot be after end date.",
      });
      return;
    }

    if (
      rejectDateRangeIfTooLong(
        res,
        filteredStart,
        filteredEndDay,
        REPORTING_MAX_DAYS,
      )
    ) {
      return;
    }

    if (!includeMembers && !includeGuests) {
      res.status(400).json({
        success: false,
        message: "Select at least one data source.",
      });
      return;
    }

    const filteredEndExclusive = addUtcDays(filteredEndDay, 1);
    const startIso = filteredStart.toISOString();
    const endIso = filteredEndExclusive.toISOString();
    const rows = [];

    if (includeMembers) {
      rows.push(
        ...(await activityReportingGateway.listReportingMemberLogins(startIso, endIso)).map((member) => ({
          id: `member-${member.id}`,
          type: "Member",
          date: member.logged_in_date,
          time: member.logged_in_time,
          name: `${member.first_name ?? ""} ${member.surname ?? ""}`.trim(),
          username: member.username ?? "",
          loginMethod: member.login_method ?? "",
          archeryGbMembershipNumber: "",
          attendingWith: "",
          attendingWithUsername: "",
        })),
      );
    }

    if (includeGuests) {
      rows.push(
        ...(await activityReportingGateway.listReportingGuestLogins(startIso, endIso)).map((guest) => ({
          id: `guest-${guest.id}`,
          type: "Guest",
          date: guest.logged_in_date,
          time: guest.logged_in_time,
          name: `${guest.first_name ?? ""} ${guest.surname ?? ""}`.trim(),
          username: "",
          loginMethod: "guest",
          archeryGbMembershipNumber:
            guest.archery_gb_membership_number ?? "",
          attendingWith: guest.invited_by_name ?? "",
          attendingWithUsername: guest.invited_by_username ?? "",
        })),
      );
    }

    rows.sort((left, right) => {
      const byTimestamp = `${right.date}T${right.time}`.localeCompare(
        `${left.date}T${left.time}`,
      );

      return byTimestamp !== 0 ? byTimestamp : left.name.localeCompare(right.name);
    });

    const dailyMap = new Map();

    for (
      let date = new Date(filteredStart);
      date.getTime() < filteredEndExclusive.getTime();
      date = addUtcDays(date, 1)
    ) {
      const usageDate = toUtcDateString(date);
      dailyMap.set(usageDate, {
        usageDate,
        label: String(date.getUTCDate()),
        fullLabel: usageDate,
        members: 0,
        guests: 0,
        total: 0,
      });
    }

    for (const row of rows) {
      const dailyRow = dailyMap.get(row.date);

      if (!dailyRow) {
        continue;
      }

      if (row.type === "Member") {
        dailyRow.members += 1;
      } else {
        dailyRow.guests += 1;
      }

      dailyRow.total += 1;
    }

    res.json({
      success: true,
      report: {
        startDate: toUtcDateString(filteredStart),
        endDate: toUtcDateString(filteredEndDay),
        includeMembers,
        includeGuests,
        total: rows.length,
        members: rows.filter((row) => row.type === "Member").length,
        guests: rows.filter((row) => row.type === "Guest").length,
        daily: [...dailyMap.values()],
        rows,
      },
    });
  });
}
