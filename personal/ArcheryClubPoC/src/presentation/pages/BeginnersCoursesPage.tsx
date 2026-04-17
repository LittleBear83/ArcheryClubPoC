import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import {
  addBeginnerToCourse,
  assignBeginnerCase,
  assignLessonCoaches,
  cancelBeginnersCourse,
  convertBeginnerToMember as convertBeginnerToMemberApi,
  createBeginnersCourse,
  createHaveAGoSession,
  getBeginnersCoursesDashboard,
  getHaveAGoSessionsDashboard,
  updateBeginnerParticipant,
} from "../../api/beginnersCoursesApi";
import { formatDate, formatClockTime } from "../../utils/dateTime";
import {
  formatMemberDisplayName,
  formatMemberDisplayUsername,
} from "../../utils/userProfile";

const EMPTY_COURSE_FORM = {
  coordinatorUsername: "",
  firstLessonDate: new Date().toISOString().slice(0, 10),
  startTime: "18:00",
  endTime: "20:00",
  lessonCount: 6,
  beginnerCapacity: 8,
};

const EMPTY_BEGINNER_FORM = {
  firstName: "",
  surname: "",
  sizeCategory: "senior",
  heightText: "",
  handedness: "",
  eyeDominance: "",
  initialEmailSent: false,
  thirtyDayReminderSent: false,
  courseFeePaid: false,
};

type PersonOption = {
  username: string;
  fullName: string;
  userType: string;
};

type CaseOption = {
  id: number;
  reference: string;
  locationLabel: string;
  memberUsername: string;
};

type CourseBeginner = {
  id: number;
  username: string;
  password: string;
  userType: string;
  firstName: string;
  surname: string;
  fullName: string;
  sizeCategory: string;
  heightText: string;
  handedness: string;
  eyeDominance: string;
  initialEmailSent: boolean;
  thirtyDayReminderSent: boolean;
  courseFeePaid: boolean;
  attendanceDates: string[];
  convertedToMember: boolean;
  assignedCaseId: number | null;
  assignedCaseNumber: string;
};

type CourseLesson = {
  id: number;
  lessonNumber: number;
  date: string;
  startTime: string;
  endTime: string;
  coaches: Array<{ username: string; fullName: string }>;
};

type CourseRecord = {
  id: number;
  coordinatorUsername: string;
  coordinatorName: string;
  submittedByName: string;
  approvedByName: string;
  firstLessonDate: string;
  startTime: string;
  endTime: string;
  lessonCount: number;
  beginnerCapacity: number;
  approvalStatus: string;
  isCancelled: boolean;
  cancellationReason: string;
  rejectionReason: string;
  createdAt: string;
  approvedAt: string;
  lessons: CourseLesson[];
  beginners: CourseBeginner[];
  placesRemaining: number;
};

type DashboardPayload = {
  permissions: {
    canManageBeginnersCourses: boolean;
    canApproveBeginnersCourses: boolean;
  };
  courses: CourseRecord[];
  coordinators: PersonOption[];
  coaches: PersonOption[];
  availableCases: CaseOption[];
};

type CancelledCourseSummary = {
  id: number;
  firstLessonDate: string;
  coordinatorName: string;
  archiveReason: string;
};

function hasCourseFinished(course: CourseRecord) {
  if (!course.lessons?.length) {
    return false;
  }

  const lastLesson = [...course.lessons].sort((left, right) => {
    const byDate = left.date.localeCompare(right.date);
    if (byDate !== 0) {
      return byDate;
    }

    return left.endTime.localeCompare(right.endTime);
  })[course.lessons.length - 1];

  if (!lastLesson?.date || !lastLesson?.endTime) {
    return false;
  }

  const normalizedEndTime = /^\d{2}:\d{2}$/.test(lastLesson.endTime)
    ? `${lastLesson.endTime}:00`
    : lastLesson.endTime;
  const lessonEnd = new Date(`${lastLesson.date}T${normalizedEndTime}`);

  if (Number.isNaN(lessonEnd.getTime())) {
    return false;
  }

  return lessonEnd.getTime() < Date.now();
}

