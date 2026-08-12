function getRole(value) {
  return (
    value?.membership?.role ??
    value?.userType ??
    value?.role ??
    value?.user_type ??
    ""
  );
}

export function getMembershipStatus(value) {
  const explicitStatus =
    value?.membership?.status ??
    value?.membershipStatus ??
    value?.membership_status ??
    "";

  if (explicitStatus) {
    return String(explicitStatus).trim().toLowerCase();
  }

  const role = String(getRole(value)).trim().toLowerCase();

  if (role === "beginner" || role === "have-a-go") {
    return "non-member";
  }

  if (role === "guest") {
    return "guest";
  }

  return "member";
}

export function getProgrammeType(value) {
  const explicitProgrammeType =
    value?.membership?.programmeType ??
    value?.programmeType ??
    value?.programme_type ??
    "";

  if (explicitProgrammeType) {
    return String(explicitProgrammeType).trim().toLowerCase();
  }

  const role = String(getRole(value)).trim().toLowerCase();

  if (role === "beginner") {
    return "beginners";
  }

  if (role === "have-a-go") {
    return "have-a-go";
  }

  return "none";
}

export function isGuestUser(value) {
  return getMembershipStatus(value) === "guest";
}

export function isNonMemberUser(value) {
  return getMembershipStatus(value) === "non-member";
}

export function isProgrammeUser(value) {
  return getProgrammeType(value) !== "none";
}

export function isBeginnersProgrammeUser(value) {
  return getProgrammeType(value) === "beginners";
}

export function isHaveAGoProgrammeUser(value) {
  return getProgrammeType(value) === "have-a-go";
}

export function isTasterProgrammeUser(value) {
  return getProgrammeType(value) === "taster-session";
}
