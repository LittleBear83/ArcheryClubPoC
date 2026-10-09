import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  getMyCoachingLessonDetails,
  listMyCoachingNotes,
  listMyBeginnerCoachingAssignments,
  listMyCoachingOpportunities,
  volunteerForCoachingLesson,
  reportCoachingLessonUnavailability,
} from "../../api/homeApi";
import { formatDate } from "../../utils/dateTime";
import { subscribeToServerEvent } from "../../lib/serverEvents";
import type { UserProfile } from "../../types/app";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import {
  canAccessCoachingHub,
  courseItemLabel,
  courseLabel,
  csvCell,
  isCoachingOpportunityEligible,
  scheduledHours,
  splitAssignments,
  type CoachAssignment,
  type CoachingOpportunity,
  type CoachingParticipant,
} from "./coachingHubModel";
import { CoachingSessionDetail, type CoachingSessionDetailData } from "./CoachingSessionDetail";
import { CoachingParticipantNotes, coachingNoteDate } from "./CoachingParticipantNotes";
import "./CoachingHubPage.css";

const sections = ["Overview", "Sessions", "Participants", "My History"] as const;
const sectionKeys = ["overview", "sessions", "participants", "history"];
const coachingQueryKeys = [
  ["beginners-course-calendar"],
  ["beginners-courses-dashboard"],
  ["taster-sessions-dashboard"],
  ["have-a-go-sessions-dashboard"],
];