function BeginnerFormFields({ copy, form, onChange, onToggle }) {
  return (
    <div className="beginners-course-form-grid">
      <label>
        First name
        <input
          type="text"
          value={form.firstName}
          onChange={onChange("firstName")}
        />
      </label>
      <label>
        Surname
        <input
          type="text"
          value={form.surname}
          onChange={onChange("surname")}
        />
      </label>
      <label>
        {copy.participantTypeLabel}
        <select value={form.sizeCategory} onChange={onChange("sizeCategory")}>
          <option value="senior">Senior</option>
          <option value="junior">Junior</option>
        </select>
      </label>
      <label>
        Height
        <input
          type="text"
          value={form.heightText}
          onChange={onChange("heightText")}
        />
      </label>
      <label>
        Handedness
        <select value={form.handedness} onChange={onChange("handedness")}>
          <option value="">Not recorded</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </label>
      <label>
        Eye dominance
        <select value={form.eyeDominance} onChange={onChange("eyeDominance")}>
          <option value="">Not recorded</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </label>
      <div className="beginners-course-checkbox-row">
        <label className="beginners-course-checkbox">
          <input
            type="checkbox"
            checked={form.initialEmailSent}
            onChange={onToggle("initialEmailSent")}
          />
          Initial email sent
        </label>
        <label className="beginners-course-checkbox">
          <input
            type="checkbox"
            checked={form.thirtyDayReminderSent}
            onChange={onToggle("thirtyDayReminderSent")}
          />
          30 day reminder
        </label>
        <label className="beginners-course-checkbox">
          <input
            type="checkbox"
            checked={form.courseFeePaid}
            onChange={onToggle("courseFeePaid")}
          />
          {copy.feePaidLabel}
        </label>
      </div>
    </div>
  );
}

const BEGINNERS_COPY = {
  courseType: "beginners",
  participantPlural: "beginners",
  participantSingular: "beginner",
  participantLabel: "Beginner",
  participantListTitle: "Beginners",
  participantTypeLabel: "Beginner type",
  feePaidLabel: "Course fee paid",
  pageDescription:
    "Submit beginners courses for approval, enrol beginners, assign a case to each beginner, and plan lesson coaches in one place.",
  submitTitle: "Submit beginners course",
  submitButton: "Submit course",
  itemLabel: "Beginners course",
  itemLowerLabel: "beginners course",
  coordinatorLabel: "Course coordinator",
  firstDateLabel: "First lesson date",
  countLabel: "Number of lessons",
  capacityLabel: "Beginner places",
  countMetaLabel: "Lessons",
  capacityMetaLabel: "Places",
  remainingMetaLabel: "Remaining",
  addParticipantTitle: "Add beginner",
  addParticipantButton: "Add beginner",
  emptyParticipantText: "No beginners have been added to this course yet.",
  planTitle: "Lesson coach plan",
  lessonColumn: "Lesson",
  assignCoachesTitle: "Assign coaches",
  assignCoachesButton: "Assign coaches",
  saveCoachesButton: "Save lesson coaches",
  cancelButtonLabel: "Cancel course",
  cancelledTitle: "Cancelled courses",
  hideCancelledLabel: "Hide cancelled courses",
  showCancelledLabel: "Show cancelled courses",
  noCancelledText: "No cancelled beginners courses yet.",
  rejectPrompt: "Add a short reason for rejecting this course.",
  cancelPrompt: "Add a short reason for cancelling this course.",
  equipmentUpdated: "Course equipment updated.",
  coachesUpdated: "Lesson coaches updated.",
  participantUpdated: "Beginner details updated.",
  editParticipantTitle: "Edit beginner",
  saveParticipantButton: "Save beginner",
  courseApproved: "Beginners course approved.",
  courseRejected: "Beginners course rejected.",
  courseCancelled: "Beginners course cancelled.",
  noPermission: "You do not have permission to manage beginners courses.",
  loading: "Loading beginners course setup...",
  queryKey: "beginners-courses-dashboard",
  eventName: "beginners-course-data-updated",
  createCourse: createBeginnersCourse,
  getDashboard: getBeginnersCoursesDashboard,
};

