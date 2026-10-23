const COURSE_PARTICIPANT_USER_TYPES = {
  beginners: "prospect",
  "have-a-go": "prospect",
  "taster-session": "prospect",
};

const COURSE_PARTICIPANT_PROGRAMME_TYPES = {
  beginners: "beginners",
  "have-a-go": "have-a-go",
  "taster-session": "taster-session",
};

export function normalizeCourseType(value) {
  if (value === "have-a-go" || value === "taster-session") return value;
  return "beginners";
}

export function getCourseParticipantMembershipStatus() {
  return "non-member";
}

export function getCourseParticipantProgrammeType(courseType) {
  return COURSE_PARTICIPANT_PROGRAMME_TYPES[normalizeCourseType(courseType)] ?? "none";
}

export function getCourseParticipantUserType(courseType) {
  return COURSE_PARTICIPANT_USER_TYPES[normalizeCourseType(courseType)] ?? "non-member";
}