export function CoachingHubPage({ currentUserProfile }: { currentUserProfile: UserProfile | null }) {
  const [params, setParams] = useSearchParams();
  const [year, setYear] = useState("all");
  const [busyLessonId, setBusyLessonId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [unavailableLesson, setUnavailableLesson] = useState<CoachAssignment | null>(null);
  const [unavailabilityReason, setUnavailabilityReason] = useState("");
  const [notesParticipant, setNotesParticipant] = useState<CoachingParticipant | null>(null);
  const queryClient = useQueryClient();
  const username = currentUserProfile?.auth?.username ?? "";
  const allowed = canAccessCoachingHub(currentUserProfile);
  const assignmentsQuery = useQuery({
    queryKey: ["home-activity", username, "coaching-hub"],
    queryFn: () => listMyBeginnerCoachingAssignments<CoachAssignment>(username),
    enabled: allowed && Boolean(username),
    refetchInterval: 60000,
  });
  const opportunitiesQuery = useQuery({
    queryKey: ["coaching-opportunities", username],
    queryFn: () => listMyCoachingOpportunities<CoachingOpportunity>(username),
    enabled: allowed && Boolean(username),
    refetchInterval: 60000,
  });
  const lessons = assignmentsQuery.data?.lessons ?? [];
  const now = Date.now();
  const assignedLessonIds = new Set(lessons.map((lesson) => String(lesson.id)));
  const opportunitiesWithShortfall = (opportunitiesQuery.data?.lessons ?? []).filter(
    (lesson) => Number(lesson.coachShortfall) > 0 &&
      isCoachingOpportunityEligible(lesson, now, assignedLessonIds),
  );
  const { next, upcoming, past } = splitAssignments(lessons, now);
  const history = past.filter((lesson) => year === "all" || lesson.date.startsWith(year));
  const section = sectionKeys.includes(params.get("tab") ?? "") ? params.get("tab")! : "overview";
  const selectedId = params.get("session");
  const selected = lessons.find((lesson) => String(lesson.id) === selectedId);
  const detailsQuery = useQuery({
    queryKey: ["coaching-session-details", username, selectedId],
    queryFn: async () => (await getMyCoachingLessonDetails<CoachingSessionDetailData>(username, selectedId!)).lesson,
    enabled: allowed && section === "sessions" && Boolean(selected && selectedId),
    refetchInterval: 60000,
  });
  const myNotesQuery = useQuery({
    queryKey: ["my-coaching-notes", username],
    queryFn: () => listMyCoachingNotes(username),
    enabled: allowed && Boolean(username) && section === "history",
  });

  useEffect(() => {
    if (!username) return undefined;
    return subscribeToServerEvent("beginners.updated", () => {
      void queryClient.invalidateQueries({ queryKey: ["coaching-opportunities", username] });
      void queryClient.invalidateQueries({ queryKey: ["home-activity", username, "coaching-hub"] });
    });
  }, [queryClient, username]);

  if (!allowed) return <p role="alert">Coaching volunteer access is required to open this page.</p>;

  const refreshCoachingData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["home-activity", username, "coaching-hub"] }),
      queryClient.invalidateQueries({ queryKey: ["coaching-opportunities", username] }),
      queryClient.invalidateQueries({ queryKey: ["coaching-session-details", username] }),
      ...coachingQueryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey: [...queryKey, username] })),
      queryClient.invalidateQueries({ queryKey: ["beginners-course-calendar"] }),
    ]);
  };

  const handleVolunteer = async (lesson: CoachingOpportunity) => {
    if (Number(lesson.coachShortfall) <= 0) return;
    setBusyLessonId(String(lesson.lessonId));
    setFeedback("");
    try {
      const result = await volunteerForCoachingLesson(username, lesson.lessonId);
      setFeedback(result.message ?? "You have volunteered for this session.");
      await refreshCoachingData();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "You could not be added to this session.");
    } finally {
      setBusyLessonId(null);
    }
  };

  const confirmUnavailability = async () => {
    if (!unavailableLesson) return;
    const lesson = unavailableLesson;
    setBusyLessonId(String(lesson.id));
    setFeedback("");
    try {
      const result = await reportCoachingLessonUnavailability(username, lesson.id, unavailabilityReason);
      setFeedback(result.message ?? "The coordinator has been notified. Your assignment remains in place.");
      setUnavailableLesson(null);
      setUnavailabilityReason("");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "The coordinator could not be notified.");
    } finally {
      setBusyLessonId(null);
    }
  };

  const openSession = (lesson: CoachAssignment) => setParams({ tab: "sessions", session: String(lesson.id) });
  const requestUnavailability = (lesson: CoachAssignment) => {
    setUnavailabilityReason("");
    setUnavailableLesson(lesson);
  };
  const sessionRow = (lesson: CoachAssignment, showUnavailability = true) => <li key={lesson.id} className="coaching-hub-row">
    <div className="coaching-hub-row-content">
      <strong>{courseLabel(lesson.courseType)} · {courseItemLabel(lesson.courseType)} {lesson.lessonNumber}</strong>
      <p>{formatDate(lesson.date)} · {lesson.startTime.slice(0, 5)}–{lesson.endTime.slice(0, 5)}</p>
      <span>{lesson.beginnerCount}{lesson.participantCapacity ? ` / ${lesson.participantCapacity}` : ""} participants · <span className={(lesson.coachShortfall ?? 0) > 0 ? "coaching-coverage-shortfall" : "coaching-coverage-covered"}>{lesson.coachCount ?? 0} / {lesson.requiredCoachCount ?? 1} coaches · {(lesson.coachShortfall ?? 0) > 0 ? `${lesson.coachShortfall} more needed` : (lesson.coachCount ?? 0) > (lesson.requiredCoachCount ?? 1) ? "Covered" : "Fully covered"}</span> · Coordinator: {lesson.coordinatorName || "Not listed"}</span>
    </div>
    <div className="coaching-hub-row-actions">
      <Button variant="secondary" onClick={() => openSession(lesson)}>Open session</Button>
      {showUnavailability && lesson.sessionStatus !== "completed" ? <Button variant="secondary" disabled={busyLessonId === String(lesson.id)} onClick={() => requestUnavailability(lesson)}>I can’t attend</Button> : null}
    </div>
  </li>;
  const exportHistory = () => {
    const rows = [["Date", "Course", "Lesson", "Start", "End", "Scheduled hours", "Status"], ...history.map((lesson) => [lesson.date, courseLabel(lesson.courseType), lesson.lessonNumber, lesson.startTime, lesson.endTime, scheduledHours(lesson), "Assigned — attendance unconfirmed"])];
    const blob = new Blob(["\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `coaching-assignments-${year}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <div className="coaching-hub">
    <p className="coaching-hub-intro">Your sessions, shared lesson plans and participant progress in one place.</p>
    <nav className="coaching-hub-tabs committee-tabs beginners-course-tabs" role="tablist" aria-label="Coaching sections">{sections.map((label, index) => {
      const isActive = section === sectionKeys[index];
      return <Button key={label} type="button" role="tab" aria-selected={isActive}
        className={`committee-tab beginners-course-tab ${isActive ? "is-active" : ""}`}
        variant="ghost" onClick={() => setParams({ tab: sectionKeys[index] })}>{label}</Button>;
    })}</nav>
    {feedback ? <p className="coaching-hub-feedback" role="status">{feedback}</p> : null}
    {assignmentsQuery.isPending ? <p role="status">Loading your coaching assignments…</p> : null}
    {assignmentsQuery.isError ? <div role="alert"><p>Your assignments could not be loaded.</p><Button variant="secondary" onClick={() => assignmentsQuery.refetch()}>Try again</Button></div> : null}
    {section === "overview" && <>
      <section className="coaching-hub-panel coaching-hub-next"><h2>Next session</h2>{next ? <ul>{sessionRow(next)}</ul> : !assignmentsQuery.isPending && !assignmentsQuery.isError ? <p>You have no upcoming coaching assignments.</p> : null}</section>
      <div className="coaching-hub-columns">
        <section className="coaching-hub-panel"><h2>Upcoming assignments</h2>{assignmentsQuery.isPending ? <p role="status">Loading your assignments…</p> : upcoming.length ? <ul>{upcoming.map((lesson) => sessionRow(lesson))}</ul> : <p>No further assignments scheduled.</p>}</section>
        <section className="coaching-hub-panel"><h2>Coaches wanted</h2><p>Approved future sessions with space for another coach.</p>
          {opportunitiesQuery.isPending ? <p role="status">Loading coaching opportunities…</p> : opportunitiesQuery.isError ? <div role="alert"><p>Coaching opportunities could not be loaded.</p><Button variant="secondary" onClick={() => opportunitiesQuery.refetch()}>Try again</Button></div> : opportunitiesWithShortfall.length ? <ul>{opportunitiesWithShortfall.map((lesson) => <li key={lesson.lessonId} className="coaching-hub-row">
            <div className="coaching-hub-row-content"><strong>{courseLabel(lesson.courseType)} · {courseItemLabel(lesson.courseType)} {lesson.lessonNumber}</strong><p>{formatDate(lesson.date)} · {lesson.startTime.slice(0, 5)}–{lesson.endTime.slice(0, 5)}</p><span className={lesson.coachShortfall > 0 ? "coaching-coverage-shortfall" : "coaching-coverage-covered"}>{lesson.participantCount}{lesson.participantCapacity ? ` / ${lesson.participantCapacity}` : ""} participants · {lesson.assignedCoachCount} / {lesson.requiredCoachCount} coaches · {lesson.coachShortfall > 0 ? `${lesson.coachShortfall} more coaches needed` : lesson.assignedCoachCount > lesson.requiredCoachCount ? "Covered" : "Fully covered"} · Coordinator: {lesson.coordinatorName || "Not listed"}</span></div>
            <Button variant="primary" disabled={busyLessonId === String(lesson.lessonId)} onClick={() => void handleVolunteer(lesson)}>{busyLessonId === String(lesson.lessonId) ? "Joining…" : "Volunteer"}</Button>
          </li>)}</ul> : <p>No upcoming sessions currently need another coach.</p>}
          <Link to="/event-calendar">View club calendar</Link>
        </section>
      </div>
    </>}
    {section === "sessions" && <div className="coaching-hub-columns">
      <section className="coaching-hub-panel"><h2>Your sessions</h2>{lessons.length ? <ul>{lessons.map((lesson) => sessionRow(lesson))}</ul> : !assignmentsQuery.isPending ? <p>No coaching sessions assigned.</p> : null}</section>
      <section className="coaching-hub-panel" aria-live="polite">
        {selected ? detailsQuery.isPending ? <p role="status">Loading session details…</p> : detailsQuery.isError ? <div role="alert"><p>Session details could not be loaded.</p><Button variant="secondary" onClick={() => detailsQuery.refetch()}>Try again</Button></div> : detailsQuery.data ? <CoachingSessionDetail lesson={detailsQuery.data} reportingUnavailable={busyLessonId === String(selected.id)} onCannotAttend={() => requestUnavailability(selected)} onOpenNotes={setNotesParticipant} /> : null : <><h2>Session workspace</h2><p>Select one of your assigned sessions to view coach and participant details.</p></>}
      </section>
    </div>}
    {section === "participants" && <section className="coaching-hub-panel"><h2>Participants</h2><p>Open one of your sessions to see enrolled participants and add coaching notes.</p><Button variant="secondary" onClick={() => setParams({ tab: "sessions" })}>View your sessions</Button></section>}
    {section === "history" && <section className="coaching-hub-panel"><div className="coaching-hub-toolbar"><h2>My History</h2><label>Year <select value={year} onChange={(event) => setYear(event.target.value)}><option value="all">All years</option>{[...new Set(past.map((lesson) => lesson.date.slice(0, 4)))].sort().reverse().map((value) => <option key={value}>{value}</option>)}</select></label><Button variant="secondary" disabled={!history.length || assignmentsQuery.isError} onClick={exportHistory}>Export CSV</Button></div><p>Past assignments are not proof of attendance. Confirmed attendance and coaching hours will be added separately.</p><div className="coaching-hub-stats"><div><strong>{history.length}</strong><span>Past assigned sessions</span></div><div><strong>{history.reduce((total, lesson) => total + scheduledHours(lesson), 0).toFixed(1)}</strong><span>Scheduled hours · unconfirmed</span></div></div><ul>{history.map((lesson) => sessionRow(lesson, false))}</ul>{!history.length && !assignmentsQuery.isPending && !assignmentsQuery.isError ? <p>No past assignments for this period.</p> : null}</section>}
    {section === "history" && <section className="coaching-hub-panel coaching-my-notes"><h2>My coaching notes</h2><p>Your notes are kept for 12 months. Notes in their final 30 days are highlighted.</p>
        {myNotesQuery.isPending ? <p role="status">Loading your notes…</p> : null}
        {myNotesQuery.isError ? <div role="alert"><p>Your notes could not be loaded.</p><Button variant="secondary" onClick={() => void myNotesQuery.refetch()}>Try again</Button></div> : null}
        {myNotesQuery.data && !myNotesQuery.data.notes.length ? <p>You have not added any coaching notes yet.</p> : null}
        {myNotesQuery.data?.notes.length ? <ul className="coaching-notes-list" aria-label="My coaching notes">{myNotesQuery.data.notes.map((note) => <li key={note.id} className={note.dueForDeletion ? "is-due-for-deletion" : ""}>
          <span>{coachingNoteDate(note.createdAt)} - {note.attendeeInitials} - </span><span>{note.text}</span>
          {note.dueForDeletion ? <span className="coaching-note-expiry">Due to be deleted on {coachingNoteDate(note.expiresAt)}</span> : null}
        </li>)}</ul> : null}
    </section>}
    {selectedId ? <CoachingParticipantNotes username={username} lessonId={selectedId} participant={notesParticipant} onClose={() => setNotesParticipant(null)} /> : null}
    <Modal open={Boolean(unavailableLesson)} onClose={() => setUnavailableLesson(null)} title="Tell the coordinator you can’t attend">
      {unavailableLesson ? <div className="coaching-unavailability-confirmation"><p>Notify the coordinator that you can’t attend {courseLabel(unavailableLesson.courseType)} · {courseItemLabel(unavailableLesson.courseType)} {unavailableLesson.lessonNumber} on {formatDate(unavailableLesson.date)}. You will remain assigned until the coordinator updates the session.</p><label htmlFor="coaching-unavailability-reason">Reason (optional)</label><textarea id="coaching-unavailability-reason" value={unavailabilityReason} maxLength={500} onChange={(event) => setUnavailabilityReason(event.target.value)} rows={3} /><div className="coaching-hub-row-actions"><Button variant="secondary" onClick={() => setUnavailableLesson(null)}>Cancel</Button><Button variant="primary" disabled={busyLessonId === String(unavailableLesson.id)} onClick={() => void confirmUnavailability()}>{busyLessonId === String(unavailableLesson.id) ? "Notifying…" : "Notify coordinator"}</Button></div></div> : null}
    </Modal>
  </div>;
}
