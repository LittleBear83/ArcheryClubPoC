import { formatDate } from "../../utils/dateTime";
import { Button } from "../components/Button";
import { courseItemLabel, courseLabel, type CoachingParticipant } from "./coachingHubModel";
import { CoachingParticipantsList } from "./CoachingParticipantsList";

export type CoachingSessionDetailData = {
  id: string | number;
  courseType: string;
  lessonNumber: number;
  date: string;
  startTime: string;
  endTime: string;
  coordinatorName: string;
  participantCount: number;
  participantCapacity?: number;
  requiredCoachCount: number;
  assignedCoachCount: number;
  coachShortfall: number;
  isFullyCovered: boolean;
  status: "upcoming" | "in-progress" | "completed";
  coaches: Array<{ username: string; fullName: string; isCoordinator: boolean }>;
  participants: CoachingParticipant[];
};

export function CoachingSessionDetail({
  lesson,
  onWithdraw,
  withdrawing = false,
  busyParticipantId,
  onSetAttendance,
}: {
  lesson: CoachingSessionDetailData;
  onWithdraw: () => void;
  withdrawing?: boolean;
  busyParticipantId?: number | null;
  onSetAttendance?: (participant: CoachingParticipant, attended: boolean) => void;
}) {
  const statusLabel = lesson.status === "in-progress" ? "In progress" : lesson.status === "completed" ? "Completed" : "Upcoming";
  return <div className="coaching-session-detail">
    <header className="coaching-session-heading">
      <div>
        <h2>{courseLabel(lesson.courseType)} · {courseItemLabel(lesson.courseType)} {lesson.lessonNumber}</h2>
        <p>{formatDate(lesson.date)} · {lesson.startTime.slice(0, 5)}–{lesson.endTime.slice(0, 5)}</p>
      </div>
      <span className={`coaching-session-status is-${lesson.status}`}>{statusLabel}</span>
    </header>
    <p><strong>Coordinator:</strong> {lesson.coordinatorName || "Not listed"}</p>
    <p><strong>Participants:</strong> {lesson.participantCount}{lesson.participantCapacity ? ` / ${lesson.participantCapacity}` : ""}</p>
    <p className={lesson.coachShortfall > 0 ? "coaching-coverage-shortfall" : "coaching-coverage-covered"}><strong>Coach coverage:</strong> {lesson.assignedCoachCount} / {lesson.requiredCoachCount} coaches{lesson.coachShortfall > 0 ? ` · ${lesson.coachShortfall} more coaches needed` : lesson.assignedCoachCount > lesson.requiredCoachCount ? " · Covered" : " · Fully covered"}</p>

    <section aria-labelledby="coaching-session-plan-heading">
      <h3 id="coaching-session-plan-heading">Lesson Plan</h3>
      <p>No lesson plan has been added yet.</p>
    </section>

    <section aria-labelledby="coaching-session-coaches-heading">
      <div className="coaching-session-section-heading">
        <h3 id="coaching-session-coaches-heading">Coaches</h3>
        {lesson.status !== "completed" ? <Button variant="secondary" disabled={withdrawing} onClick={onWithdraw}>I can’t attend</Button> : null}
      </div>
      {lesson.coaches.length ? <ul className="coaching-session-coaches">
        {lesson.coaches.map((coach) => <li key={coach.username}>{coach.fullName}{coach.isCoordinator ? <span className="coaching-session-coordinator">Coordinator</span> : null}</li>)}
      </ul> : <p>No coaches assigned.</p>}
    </section>

    <section aria-labelledby="coaching-session-participants-heading">
      <h3 id="coaching-session-participants-heading">Participants</h3>
      <CoachingParticipantsList participants={lesson.participants} canRecordAttendance={lesson.status !== "upcoming"} busyParticipantId={busyParticipantId} onSetAttendance={onSetAttendance} />
    </section>
  </div>;
}
