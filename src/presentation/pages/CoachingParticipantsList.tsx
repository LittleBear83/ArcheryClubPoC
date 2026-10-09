import type { CoachingParticipant } from "./coachingHubModel";
import { Button } from "../components/Button";

export function CoachingParticipantsList({ participants, showNotes = false, onOpenNotes }: { participants: CoachingParticipant[]; showNotes?: boolean; onOpenNotes?: (participant: CoachingParticipant) => void }) {
  if (!participants.length) return <p>No participants are enrolled.</p>;
  return <ul className="coaching-session-participants">
    {participants.map((participant, index) => <li key={`${participant.firstName}-${participant.surname}-${index}`}>
      <h4>{participant.firstName} {participant.surname}</h4>
      <dl>
        <div><dt>Participant type</dt><dd>{participant.sizeCategory === "junior" ? "Junior" : participant.sizeCategory === "senior" ? "Senior" : "Not recorded"}</dd></div>
        <div><dt>Handedness</dt><dd>{participant.handedness || "Not recorded"}</dd></div>
        <div><dt>Eye dominance</dt><dd>{participant.eyeDominance || "Not recorded"}</dd></div>
        <div><dt>Draw length</dt><dd>{participant.drawLength || "Not recorded"}</dd></div>
        <div><dt>Attendance</dt><dd>{participant.attendanceRecorded ? "Attendance recorded" : participant.noShowRecorded ? "No-show recorded" : "Not recorded"}</dd></div>
      </dl>
      {showNotes && participant.id ? <Button variant={participant.noteCount ? "info" : "secondary"} className="coaching-participant-notes-button" onClick={() => onOpenNotes?.(participant)}>Notes</Button> : null}
    </li>)}
  </ul>;
}