const HAVE_A_GO_COPY = {
  courseType: "have-a-go",
  participantPlural: "participants",
  participantSingular: "participant",
  participantLabel: "Participant",
  participantListTitle: "Participants",
  participantTypeLabel: "Participant type",
  feePaidLabel: "Session fee paid",
  pageDescription:
    "Submit Have a Go sessions for approval, enrol participants, assign equipment, and plan coaches in one place.",
  submitTitle: "Submit Have a Go session",
  submitButton: "Submit session",
  itemLabel: "Have a Go session",
  itemLowerLabel: "have a go session",
  coordinatorLabel: "Session coordinator",
  firstDateLabel: "First session date",
  countLabel: "Number of sessions",
  capacityLabel: "Participant places",
  countMetaLabel: "Sessions",
  capacityMetaLabel: "Places",
  remainingMetaLabel: "Remaining",
  addParticipantTitle: "Add participant",
  addParticipantButton: "Add participant",
  emptyParticipantText: "No participants have been added to this session yet.",
  planTitle: "Session coach plan",
  lessonColumn: "Session",
  assignCoachesTitle: "Assign coaches",
  assignCoachesButton: "Assign coaches",
  saveCoachesButton: "Save session coaches",
  cancelButtonLabel: "Cancel session",
  cancelledTitle: "Cancelled sessions",
  hideCancelledLabel: "Hide cancelled sessions",
  showCancelledLabel: "Show cancelled sessions",
  noCancelledText: "No cancelled Have a Go sessions yet.",
  rejectPrompt: "Add a short reason for rejecting this session.",
  cancelPrompt: "Add a short reason for cancelling this session.",
  equipmentUpdated: "Session equipment updated.",
  coachesUpdated: "Session coaches updated.",
  participantUpdated: "Participant details updated.",
  editParticipantTitle: "Edit participant",
  saveParticipantButton: "Save participant",
  courseApproved: "Have a Go session approved.",
  courseRejected: "Have a Go session rejected.",
  courseCancelled: "Have a Go session cancelled.",
  noPermission: "You do not have permission to manage Have a Go sessions.",
  loading: "Loading Have a Go session setup...",
  queryKey: "have-a-go-sessions-dashboard",
  eventName: "have-a-go-session-data-updated",
  createCourse: createHaveAGoSession,
  getDashboard: getHaveAGoSessionsDashboard,
};

