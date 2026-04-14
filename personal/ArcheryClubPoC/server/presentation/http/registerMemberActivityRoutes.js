export function registerMemberActivityRoutes({
  addUtcDays,
  app,
  buildDisciplinesByUsernameMap,
  buildGuestUserProfile,
  buildMemberUserProfile,
  buildPersonalUsageWindow,
  buildTournament,
  buildTournamentDataMaps,
  buildUsageWindow,
  findMemberCoachingBookingsByUserId,
  findMemberEventBookingsByUserId,
  findRecentGuestLogins,
  findRecentRangeMembers,
  getActorUser,
  listTournaments,
  startOfUtcDay,
  toUtcDateString,
}) {
  app.get("/api/my-coaching-bookings", (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.json({
        success: true,
        bookings: [],
      });
      return;
    }

    res.json({
      success: true,
      bookings: findMemberCoachingBookingsByUserId.all(actor.id).map((booking) => ({
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

  app.get("/api/my-event-bookings", (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.json({
        success: true,
        bookings: [],
      });
      return;
    }

    res.json({
      success: true,
      bookings: findMemberEventBookingsByUserId.all(actor.id).map((booking) => ({
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

  app.get("/api/my-tournament-reminders", (req, res) => {
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
      buildTournamentDataMaps();
    const reminders = listTournaments
      .all()
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

  app.get("/api/range-members", (_req, res) => {
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const disciplinesByUsername = buildDisciplinesByUsernameMap();
    const members = findRecentRangeMembers.all(cutoff).map((member) =>
      buildMemberUserProfile(
        member,
        disciplinesByUsername.get(member.username) ?? [],
        {
          lastLoggedInAt: member.last_logged_in_at,
        },
      ),
    );
    const guests = findRecentGuestLogins.all(cutoff).map((guest) =>
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

  app.get("/api/range-usage-dashboard", (req, res) => {
    const actor = getActorUser(req);
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

    const filteredEndExclusive = addUtcDays(filteredEndDay, 1);

    const currentMonth = buildUsageWindow(
      `${toUtcDateString(currentMonthStart)} to ${toUtcDateString(
        addUtcDays(nextMonthStart, -1),
      )}`,
      currentMonthStart,
      nextMonthStart,
    );
    const currentWeek = buildUsageWindow(
      `${toUtcDateString(currentWeekStart)} to ${toUtcDateString(
        addUtcDays(nextWeekStart, -1),
      )}`,
      currentWeekStart,
      nextWeekStart,
    );
    const filteredRange = buildUsageWindow(
      `${toUtcDateString(filteredStart)} to ${toUtcDateString(filteredEndDay)}`,
      filteredStart,
      filteredEndExclusive,
    );
    const myCurrentMonth = actor
      ? buildPersonalUsageWindow(
          actor.username,
          `${toUtcDateString(currentMonthStart)} to ${toUtcDateString(
            addUtcDays(nextMonthStart, -1),
          )}`,
          currentMonthStart,
          nextMonthStart,
        )
      : null;
    const myCurrentWeek = actor
      ? buildPersonalUsageWindow(
          actor.username,
          `${toUtcDateString(currentWeekStart)} to ${toUtcDateString(
            addUtcDays(nextWeekStart, -1),
          )}`,
          currentWeekStart,
          nextWeekStart,
        )
      : null;
    const myFilteredRange = actor
      ? buildPersonalUsageWindow(
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
}
