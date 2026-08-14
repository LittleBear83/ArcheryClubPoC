import { Button } from "../components/Button";
import { formatDate } from "../../utils/dateTime";
import {
  formatRangeMemberDisplayName,
  getUserProfileKey,
  isJuniorMemberProfile,
} from "../../utils/userProfile";

function getFirstNameOnly(value) {
  const displayName =
    value?.personal?.firstName ??
    value?.firstName ??
    value?.first_name ??
    value?.archerName ??
    "";

  return String(displayName).trim().split(/\s+/)[0] || "";
}

function formatCoachedSessionLabel(courseType) {
  switch (courseType) {
    case "taster-session":
      return "Taster Session";
    case "have-a-go":
      return "Have a Go session";
    default:
      return "Beginners course";
  }
}

function MobileOnSiteFeatureCard({ mobileOnSiteFeature }) {
  if (!mobileOnSiteFeature?.isMobile) {
    return null;
  }

  const {
    activeRangePresenceEndsAtText,
    distanceMeters,
    error,
    activeRangePresenceHours,
    isBookingOnSite,
    isCheckInWindowOpen,
    isLocating,
    isSavingRangePresence,
    isSupported,
    isWithinGeofence,
    onChangeRangePresenceHours,
    onBookOnSite,
    onUpdateRangePresence,
    permissionState,
    radiusMeters,
    rangePresenceHourOptions,
    requestLocation,
    statusMessage,
  } = mobileOnSiteFeature;
  const roundedDistance =
    typeof distanceMeters === "number" ? Math.round(distanceMeters) : null;

  return (
    <section className="home-panel">
      <h3 className="home-panel-title">On-Site Mobile Feature</h3>
      <div className="home-panel-copy">
        {!isSupported ? (
          <p>This browser does not support geolocation on mobile.</p>
        ) : isWithinGeofence ? (
          <p>
            You are on site. Mobile features limited to the club location are
            enabled.
          </p>
        ) : permissionState === "denied" ? (
          <p>
            Location access is blocked. Enable location access in your browser
            settings to unlock on-site mobile features.
          </p>
        ) : roundedDistance === null ? (
          <p>
            This feature is only available on mobile within {radiusMeters}m of
            the club. Allow location access to check whether you are on site.
          </p>
        ) : (
          <p>
            You are currently about {roundedDistance}m from the club. Move
            within {radiusMeters}m to unlock on-site mobile features.
          </p>
        )}
        {error ? <p className="profile-error">{error}</p> : null}
        {statusMessage ? <p>{statusMessage}</p> : null}
        {isCheckInWindowOpen && activeRangePresenceEndsAtText ? (
          <div className="home-range-presence-editor">
            <p>
              You have been marked as being at the range until{" "}
              {activeRangePresenceEndsAtText}. If you wish to extend this,
              change it here.
            </p>
            <div className="home-range-presence-controls">
              <label className="home-range-presence-field">
                <span>Hours from now</span>
                <select
                  value={String(activeRangePresenceHours ?? 2)}
                  onChange={(event) =>
                    onChangeRangePresenceHours?.(
                      Number.parseInt(event.target.value, 10),
                    )
                  }
                  disabled={isSavingRangePresence}
                >
                  {(rangePresenceHourOptions ?? []).map((hours) => (
                    <option key={hours} value={hours}>
                      {hours} hours
                    </option>
                  ))}
                </select>
              </label>
              <Button
                type="button"
                onClick={onUpdateRangePresence}
                disabled={isSavingRangePresence}
                variant="secondary"
              >
                {isSavingRangePresence ? "Saving..." : "Update time"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      {isSupported ? (
        <>
          <Button
            type="button"
            onClick={requestLocation}
            disabled={isLocating}
            variant={isWithinGeofence ? "secondary" : "primary"}
          >
            {isLocating
              ? "Checking location..."
              : roundedDistance === null
                ? "Enable location"
                : "Refresh location"}
          </Button>
          {isWithinGeofence ? (
            <Button
              type="button"
              onClick={onBookOnSite}
              disabled={isBookingOnSite || isCheckInWindowOpen}
              variant="primary"
            >
              {isBookingOnSite
                ? "Booking on site..."
                : isCheckInWindowOpen
                  ? "Checked in on site"
                  : "Book On Site"}
            </Button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function buildClubEventItems(events, coachAssignments) {
  return [
    ...events.map((event) => ({
      id: `event-${event.id}`,
      date: event.date,
      startTime: event.startTime ?? "",
      title: event.title,
    })),
    ...coachAssignments.map((assignment) => ({
      id: `coach-${assignment.id}`,
      date: assignment.date,
      startTime: assignment.startTime ?? "",
      title: `Coaching reminder: ${formatCoachedSessionLabel(assignment.courseType)}`,
    })),
  ].sort((left, right) => {
    const byDate = left.date.localeCompare(right.date);

    if (byDate !== 0) {
      return byDate;
    }

    return left.startTime.localeCompare(right.startTime);
  });
}

function SignedUpEventsList({ events, coachAssignments }) {
  const clubEventItems = buildClubEventItems(events, coachAssignments);

  return (
    <section className="home-panel">
      <h3 className="home-panel-title">Your Club Events List</h3>
      <ul className="home-info-list home-info-list--events">
        {clubEventItems.length > 0 ? (
          clubEventItems.map((event) => (
            <li key={event.id}>
              <strong>{formatDate(event.date)}</strong>
              {`: ${event.title}`}
            </li>
          ))
        ) : (
          <li>No signed-up events yet.</li>
        )}
      </ul>
    </section>
  );
}

function TournamentRemindersList({ reminders }) {
  return (
    <section className="home-panel">
      <h3 className="home-panel-title">Tournament Reminders</h3>
      <ul className="home-info-list home-info-list--events">
        {reminders.length > 0 ? (
          reminders.map((reminder) => (
            <li key={reminder.id}>
              <strong>{formatDate(reminder.date)}</strong>
              {`: ${reminder.title}`}
            </li>
          ))
        ) : (
          <li>No tournament reminders right now.</li>
        )}
      </ul>
    </section>
  );
}

function CurrentLostArrowsCard({ lostArrows, onOpenLostAndFound }) {
  const currentLostArrowCount = lostArrows.length;
  const latestLostArrow = lostArrows[0] ?? null;

  return (
    <button
      type="button"
      className="home-panel home-panel--interactive"
      onClick={onOpenLostAndFound}
      aria-label="Open the lost arrow page"
    >
      <h3 className="home-panel-title">Current Lost Arrows</h3>
      <div className="home-panel-copy">
        <p className="home-panel-stat">{currentLostArrowCount}</p>
        <p>
          {currentLostArrowCount === 1
            ? "arrow is currently recorded as lost."
            : "arrows are currently recorded as lost."}
        </p>
        {latestLostArrow ? (
          <p>
            Latest:{" "}
            <strong>
              {latestLostArrow.arrowColour} {latestLostArrow.arrowMaterial}
            </strong>{" "}
            for {getFirstNameOnly(latestLostArrow) || latestLostArrow.archerUsername} on{" "}
            <strong>{formatDate(latestLostArrow.dateLost)}</strong>
          </p>
        ) : (
          <p>No open lost arrows right now.</p>
        )}
        <p className="home-panel-link-copy">Open Lost Arrow Page</p>
      </div>
    </button>
  );
}

function GuestSignInCard({ onOpenGuestLogin }) {
  return (
    <button
      type="button"
      className="home-panel home-panel--interactive"
      onClick={onOpenGuestLogin}
      aria-label="Open the guest sign-in form"
    >
      <h3 className="home-panel-title">Guest Sign In</h3>
      <div className="home-panel-copy">
        <p>Book in a visiting archer.</p>
        <p>For non-members and visiting club guests.</p>
        <p className="home-panel-link-copy">Open Guest Form</p>
      </div>
    </button>
  );
}

function MembersAtRangeList({ members }) {
  return (
    <section className="home-panel">
      <h3 className="home-panel-title">Current Archers At The Range</h3>
      <ul className="home-info-list home-info-list--members">
        {members.length > 0 ? (
          members.map((member) => {
            const isJuniorMember = isJuniorMemberProfile(member);

            return (
              <li key={getUserProfileKey(member)}>
                {formatRangeMemberDisplayName(member)}
                {!isJuniorMember && member.membership.disciplines?.length
                  ? ` - ${member.membership.disciplines.join(", ")}`
                  : !isJuniorMember && member.accountType === "guest"
                    ? " - Guest"
                    : ""}
              </li>
            );
          })
        ) : (
          <li>No archers have logged in within the last 2 hours</li>
        )}
      </ul>
    </section>
  );
}

function BeginnerTodayCard({ dashboard }) {
  if (!dashboard) {
    return null;
  }

  return (
    <section className="home-panel">
      <h3 className="home-panel-title">Beginners Course Today</h3>
      {dashboard.lessonToday ? (
        <div className="home-panel-copy">
          <p>
            Lesson {dashboard.lessonToday.lessonNumber} on{" "}
            <strong>{formatDate(dashboard.lessonToday.date)}</strong>
          </p>
          <p>
            Coaches:{" "}
            {dashboard.coaches.length > 0
              ? dashboard.coaches.map((coach) => coach.fullName).join(", ")
              : "No coaches assigned yet"}
          </p>
        </div>
      ) : (
        <div className="home-panel-copy">
          <p>No lesson is scheduled for you today.</p>
        </div>
      )}
      <ul className="home-info-list home-info-list--equipment">
        {dashboard.equipment.length > 0 ? (
          dashboard.equipment.map((item) => (
            <li key={item.id}>
              {item.typeLabel}
              {item.reference ? ` - ${item.reference}` : ""}
            </li>
          ))
        ) : (
          <li>No equipment has been issued to you yet.</li>
        )}
      </ul>
    </section>
  );
}

function CommitteeApprovalsCard({ approvalSummary, onOpenApprovals }) {
  if (!approvalSummary) {
    return null;
  }

  const {
    beginnersCoursesCount,
    calendarItemsCount,
    haveAGoSessionsCount,
    tasterSessionsCount,
    noApprovalAccess,
    totalPendingCount,
  } = approvalSummary;

  return (
    <button
      type="button"
      className="home-panel home-panel--interactive"
      onClick={onOpenApprovals}
      aria-label="Open the approvals page"
    >
      <h3 className="home-panel-title">Committee Approvals</h3>
      {noApprovalAccess ? (
        <div className="home-panel-copy">
          <p>
            This account can see the committee approvals card, but it does not
            currently have any approval permissions assigned.
          </p>
          <p>
            Assign one or more approval permissions to load live counts here.
          </p>
        </div>
      ) : (
        <>
      <div className="home-panel-copy">
        <p className="home-panel-stat">{totalPendingCount}</p>
        <p>
          {totalPendingCount === 1
            ? "item is currently waiting for approval."
            : "items are currently waiting for approval."}
        </p>
      </div>
      <div className="home-approval-summary-list">
        <p>
          <strong>{calendarItemsCount}</strong> calendar items need approval
        </p>
        <p>
          <strong>{beginnersCoursesCount}</strong> beginners courses need approval
        </p>
        <p>
          <strong>{haveAGoSessionsCount}</strong> Have a Go sessions need approval
        </p>
        <p>
          <strong>{tasterSessionsCount}</strong> Taster Sessions need approval
        </p>
      </div>
        </>
      )}
      <p className="home-panel-link-copy">Open Approvals Page</p>
    </button>
  );
}

function CommitteeApprovedCoursesCard({
  approvalSummary,
  onOpenBeginnersCourses,
  onOpenHaveAGoSessions,
  onOpenTasterSessions,
}) {
  if (!approvalSummary) {
    return null;
  }

  const {
    approvedBeginnersCoursesCount,
    approvedHaveAGoSessionsCount,
    approvedTasterSessionsCount,
    noApprovalAccess,
  } = approvalSummary;
  const totalApprovedCount =
    approvedBeginnersCoursesCount +
    approvedHaveAGoSessionsCount +
    approvedTasterSessionsCount;

  return (
    <section className="home-panel">
      <h3 className="home-panel-title">Approved Courses</h3>
      {noApprovalAccess ? (
        <div className="home-panel-copy">
          <p>
            This account can see the approved courses card, but it does not
            currently have any approval permissions assigned.
          </p>
          <p>
            Assign one or more approval permissions to load live counts here.
          </p>
        </div>
      ) : (
        <>
          <div className="home-panel-copy">
            <p className="home-panel-stat">{totalApprovedCount}</p>
            <p>
              {totalApprovedCount === 1
                ? "approved session may need Insurance oversite."
                : "approved sessions may need Insurance oversite."}
            </p>
          </div>
          <div className="home-approval-summary-list">
            <button
              type="button"
              className="home-approval-summary-link"
              onClick={onOpenBeginnersCourses}
            >
              <strong>{approvedBeginnersCoursesCount}</strong> approved beginners
              courses
            </button>
            <button
              type="button"
              className="home-approval-summary-link"
              onClick={onOpenHaveAGoSessions}
            >
              <strong>{approvedHaveAGoSessionsCount}</strong> approved Have a Go
              sessions
            </button>
            <button
              type="button"
              className="home-approval-summary-link"
              onClick={onOpenTasterSessions}
            >
              <strong>{approvedTasterSessionsCount}</strong> approved Taster
              Sessions
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export function HomeSection({
  members,
  signedUpEvents,
  tournamentReminders,
  lostArrows,
  onOpenGuestLogin,
  onOpenLostAndFound,
  onOpenApprovals,
  onOpenBeginnersCourses,
  onOpenHaveAGoSessions,
  onOpenTasterSessions,
  approvalSummary = null,
  beginnerDashboard,
  beginnerCoachAssignments,
  mobileOnSiteFeature = null,
  hideEventPanels = false,
}) {
  return (
    <div className="home-dashboard-layout">
      <div className="home-split-view">
        <MembersAtRangeList members={members} />
        <GuestSignInCard onOpenGuestLogin={onOpenGuestLogin} />
        <CurrentLostArrowsCard
          lostArrows={lostArrows}
          onOpenLostAndFound={onOpenLostAndFound}
        />
        <CommitteeApprovalsCard
          approvalSummary={approvalSummary}
          onOpenApprovals={onOpenApprovals}
        />
        <CommitteeApprovedCoursesCard
          approvalSummary={approvalSummary}
          onOpenBeginnersCourses={onOpenBeginnersCourses}
          onOpenHaveAGoSessions={onOpenHaveAGoSessions}
          onOpenTasterSessions={onOpenTasterSessions}
        />
        <BeginnerTodayCard dashboard={beginnerDashboard} />
        <MobileOnSiteFeatureCard mobileOnSiteFeature={mobileOnSiteFeature} />
      </div>
      {hideEventPanels ? null : (
        <div className="home-events-column">
          <SignedUpEventsList
            events={signedUpEvents}
            coachAssignments={beginnerCoachAssignments}
          />
          <TournamentRemindersList reminders={tournamentReminders} />
        </div>
      )}
    </div>
  );
}