export function BeginnersCoursesPage({ currentUserProfile, variant = "beginners" }) {
  const copy = variant === "have-a-go" ? HAVE_A_GO_COPY : BEGINNERS_COPY;
  const usesEquipmentAssignment = copy.courseType === "beginners";
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const queryClient = useQueryClient();
  const [courseForm, setCourseForm] = useState(EMPTY_COURSE_FORM);
  const [beginnerForms, setBeginnerForms] = useState<Record<number, typeof EMPTY_BEGINNER_FORM>>(
    {},
  );
  const [caseSelections, setCaseSelections] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [coachLesson, setCoachLesson] = useState<CourseLesson | null>(null);
  const [selectedCoachUsernames, setSelectedCoachUsernames] = useState<string[]>([]);
  const [editingBeginner, setEditingBeginner] = useState<CourseBeginner | null>(null);
  const [editBeginnerForm, setEditBeginnerForm] = useState(EMPTY_BEGINNER_FORM);
  const [showCancelledCourses, setShowCancelledCourses] = useState(false);
  const [localCancelledCourses, setLocalCancelledCourses] = useState<CancelledCourseSummary[]>(
    [],
  );

  const dashboardQuery = useQuery({
    queryKey: [copy.queryKey, actorUsername],
    queryFn: () =>
      copy.getDashboard(currentUserProfile) as Promise<
        { success: true } & DashboardPayload
      >,
    enabled: Boolean(actorUsername),
  });

  const dashboard = dashboardQuery.data;
  const courses = useMemo(() => dashboard?.courses ?? [], [dashboard?.courses]);
  const activeCourses = useMemo(
    () =>
      courses.filter(
        (course) =>
          !course.isCancelled &&
          course.approvalStatus !== "rejected" &&
          !hasCourseFinished(course) &&
          !localCancelledCourses.some((cancelledCourse) => cancelledCourse.id === course.id),
      ),
    [courses, localCancelledCourses],
  );
  const cancelledCourses = useMemo<CancelledCourseSummary[]>(
    () => {
      const backendCancelledCourses = courses
        .filter(
          (course) =>
            course.isCancelled ||
            course.approvalStatus === "rejected" ||
            hasCourseFinished(course),
        )
        .map((course) => ({
          id: course.id,
          firstLessonDate: course.firstLessonDate,
          coordinatorName: course.coordinatorName,
          archiveReason:
            course.cancellationReason ||
            course.rejectionReason ||
            `${copy.itemLabel} finished`,
        }));

      return [...backendCancelledCourses, ...localCancelledCourses].filter(
        (course, index, allCourses) =>
          allCourses.findIndex((entry) => entry.id === course.id) === index,
      );
    },
    [copy.itemLabel, courses, localCancelledCourses],
  );
  const permissions = dashboard?.permissions ?? {
    canManageBeginnersCourses: false,
    canApproveBeginnersCourses: false,
  };
  const coordinators = useMemo(() => dashboard?.coordinators ?? [], [dashboard?.coordinators]);
  const coaches = useMemo(() => dashboard?.coaches ?? [], [dashboard?.coaches]);
  const availableCases = useMemo(
    () => dashboard?.availableCases ?? [],
    [dashboard?.availableCases],
  );
  const defaultCoordinatorUsername = useMemo(
    () =>
      coordinators.some((coordinator) => coordinator.username === actorUsername)
        ? actorUsername
        : coordinators[0]?.username || "",
    [actorUsername, coordinators],
  );
  const selectedCoordinatorUsername =
    courseForm.coordinatorUsername || defaultCoordinatorUsername;

  const refreshDashboard = async () => {
    await queryClient.invalidateQueries({
      queryKey: [copy.queryKey, actorUsername],
    });
    window.dispatchEvent(new Event(copy.eventName));
  };

  const mutation = useMutation({
    mutationFn: (task: () => Promise<unknown>) => task(),
    onMutate: () => {
      setError("");
      setMessage("");
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message);
    },
  });

  const updateBeginnerForm = (courseId: number, field: string, value: string | boolean) => {
    setBeginnerForms((current) => ({
      ...current,
      [courseId]: {
        ...EMPTY_BEGINNER_FORM,
        ...current[courseId],
        [field]: value,
      },
    }));
  };

  const submitCourse = async (event) => {
    event.preventDefault();
    await mutation.mutateAsync(() =>
      copy.createCourse(currentUserProfile, {
        ...courseForm,
        coordinatorUsername: selectedCoordinatorUsername,
      }),
    );
    setMessage(`${copy.itemLabel} submitted for approval.`);
    setCourseForm((current) => ({
      ...EMPTY_COURSE_FORM,
      coordinatorUsername:
        current.coordinatorUsername || selectedCoordinatorUsername,
    }));
    await refreshDashboard();
  };

  const submitBeginner = async (courseId: number) => {
    const form = {
      ...EMPTY_BEGINNER_FORM,
      ...beginnerForms[courseId],
    };
    await mutation.mutateAsync(() => addBeginnerToCourse(currentUserProfile, courseId, form));
    setMessage(`${copy.participantLabel} added.`);
    setBeginnerForms((current) => ({
      ...current,
      [courseId]: EMPTY_BEGINNER_FORM,
    }));
    await refreshDashboard();
  };

  const saveCaseAssignment = async (beginner: CourseBeginner) => {
    await mutation.mutateAsync(() =>
      assignBeginnerCase(
        currentUserProfile,
        beginner.id,
        caseSelections[beginner.id] ??
          (beginner.assignedCaseId ? String(beginner.assignedCaseId) : null),
      ),
    );
    setMessage(copy.equipmentUpdated);
    window.dispatchEvent(new Event("equipment-data-updated"));
    await refreshDashboard();
  };

  const convertBeginnerToMember = async (beginner: CourseBeginner) => {
    await mutation.mutateAsync(() => convertBeginnerToMemberApi(currentUserProfile, beginner.id));
    setMessage(`${formatMemberDisplayName(beginner)} converted to a full member.`);
    window.dispatchEvent(new Event("profile-data-updated"));
    await refreshDashboard();
  };

  const cancelCourse = async (courseId: number) => {
    const course = courses.find((entry) => entry.id === courseId);
    const reason = window.prompt(
      copy.cancelPrompt,
    );

    if (!reason || !course) {
      return;
    }

    await mutation.mutateAsync(() =>
      cancelBeginnersCourse(currentUserProfile, courseId, reason, copy.courseType),
    );
    setLocalCancelledCourses((current) => [
      {
        id: course.id,
        firstLessonDate: course.firstLessonDate,
        coordinatorName: course.coordinatorName,
        archiveReason: reason,
      },
      ...current.filter((entry) => entry.id !== course.id),
    ]);
    setShowCancelledCourses(true);
    setMessage(copy.courseCancelled);
    await refreshDashboard();
  };

  const openCoachModal = (lesson: CourseLesson) => {
    setCoachLesson(lesson);
    setSelectedCoachUsernames(lesson.coaches.map((coach) => coach.username));
  };

  const saveLessonCoaches = async () => {
    if (!coachLesson) {
      return;
    }

    await mutation.mutateAsync(() =>
      assignLessonCoaches(currentUserProfile, coachLesson.id, selectedCoachUsernames),
    );
    setCoachLesson(null);
    setMessage(copy.coachesUpdated);
    await refreshDashboard();
  };

  const openBeginnerEdit = (beginner: CourseBeginner) => {
    setEditingBeginner(beginner);
    setEditBeginnerForm({
      firstName: beginner.firstName,
      surname: beginner.surname,
      sizeCategory: beginner.sizeCategory,
      heightText: beginner.heightText,
      handedness: beginner.handedness,
      eyeDominance: beginner.eyeDominance,
      initialEmailSent: beginner.initialEmailSent,
      thirtyDayReminderSent: beginner.thirtyDayReminderSent,
      courseFeePaid: beginner.courseFeePaid,
    });
  };

  const saveBeginnerEdit = async () => {
    if (!editingBeginner) {
      return;
    }

    await mutation.mutateAsync(() =>
      updateBeginnerParticipant(currentUserProfile, editingBeginner.id, editBeginnerForm),
    );
    setEditingBeginner(null);
    setMessage(copy.participantUpdated);
    await refreshDashboard();
  };

  if (!permissions.canManageBeginnersCourses && !permissions.canApproveBeginnersCourses) {
    return <p>{copy.noPermission}</p>;
  }

  return (
    <div className="beginners-course-page">
      <p>
        {copy.pageDescription}
      </p>

      <StatusMessagePanel
        error={error}
        loading={dashboardQuery.isLoading}
        loadingLabel={copy.loading}
        success={message}
      />

      {permissions.canManageBeginnersCourses ? (
        <section className="equipment-action-card beginners-course-panel">
          <h3>{copy.submitTitle}</h3>
          <form className="beginners-course-form" onSubmit={submitCourse}>
            <div className="beginners-course-form-grid">
              <label>
                {copy.coordinatorLabel}
                <select
                  value={selectedCoordinatorUsername}
                  onChange={(event) =>
                    setCourseForm((current) => ({
                      ...current,
                      coordinatorUsername: event.target.value,
                    }))
                  }
                >
                  {coordinators.map((coordinator) => (
                    <option key={coordinator.username} value={coordinator.username}>
                      {coordinator.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {copy.firstDateLabel}
                <input
                  type="date"
                  value={courseForm.firstLessonDate}
                  onChange={(event) =>
                    setCourseForm((current) => ({
                      ...current,
                      firstLessonDate: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Start time
                <input
                  type="time"
                  value={courseForm.startTime}
                  onChange={(event) =>
                    setCourseForm((current) => ({
                      ...current,
                      startTime: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                End time
                <input
                  type="time"
                  value={courseForm.endTime}
                  onChange={(event) =>
                    setCourseForm((current) => ({
                      ...current,
                      endTime: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                {copy.countLabel}
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={courseForm.lessonCount}
                  onChange={(event) =>
                    setCourseForm((current) => ({
                      ...current,
                      lessonCount: Number.parseInt(event.target.value, 10) || 1,
                    }))
                  }
                />
              </label>
              <label>
                {copy.capacityLabel}
                <input
                  type="number"
                  min={1}
                  max={48}
                  value={courseForm.beginnerCapacity}
                  onChange={(event) =>
                    setCourseForm((current) => ({
                      ...current,
                      beginnerCapacity: Number.parseInt(event.target.value, 10) || 1,
                    }))
                  }
                />
              </label>
            </div>
            <div className="beginners-course-actions">
              <Button type="submit">{copy.submitButton}</Button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="beginners-course-list">
        {activeCourses.map((course) => {
          const beginnerForm = {
            ...EMPTY_BEGINNER_FORM,
            ...beginnerForms[course.id],
          };
          const canCancelCourse =
            permissions.canApproveBeginnersCourses ||
            course.coordinatorUsername === actorUsername;

          return (
            <section key={course.id} className="equipment-action-card beginners-course-panel">
              <div className="beginners-course-header">
                <div>
                  <h3>
                    {copy.itemLabel} from {formatDate(course.firstLessonDate)}
                  </h3>
                  <p className="equipment-meta-copy">
                    Coordinator: {course.coordinatorName} | {copy.countMetaLabel}: {course.lessonCount} | {copy.capacityMetaLabel}:
                    {" "}
                    {course.beginnerCapacity} | {copy.remainingMetaLabel}: {course.placesRemaining}
                  </p>
                  <p className="equipment-meta-copy">
                    Submitted by {course.submittedByName} | Status: {course.approvalStatus}
                    {course.approvedByName ? ` | Approved by ${course.approvedByName}` : ""}
                  </p>
                  {course.rejectionReason ? (
                    <p className="profile-error">Rejected: {course.rejectionReason}</p>
                  ) : null}
                </div>
                {canCancelCourse ? (
                  <div className="beginners-course-actions">
                    <Button
                      variant="danger"
                      onClick={() => void cancelCourse(course.id)}
                    >
                      {copy.cancelButtonLabel}
                    </Button>
                  </div>
                ) : null}
              </div>

              {permissions.canManageBeginnersCourses && course.approvalStatus === "approved" ? (
                <section className="beginners-course-subpanel">
                  <h4>{copy.addParticipantTitle}</h4>
                  <BeginnerFormFields
                    copy={copy}
                    form={beginnerForm}
                    onChange={(field) => (event) =>
                      updateBeginnerForm(course.id, field, event.target.value)}
                    onToggle={(field) => (event) =>
                      updateBeginnerForm(course.id, field, event.target.checked)}
                  />
                  <div className="beginners-course-actions">
                    <Button onClick={() => void submitBeginner(course.id)}>
                      {copy.addParticipantButton}
                    </Button>
                  </div>
                </section>
              ) : null}

              <section className="beginners-course-subpanel">
                <h4>{copy.participantListTitle}</h4>
                <div className="equipment-inventory-table-wrap">
                  <table className="equipment-inventory-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Username</th>
                        <th>Password</th>
                        <th>Type</th>
                        <th>Initial Email</th>
                        <th>30 Day</th>
                        <th>Fee Paid</th>
                        {usesEquipmentAssignment ? (
                          <th className="beginners-course-case-heading">
                            Assigned Case
                          </th>
                        ) : null}
                        <th className="beginners-course-actions-heading">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {course.beginners.length > 0 ? (
                        course.beginners.map((beginner) => (
                          <tr key={beginner.id}>
                            <td>{formatMemberDisplayName(beginner)}</td>
                            <td>{formatMemberDisplayUsername(beginner)}</td>
                            <td>{beginner.password}</td>
                            <td>{beginner.sizeCategory === "junior" ? "Jr" : "Snr"}</td>
                            <td>{beginner.initialEmailSent ? "Yes" : "No"}</td>
                            <td>{beginner.thirtyDayReminderSent ? "Yes" : "No"}</td>
                            <td>{beginner.courseFeePaid ? "Yes" : "No"}</td>
                            {usesEquipmentAssignment ? (
                              <td className="beginners-course-case-cell">
                                <select
                                  value={
                                    caseSelections[beginner.id] ??
                                    (beginner.assignedCaseId
                                      ? String(beginner.assignedCaseId)
                                      : "")
                                  }
                                  onChange={(event) =>
                                    setCaseSelections((current) => ({
                                      ...current,
                                      [beginner.id]: event.target.value,
                                    }))
                                  }
                                >
                                  <option value="">No case assigned</option>
                                  {availableCases
                                    .filter(
                                      (caseItem) =>
                                        caseItem.reference &&
                                        caseItem.reference !== "Main Cupboard" &&
                                        (
                                          !caseItem.memberUsername ||
                                          caseItem.memberUsername === beginner.username ||
                                          String(caseItem.id) ===
                                            String(beginner.assignedCaseId ?? "")
                                        ),
                                    )
                                    .map((caseItem) => (
                                      <option key={caseItem.id} value={caseItem.id}>
                                        {caseItem.reference}
                                      </option>
                                    ))}
                                </select>
                              </td>
                            ) : null}
                            <td className="beginners-course-actions-cell">
                              <div className="beginners-course-row-actions">
                                {usesEquipmentAssignment
                                  ? (() => {
                                      const canConvertBeginner = hasCourseFinished(course);
                                      const convertButtonLabel = beginner.convertedToMember
                                        ? "Converted"
                                        : "Convert to member";
                                      const convertButtonTitle = beginner.convertedToMember
                                        ? `${formatMemberDisplayName(beginner)} is already a full member.`
                                        : canConvertBeginner
                                        ? `Convert ${formatMemberDisplayName(beginner)} to a full member.`
                                        : `This button becomes available once the ${copy.itemLowerLabel} has completed.`;

                                      return (
                                        <>
                                          <Button
                                            className="beginners-course-row-action-button"
                                            size="sm"
                                            onClick={() => void saveCaseAssignment(beginner)}
                                          >
                                            Save case
                                          </Button>
                                          <Button
                                            className="beginners-course-row-action-button beginners-course-row-action-button--convert"
                                            size="sm"
                                            variant="info"
                                            disabled={beginner.convertedToMember || !canConvertBeginner}
                                            title={convertButtonTitle}
                                            onClick={() => void convertBeginnerToMember(beginner)}
                                          >
                                            {convertButtonLabel}
                                          </Button>
                                        </>
                                      );
                                    })()
                                  : null}
                                <Button
                                  className="beginners-course-row-action-button beginners-course-row-action-button--edit"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => openBeginnerEdit(beginner)}
                                >
                                  Edit
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={usesEquipmentAssignment ? 9 : 8}>
                            {copy.emptyParticipantText}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="beginners-course-subpanel">
                <h4>Attendance Register</h4>
                <div className="equipment-inventory-table-wrap">
                  <table className="equipment-inventory-table beginners-course-attendance-table">
                    <thead>
                      <tr>
                        <th>{copy.participantLabel}</th>
                        {course.lessons.map((lesson) => (
                          <th key={lesson.id}>
                            {formatDate(lesson.date)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {course.beginners.length > 0 ? (
                        course.beginners.map((beginner) => (
                          <tr key={beginner.id}>
                            <td>{formatMemberDisplayName(beginner)}</td>
                            {course.lessons.map((lesson) => {
                              const attended = beginner.attendanceDates?.includes(
                                lesson.date,
                              );

                              return (
                                <td
                                  key={`${beginner.id}-${lesson.id}`}
                                  className="beginners-course-attendance-cell"
                                >
                                  {attended ? (
                                    <span
                                      className="beginners-course-attendance-check"
                                      aria-label="Attended"
                                    >
                                      {"\u2713"}
                                    </span>
                                  ) : (
                                    ""
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={course.lessons.length + 1}>
                            Add {copy.participantPlural} to start the attendance register.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="beginners-course-subpanel">
                <h4>{copy.planTitle}</h4>
                <div className="equipment-inventory-table-wrap">
                  <table className="equipment-inventory-table">
                    <thead>
                      <tr>
                        <th>{copy.lessonColumn}</th>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Coaches</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {course.lessons.map((lesson) => (
                        <tr key={lesson.id}>
                          <td>{lesson.lessonNumber}</td>
                          <td>{formatDate(lesson.date)}</td>
                          <td>
                            {formatClockTime(lesson.startTime)} to {formatClockTime(lesson.endTime)}
                          </td>
                          <td>
                            {lesson.coaches.length > 0
                              ? lesson.coaches.map((coach) => coach.fullName).join(", ")
                              : "No coaches assigned"}
                          </td>
                          <td>
                            {permissions.canManageBeginnersCourses ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => openCoachModal(lesson)}
                              >
                                {copy.assignCoachesButton}
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </section>
          );
        })}
      </div>

      <section className="equipment-action-card beginners-course-panel">
        <div className="beginners-course-cancelled-header">
          <h3>{copy.cancelledTitle} ({cancelledCourses.length})</h3>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowCancelledCourses((current) => !current)}
          >
            {showCancelledCourses ? copy.hideCancelledLabel : copy.showCancelledLabel}
          </Button>
        </div>
        {showCancelledCourses ? (
          cancelledCourses.length > 0 ? (
            <div className="beginners-course-cancelled-list">
              {cancelledCourses.map((course) => (
                <div
                  key={course.id}
                  className="beginners-course-cancelled-item"
                >
                  <strong>{formatDate(course.firstLessonDate)}</strong>
                  <span>Coordinator: {course.coordinatorName}</span>
                  <span>Reason: {course.archiveReason || "No reason recorded."}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="equipment-meta-copy">
              {copy.noCancelledText}
            </p>
          )
        ) : null}
      </section>

      <Modal
        open={Boolean(coachLesson)}
        onClose={() => setCoachLesson(null)}
        title={copy.assignCoachesTitle}
      >
        <div className="beginners-course-coach-modal">
          {coaches.map((coach) => (
            <label key={coach.username} className="beginners-course-checkbox">
              <input
                type="checkbox"
                checked={selectedCoachUsernames.includes(coach.username)}
                onChange={(event) =>
                  setSelectedCoachUsernames((current) =>
                    event.target.checked
                      ? [...current, coach.username]
                      : current.filter((value) => value !== coach.username),
                  )
                }
              />
              {coach.fullName}
            </label>
          ))}
          <div className="beginners-course-actions">
            <Button onClick={() => void saveLessonCoaches()}>{copy.saveCoachesButton}</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(editingBeginner)}
        onClose={() => setEditingBeginner(null)}
        title={copy.editParticipantTitle}
      >
        <div className="beginners-course-coach-modal">
          <BeginnerFormFields
            copy={copy}
            form={editBeginnerForm}
            onChange={(field) => (event) =>
              setEditBeginnerForm((current) => ({
                ...current,
                [field]: event.target.value,
              }))
            }
            onToggle={(field) => (event) =>
              setEditBeginnerForm((current) => ({
                ...current,
                [field]: event.target.checked,
              }))
            }
          />
          <div className="beginners-course-actions">
            <Button onClick={() => void saveBeginnerEdit()}>
              {copy.saveParticipantButton}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
