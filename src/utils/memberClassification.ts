import { normalizeMembershipClassification as normalizeMembershipClassificationRules } from "../../shared/membershipClassificationRules.js";

export function normalizeMembershipClassification(
  profile: { membershipStatus?: string; programmeType?: string },
  changedField?: "membershipStatus" | "programmeType",
) {
  return normalizeMembershipClassificationRules(profile, changedField);
}

export function describeMembershipClassification(
  profile: { membershipStatus?: string; programmeType?: string },
) {
  const { membershipStatus, programmeType } =
    normalizeMembershipClassification(profile);

  if (membershipStatus === "guest") {
    return "Guest accounts are separate from programme participants and should not carry a programme type.";
  }

  if (programmeType === "beginners") {
    return "This person is treated as a non-member on the Beginners programme.";
  }

  if (programmeType === "have-a-go") {
    return "This person is treated as a non-member on a Have a Go session.";
  }

  if (programmeType === "taster-session") {
    return "This person is treated as a non-member on a Taster Session.";
  }

  if (membershipStatus === "non-member") {
    return "This person is marked as a non-member with basic portal access only.";
  }

  return "This person is treated as a standard club member.";
}
