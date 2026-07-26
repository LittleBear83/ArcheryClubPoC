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

function MobileOnSiteFeatureCard({ mobileOnSiteFeature }) {
  if (!mobileOnSiteFeature?.isMobile) {
    return null;
  }

  const {
    activeRangePresenceEndsAtText,
    distanceMeters,
    error,
    isBookingOnSite,
    isCheckInWindowOpen,
    isLocating,
    isSupported,
    isWithinGeofence,
    onBookOnSite,
    permissionState,
    radiusMeters,
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
          <p>
            You are already booked on site. The button will unlock again after{" "}
            {activeRangePresenceEndsAtText}.
          </p>
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
                  ? "Already booked on site"
                  : "Book On Site"}
            </Button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function SignedUpEventsList({ events }) {
  return (
    <section className="home-panel">
      <h3 className="home-panel-title">Your Club Events List</h3>
      <ul className="home-info-list home-info-list--events">
        {events.length > 0 ? (
          events.map((event) => (
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

function MembersAtRangeList({ members }) {
  return (
    <section className="home-panel">
      <h3 className="home-panel-title">Current Members At The Range</h3>
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
          <li>No members have logged in within the last 2 hours</li>
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

function BeginnerCoachAssignmentsCard({ assignments }) {
  if (!assignments.length) {
    return null;
  }

  return (
    <section className="home-panel">
      <h3 className="home-panel-title">Beginners Coaching</h3>
      <ul className="home-info-list home-info-list--events">
        {assignments.map((assignment) => (
          <li key={assignment.id}>
            <strong>{formatDate(assignment.date)}</strong>
            {`: lesson ${assignment.lessonNumber}, coordinator ${assignment.coordinatorName}, ${assignment.beginnerCount} beginners`}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HomeSection({
  members,
  signedUpEvents,
  tournamentReminders,
  lostArrows,
  onOpenLostAndFound,
  beginnerDashboard,
  beginnerCoachAssignments,
  mobileOnSiteFeature = null,
  hideEventPanels = false,
}) {
  return (
    <div className="home-split-view">
      <MembersAtRangeList members={members} />
      <CurrentLostArrowsCard
        lostArrows={lostArrows}
        onOpenLostAndFound={onOpenLostAndFound}
      />
      {hideEventPanels ? null : <SignedUpEventsList events={signedUpEvents} />}
      {hideEventPanels ? null : (
        <TournamentRemindersList reminders={tournamentReminders} />
      )}
      <BeginnerTodayCard dashboard={beginnerDashboard} />
      <BeginnerCoachAssignmentsCard assignments={beginnerCoachAssignments} />
      <MobileOnSiteFeatureCard mobileOnSiteFeature={mobileOnSiteFeature} />
    </div>
  );
}
