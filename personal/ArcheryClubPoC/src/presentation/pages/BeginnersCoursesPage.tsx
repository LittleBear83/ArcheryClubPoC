import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import { fetchApi } from "../../lib/api";
import { formatDate, formatClockTime } from "../../utils/dateTime";

function buildHeaders(currentUserProfile) {
  return {
    "Content-Type": "application/json",
    "x-actor-username": currentUserProfile?.auth?.username ?? "",
  };
}

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

function BeginnerFormFields({ form, onChange, onToggle }) {
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
        Beginner type
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
          Course fee paid
        </label>
      </div>
    </div>
  );
}

export function BeginnersCoursesPage({ currentUserProfile }) {
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
    queryKey: ["beginners-courses-dashboard", actorUsername],
    queryFn: () =>
      fetchApi<{ success: true } & DashboardPayload>("/api/beginners-courses/dashboard", {
        headers: buildHeaders(currentUserProfile),
        cache: "no-store",
      }),
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
            "Course finished",
        }));

      return [...backendCancelledCourses, ...localCancelledCourses].filter(
        (course, index, allCourses) =>
          allCourses.findIndex((entry) => entry.id === course.id) === index,
      );
    },
    [courses, localCancelledCourses],
  );
  const permissions = dashboard?.permissions ?? {
    canManageBeginnersCourses: false,
    canApproveBeginnersCourses: false,
  };
  const coordinators = dashboard?.coordinators ?? [];
  const coaches = dashboard?.coaches ?? [];
  const availableCases = dashboard?.availableCases ?? [];

  useEffect(() => {
    if (!courseForm.coordinatorUsername && coordinators.length > 0) {
      setCourseForm((current) => ({
        ...current,
        coordinatorUsername: coordinators[0].username,
      }));
    }
  }, [coordinators, courseForm.coordinatorUsername]);

  useEffect(() => {
    const nextSelections: Record<number, string> = {};

    for (const course of courses) {
      for (const beginner of course.beginners) {
        nextSelections[beginner.id] = beginner.assignedCaseId
          ? String(beginner.assignedCaseId)
          : "";
      }
    }

    setCaseSelections(nextSelections);
  }, [courses]);

  const refreshDashboard = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["beginners-courses-dashboard", actorUsername],
    });
    window.dispatchEvent(new Event("beginners-course-data-updated"));
  };

  const mutation = useMutation({
    mutationFn: async ({
      url,
      method,
      body,
    }: {
      url: string;
      method: string;
      body?: unknown;
    }) =>
      fetchApi(url, {
        method,
        headers: buildHeaders(currentUserProfile),
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      }),
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
    await mutation.mutateAsync({
      url: "/api/beginners-courses",
      method: "POST",
      body: courseForm,
    });
    setMessage("Beginners course submitted for approval.");
    setCourseForm((current) => ({
      ...EMPTY_COURSE_FORM,
      coordinatorUsername: current.coordinatorUsername,
    }));
    await refreshDashboard();
  };

  const submitBeginner = async (courseId: number) => {
    const form = {
      ...EMPTY_BEGINNER_FORM,
      ...beginnerForms[courseId],
    };
    await mutation.mutateAsync({
      url: `/api/beginners-courses/${courseId}/beginners`,
      method: "POST",
      body: form,
    });
    setMessage("Beginner added to the course.");
    setBeginnerForms((current) => ({
      ...current,
      [courseId]: EMPTY_BEGINNER_FORM,
    }));
    await refreshDashboard();
  };

  const saveCaseAssignment = async (beginnerId: number) => {
    await mutation.mutateAsync({
      url: `/api/beginners-course-participants/${beginnerId}/assign-case`,
      method: "POST",
      body: { caseId: caseSelections[beginnerId] || null },
    });
    setMessage("Course equipment updated.");
    window.dispatchEvent(new Event("equipment-data-updated"));
    await refreshDashboard();
  };

  const approveCourse = async (courseId: number) => {
    await mutation.mutateAsync({
      url: `/api/beginners-courses/${courseId}/approve`,
      method: "POST",
    });
    setMessage("Beginners course approved.");
    await refreshDashboard();
  };

  const rejectCourse = async (courseId: number) => {
    const reason = window.prompt("Add a short reason for rejecting this course.");

    if (!reason) {
      return;
    }

    await mutation.mutateAsync({
      url: `/api/beginners-courses/${courseId}/reject`,
      method: "POST",
      body: { reason },
    });
    setMessage("Beginners course rejected.");
    await refreshDashboard();
  };

  const cancelCourse = async (courseId: number) => {
    const course = courses.find((entry) => entry.id === courseId);
    const reason = window.prompt(
      "Add a short reason for cancelling this course.",
    );

    if (!reason || !course) {
      return;
    }

    await mutation.mutateAsync({
      url: `/api/beginners-courses/${courseId}`,
      method: "DELETE",
      body: { reason },
    });
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
    setMessage("Beginners course cancelled.");
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

    await mutation.mutateAsync({
      url: `/api/beginners-course-lessons/${coachLesson.id}/coaches`,
      method: "POST",
      body: { coachUsernames: selectedCoachUsernames },
    });
    setCoachLesson(null);
    setMessage("Lesson coaches updated.");
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

    await mutation.mutateAsync({
      url: `/api/beginners-course-participants/${editingBeginner.id}`,
      method: "PUT",
      body: editBeginnerForm,
    });
    setEditingBeginner(null);
    setMessage("Beginner details updated.");
    await refreshDashboard();
  };

  if (!permissions.canManageBeginnersCourses && !permissions.canApproveBeginnersCourses) {
    return <p>You do not have permission to manage beginners courses.</p>;
  }

  return (
    <div className="beginners-course-page">
      <p>
        Submit beginners courses for approval, enrol beginners, assign a case to each
        beginner, and plan lesson coaches in one place.
      </p>

      <StatusMessagePanel
        error={error}
        loading={dashboardQuery.isLoading}
        loadingLabel="Loading beginners course setup..."
        success={message}
      />

      {permissions.canManageBeginnersCourses ? (
        <section className="equipment-action-card beginners-course-panel">
          <h3>Submit beginners course</h3>
          <form className="beginners-course-form" onSubmit={submitCourse}>
            <div className="beginners-course-form-grid">
              <label>
                Course coordinator
                <select
                  value={courseForm.coordinatorUsername}
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
                First lesson date
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
                Number of lessons
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
                Beginner places
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
              <Button type="submit">Submit course</Button>
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
                    Beginners course from {formatDate(course.firstLessonDate)}
                  </h3>
                  <p className="equipment-meta-copy">
                    Coordinator: {course.coordinatorName} | Lessons: {course.lessonCount} | Places:
                    {" "}
                    {course.beginnerCapacity} | Remaining: {course.placesRemaining}
                  </p>
                  <p className="equipment-meta-copy">
                    Submitted by {course.submittedByName} | Status: {course.approvalStatus}
                    {course.approvedByName ? ` | Approved by ${course.approvedByName}` : ""}
                  </p>
                  {course.rejectionReason ? (
                    <p className="profile-error">Rejected: {course.rejectionReason}</p>
                  ) : null}
                </div>
                {permissions.canApproveBeginnersCourses && course.approvalStatus === "pending" ? (
                  <div className="beginners-course-actions">
                    <Button onClick={() => void approveCourse(course.id)}>Approve</Button>
                    <Button
                      variant="danger"
                      onClick={() => void rejectCourse(course.id)}
                    >
                      Reject
                    </Button>
                    {canCancelCourse ? (
                      <Button
                        variant="danger"
                        onClick={() => void cancelCourse(course.id)}
                      >
                        Cancel course
                      </Button>
                    ) : null}
                  </div>
                ) : canCancelCourse ? (
                  <div className="beginners-course-actions">
                    <Button
                      variant="danger"
                      onClick={() => void cancelCourse(course.id)}
                    >
                      Cancel course
                    </Button>
                  </div>
                ) : null}
              </div>

              {permissions.canManageBeginnersCourses && course.approvalStatus === "approved" ? (
                <section className="beginners-course-subpanel">
                  <h4>Add beginner</h4>
                  <BeginnerFormFields
                    form={beginnerForm}
                    onChange={(field) => (event) =>
                      updateBeginnerForm(course.id, field, event.target.value)}
                    onToggle={(field) => (event) =>
                      updateBeginnerForm(course.id, field, event.target.checked)}
                  />
                  <div className="beginners-course-actions">
                    <Button onClick={() => void submitBeginner(course.id)}>Add beginner</Button>
                  </div>
                </section>
              ) : null}

              <section className="beginners-course-subpanel">
                <h4>Beginners</h4>
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
                        <th>Assigned Case</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {course.beginners.length > 0 ? (
                        course.beginners.map((beginner) => (
                          <tr key={beginner.id}>
                            <td>{beginner.fullName}</td>
                            <td>{beginner.username}</td>
                            <td>{beginner.password}</td>
                            <td>{beginner.sizeCategory === "junior" ? "Jr" : "Snr"}</td>
                            <td>{beginner.initialEmailSent ? "Yes" : "No"}</td>
                            <td>{beginner.thirtyDayReminderSent ? "Yes" : "No"}</td>
                            <td>{beginner.courseFeePaid ? "Yes" : "No"}</td>
                            <td>
                              <select
                                value={caseSelections[beginner.id] ?? ""}
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
                            <td className="beginners-course-row-actions">
                              <Button
                                size="sm"
                                onClick={() => void saveCaseAssignment(beginner.id)}
                              >
                                Save case
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => openBeginnerEdit(beginner)}
                              >
                                Edit
                              </Button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={9}>No beginners have been added to this course yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="beginners-course-subpanel">
                <h4>Lesson coach plan</h4>
                <div className="equipment-inventory-table-wrap">
                  <table className="equipment-inventory-table">
                    <thead>
                      <tr>
                        <th>Lesson</th>
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
                                Assign coaches
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
          <h3>Cancelled courses ({cancelledCourses.length})</h3>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowCancelledCourses((current) => !current)}
          >
            {showCancelledCourses ? "Hide cancelled courses" : "Show cancelled courses"}
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
              No cancelled beginners courses yet.
            </p>
          )
        ) : null}
      </section>

      <Modal
        open={Boolean(coachLesson)}
        onClose={() => setCoachLesson(null)}
        title="Assign coaches"
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
            <Button onClick={() => void saveLessonCoaches()}>Save lesson coaches</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(editingBeginner)}
        onClose={() => setEditingBeginner(null)}
        title="Edit beginner"
      >
        <div className="beginners-course-coach-modal">
          <BeginnerFormFields
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
            <Button onClick={() => void saveBeginnerEdit()}>Save beginner</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
