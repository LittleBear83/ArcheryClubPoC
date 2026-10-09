export function normalizeMembershipClassification(
  profile,
  changedField,
) {
  let membershipStatus = String(profile?.membershipStatus ?? "member")
    .trim()
    .toLowerCase();
  let programmeType = String(profile?.programmeType ?? "none")
    .trim()
    .toLowerCase();

  if (!membershipStatus) {
    membershipStatus = "member";
  }

  if (!programmeType) {
    programmeType = "none";
  }

  if (changedField === "membershipStatus") {
    if (["guest", "member", "associate-member", "parent", "volunteer"].includes(membershipStatus)) {
      programmeType = "none";
    }
  }

  if (changedField === "programmeType" && programmeType !== "none") {
    membershipStatus = "non-member";
  }

  if (programmeType !== "none" && ["member", "associate-member", "parent", "volunteer"].includes(membershipStatus)) {
    membershipStatus = "non-member";
  }

  if (membershipStatus === "guest" && programmeType !== "none") {
    programmeType = "none";
  }

  return {
    membershipStatus,
    programmeType,
  };
}
