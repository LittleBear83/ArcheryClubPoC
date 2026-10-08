import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  getMyCoachingLessonDetails,
  listMyBeginnerCoachingAssignments,
  listMyCoachingOpportunities,
  volunteerForCoachingLesson,
  withdrawFromCoachingLesson,
} from "../../api/homeApi";
import { formatDate } from "../../utils/dateTime";
import type { UserProfile } from "../../types/app";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import {
  canAccessCoachingHub,
  courseItemLabel,
  courseLabel,
  csvCell,
  scheduledHours,
  splitAssignments,
  type CoachAssignment,
  type CoachingOpportunity,
} from "./coachingHubModel";
import { CoachingSessionDetail, type CoachingSessionDetailData } from "./CoachingSessionDetail";
import { setManualLessonAttendance } from "../../api/beginnersCoursesApi";
import type { CoachingParticipant } from "./coachingHubModel";
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
  const [busyParticipantId, setBusyParticipantId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [withdrawalLesson, setWithdrawalLesson] = useState<CoachAssignment | null>(null);
  const [withdrawalReason, setWithdrawalReason] = useState("");
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

  const confirmWithdrawal = async () => {
    if (!withdrawalLesson) return;
    const lesson = withdrawalLesson;
    setBusyLessonId(String(lesson.id));
    setFeedback("");
    try {
      const result = await withdrawFromCoachingLesson(username, lesson.id, withdrawalReason);
      setFeedback(result.message ?? "You have withdrawn from this session.");
      setWithdrawalLesson(null);
      setWithdrawalReason("");
      await refreshCoachingData();
      if (String(selectedId) === String(lesson.id)) setParams({ tab: "sessions" });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "You could not be removed from this session.");
    } finally {
      setBusyLessonId(null);
    }
  };

  const openSession = (lesson: CoachAssignment) => setParams({ tab: "sessions", session: String(lesson.id) });
  const changeAttendance = async (participant: CoachingParticipant, attended: boolean) => {
    if (!selectedId || participant.id == null) return;
    setBusyParticipantId(participant.id);
    setFeedback("");
    try {
      await setManualLessonAttendance(username, selectedId, participant.id, attended);
      setFeedback(attended ? "Attendance recorded." : "Manual attendance removed.");
      await refreshCoachingData();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Attendance could not be updated.");
    } finally {
      setBusyParticipantId(null);
    }
  };
  const requestWithdrawal = (lesson: CoachAssignment) => {
    setWithdrawalReason("");
    setWithdrawalLesson(lesson);
  };
  const sessionRow = (lesson: CoachAssignment, showWithdrawal = true) => <li key={lesson.id} className="coaching-hub-row">
    <div className="coaching-hub-row-content">
      <strong>{courseLabel(lesson.courseType)} · {courseItemLabel(lesson.courseType)} {lesson.lessonNumber}</strong>
      <p>{formatDate(lesson.date)} · {lesson.startTime.slice(0, 5)}–{lesson.endTime.slice(0, 5)}</p>
      <span>{lesson.beginnerCount}{lesson.participantCapacity ? ` / ${lesson.participantCapacity}` : ""} participants · <span className={(lesson.coachShortfall ?? 0) > 0 ? "coaching-coverage-shortfall" : "coaching-coverage-covered"}>{lesson.coachCount ?? 0} / {lesson.requiredCoachCount ?? 1} coaches · {(lesson.coachShortfall ?? 0) > 0 ? `${lesson.coachShortfall} more needed` : (lesson.coachCount ?? 0) > (lesson.requiredCoachCount ?? 1) ? "Covered" : "Fully covered"}</span> · Coordinator: {lesson.coordinatorName || "Not listed"}</span>
    </div>
    <div className="coaching-hub-row-actions">
      <Button variant="secondary" onClick={() => openSession(lesson)}>Open session</Button>
      {showWithdrawal && lesson.sessionStatus !== "completed" ? <Button variant="secondary" disabled={busyLessonId === String(lesson.id)} onClick={() => requestWithdrawal(lesson)}>I can’t attend</Button> : null}
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
          {opportunitiesQuery.isPending ? <p role="status">Loading coaching opportunities…</p> : opportunitiesQuery.isError ? <div role="alert"><p>Coaching opportunities could not be loaded.</p><Button variant="secondary" onClick={() => opportunitiesQuery.refetch()}>Try again</Button></div> : opportunitiesQuery.data?.lessons?.length ? <ul>{opportunitiesQuery.data.lessons.map((lesson) => <li key={lesson.lessonId} className="coaching-hub-row">
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
        {selected ? detailsQuery.isPending ? <p role="status">Loading session details…</p> : detailsQuery.isError ? <div role="alert"><p>Session details could not be loaded.</p><Button variant="secondary" onClick={() => detailsQuery.refetch()}>Try again</Button></div> : detailsQuery.data ? <CoachingSessionDetail lesson={detailsQuery.data} withdrawing={busyLessonId === String(selected.id)} onWithdraw={() => requestWithdrawal(selected)} busyParticipantId={busyParticipantId} onSetAttendance={(participant, attended) => void changeAttendance(participant, attended)} /> : null : <><h2>Session workspace</h2><p>Select one of your assigned sessions to view coach and participant details.</p></>}
      </section>
    </div>}
    {section === "participants" && <section className="coaching-hub-panel"><h2>Participants</h2><p>Open one of your sessions to see enrolled participants and their recorded equipment and attendance details.</p><Button variant="secondary" onClick={() => setParams({ tab: "sessions" })}>View your sessions</Button></section>}
    {section === "history" && <section className="coaching-hub-panel"><div className="coaching-hub-toolbar"><h2>My History</h2><label>Year <select value={year} onChange={(event) => setYear(event.target.value)}><option value="all">All years</option>{[...new Set(past.map((lesson) => lesson.date.slice(0, 4)))].sort().reverse().map((value) => <option key={value}>{value}</option>)}</select></label><Button variant="secondary" disabled={!history.length || assignmentsQuery.isError} onClick={exportHistory}>Export CSV</Button></div><p>Past assignments are not proof of attendance. Confirmed attendance and coaching hours will be added separately.</p><div className="coaching-hub-stats"><div><strong>{history.length}</strong><span>Past assigned sessions</span></div><div><strong>{history.reduce((total, lesson) => total + scheduledHours(lesson), 0).toFixed(1)}</strong><span>Scheduled hours · unconfirmed</span></div></div><ul>{history.map((lesson) => sessionRow(lesson, false))}</ul>{!history.length && !assignmentsQuery.isPending && !assignmentsQuery.isError ? <p>No past assignments for this period.</p> : null}</section>}
    <Modal open={Boolean(withdrawalLesson)} onClose={() => setWithdrawalLesson(null)} title="Withdraw from coaching session">
      {withdrawalLesson ? <div className="coaching-withdraw-confirmation"><p>Remove yourself from {courseLabel(withdrawalLesson.courseType)} · {courseItemLabel(withdrawalLesson.courseType)} {withdrawalLesson.lessonNumber} on {formatDate(withdrawalLesson.date)}?</p><label htmlFor="coaching-withdrawal-reason">Reason (optional)</label><textarea id="coaching-withdrawal-reason" value={withdrawalReason} maxLength={500} onChange={(event) => setWithdrawalReason(event.target.value)} rows={3} /><div className="coaching-hub-row-actions"><Button variant="secondary" onClick={() => setWithdrawalLesson(null)}>Keep assignment</Button><Button variant="primary" disabled={busyLessonId === String(withdrawalLesson.id)} onClick={() => void confirmWithdrawal()}>{busyLessonId === String(withdrawalLesson.id) ? "Withdrawing…" : "Confirm withdrawal"}</Button></div></div> : null}
    </Modal>
  </div>;
}
