import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { listMyBeginnerCoachingAssignments } from "../../api/homeApi";
import { listBeginnersCourseCalendarLessons } from "../../api/scheduleApi";
import { formatDate } from "../../utils/dateTime";
import type { UserProfile } from "../../types/app";
import { Button } from "../components/Button";
import { canAccessCoachingHub, courseLabel, csvCell, scheduledHours, sessionEnd, type CoachAssignment } from "./coachingHubModel";
import "./CoachingHubPage.css";

const sections = ["Overview", "Sessions", "Participants", "My History"] as const;
const sectionKeys = ["overview", "sessions", "participants", "history"];

export function CoachingHubPage({ currentUserProfile }: { currentUserProfile: UserProfile | null }) {
  const [params, setParams] = useSearchParams();
  const [year, setYear] = useState("all");
  const username = currentUserProfile?.auth?.username ?? "";
  const allowed = canAccessCoachingHub(currentUserProfile);
  const assignmentsQuery = useQuery({
    queryKey: ["home-activity", username, "coaching-hub"],
    queryFn: () => listMyBeginnerCoachingAssignments<CoachAssignment>(username),
    enabled: allowed && Boolean(username),
    refetchInterval: 60000,
  });
  const calendarQuery = useQuery({
    queryKey: ["beginners-course-calendar"],
    queryFn: listBeginnersCourseCalendarLessons,
    enabled: allowed,
    refetchInterval: 60000,
  });
  if (!allowed) return <p role="alert">Coaching access is required to open this page.</p>;
  const lessons = [...(assignmentsQuery.data?.lessons ?? [])].sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  const now = Date.now();
  const upcoming = lessons.filter(lesson => sessionEnd(lesson) > now);
  const past = lessons.filter(lesson => sessionEnd(lesson) <= now);
  const history = past.filter(lesson => year === "all" || lesson.date.startsWith(year));
  const opportunities = (calendarQuery.data?.lessons ?? []).filter(lesson => !lesson.isCancelled && new Date(`${lesson.date}T${lesson.startTime}`).getTime() > now && lesson.coachNames.length === 0);
  const section = sectionKeys.includes(params.get("tab") ?? "") ? params.get("tab")! : "overview";
  const selected = lessons.find(lesson => String(lesson.id) === params.get("session"));
  const details = selected && calendarQuery.data?.lessons?.find(lesson => String(lesson.lessonId) === String(selected.id));
  const openSession = (lesson: CoachAssignment) => setParams({ tab: "sessions", session: String(lesson.id) });
  const sessionRow = (lesson: CoachAssignment) => <li key={lesson.id} className="coaching-hub-row">
    <div><strong>{courseLabel(lesson.courseType)} · Lesson {lesson.lessonNumber}</strong><p>{formatDate(lesson.date)} · {lesson.startTime.slice(0, 5)}–{lesson.endTime.slice(0, 5)}</p><span>{lesson.beginnerCount} participants · Coordinator: {lesson.coordinatorName || "Not listed"}</span></div>
    <Button variant="secondary" onClick={() => openSession(lesson)}>Open session</Button>
  </li>;
  const exportHistory = () => {
    const rows = [["Date", "Course", "Lesson", "Start", "End", "Scheduled hours", "Status"], ...history.map(lesson => [lesson.date, courseLabel(lesson.courseType), lesson.lessonNumber, lesson.startTime, lesson.endTime, scheduledHours(lesson), "Assigned — attendance unconfirmed"])];
    const blob = new Blob(["\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `coaching-assignments-${year}.csv`; anchor.click();
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
    {assignmentsQuery.isPending ? <p role="status">Loading your coaching assignments…</p> : null}
    {assignmentsQuery.isError ? <div role="alert"><p>Your assignments could not be loaded.</p><Button variant="secondary" onClick={() => assignmentsQuery.refetch()}>Try again</Button></div> : null}
    {section === "overview" && <>
      <section className="coaching-hub-panel coaching-hub-next"><h2>Next session</h2>{upcoming[0] ? <ul>{sessionRow(upcoming[0])}</ul> : !assignmentsQuery.isPending && !assignmentsQuery.isError ? <p>You have no upcoming coaching assignments.</p> : null}</section>
      <div className="coaching-hub-columns"><section className="coaching-hub-panel"><h2>Upcoming assignments</h2><ul>{upcoming.slice(1).map(sessionRow)}</ul>{upcoming.length <= 1 && !assignmentsQuery.isPending && !assignmentsQuery.isError ? <p>No further assignments scheduled.</p> : null}</section>
      <section className="coaching-hub-panel"><h2>Coaches wanted</h2><p>Upcoming sessions with no assigned coaches. Contact the coordinator to volunteer.</p>{calendarQuery.isPending ? <p role="status">Loading sessions…</p> : calendarQuery.isError ? <div role="alert"><p>Available sessions could not be loaded.</p><Button variant="secondary" onClick={() => calendarQuery.refetch()}>Try again</Button></div> : opportunities.length ? <ul>{opportunities.map(lesson => <li key={lesson.lessonId} className="coaching-hub-row"><div><strong>{courseLabel(lesson.courseType)} · Lesson {lesson.lessonNumber}</strong><p>{formatDate(lesson.date)} · {lesson.startTime.slice(0, 5)}–{lesson.endTime.slice(0, 5)}</p><span>{lesson.participantCount ?? lesson.beginnerCount} participants · Coordinator: {lesson.coordinatorName}</span></div></li>)}</ul> : <p>No upcoming sessions without coaches.</p>}<Link to="/event-calendar">View club calendar</Link></section></div>
    </>}
    {section === "sessions" && <div className="coaching-hub-columns"><section className="coaching-hub-panel"><h2>Your sessions</h2><ul>{lessons.map(sessionRow)}</ul>{!lessons.length && !assignmentsQuery.isPending && !assignmentsQuery.isError ? <p>No coaching sessions assigned.</p> : null}</section>
      <section className="coaching-hub-panel" aria-live="polite">{selected ? <><h2>{courseLabel(selected.courseType)} · Lesson {selected.lessonNumber}</h2><p>{formatDate(selected.date)} · {selected.startTime.slice(0, 5)}–{selected.endTime.slice(0, 5)}</p><h3>Lesson plan</h3><p>Shared lesson plans will appear here once available.</p><dl className="coaching-hub-plan">{["Objective", "Warm-up", "Distance", "Drills", "Equipment / setup"].map(label => <div key={label}><dt>{label}</dt><dd>Not recorded</dd></div>)}</dl><h3>Coaches</h3>{calendarQuery.isPending ? <p>Loading coach names…</p> : details ? <p>{details.coachNames.join(", ") || "No coaches listed"}</p> : <p>The coach list is currently unavailable.</p>}<p>Coordinator: {selected.coordinatorName}</p><h3>Participants</h3><p>{selected.beginnerCount} participants enrolled.</p><p>Participant details and Coaching Cards will appear here when coach access is available.</p></> : <><h2>Session workspace</h2><p>Select a session to see its lesson plan, coaches and participant summary.</p></>}</section></div>}
    {section === "participants" && <section className="coaching-hub-panel"><h2>Participants</h2><p>Coaching Cards will bring together each participant’s progress, previous lesson notes and next-session focus.</p><h3>Coaching history</h3><p>Participant records are not yet available in the Coaching Hub. Open your assigned sessions to see participant counts.</p><Button variant="secondary" onClick={() => setParams({ tab: "sessions" })}>View your sessions</Button></section>}
    {section === "history" && <section className="coaching-hub-panel"><div className="coaching-hub-toolbar"><h2>My History</h2><label>Year <select value={year} onChange={event => setYear(event.target.value)}><option value="all">All years</option>{[...new Set(past.map(lesson => lesson.date.slice(0, 4)))].sort().reverse().map(value => <option key={value}>{value}</option>)}</select></label><Button variant="secondary" disabled={!history.length || assignmentsQuery.isError} onClick={exportHistory}>Export CSV</Button></div><p>Past assignments are not proof of attendance. Confirmed attendance and coaching hours will be added separately.</p><div className="coaching-hub-stats"><div><strong>{history.length}</strong><span>Past assigned sessions</span></div><div><strong>{history.reduce((total, lesson) => total + scheduledHours(lesson), 0).toFixed(1)}</strong><span>Scheduled hours · unconfirmed</span></div></div><ul>{history.map(sessionRow)}</ul>{!history.length && !assignmentsQuery.isPending && !assignmentsQuery.isError ? <p>No past assignments for this period.</p> : null}</section>}
  </div>;
}
