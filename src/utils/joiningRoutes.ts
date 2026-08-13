export type JoiningRouteOption = {
  value: string;
  label: string;
  summary: string;
};

const JOINING_ROUTE_OPTIONS: JoiningRouteOption[] = [
  {
    value: "taster-to-beginners",
    label: "Taster Session to Beginners",
    summary:
      "Creates a non-member attendee on a Taster Session who can later move into a beginners course and then convert to a full member.",
  },
  {
    value: "beginners-to-member",
    label: "Beginners Course to Member",
    summary:
      "Creates a non-member attendee on a beginners course who can later convert to a full member once the course is complete.",
  },
  {
    value: "direct-full-member",
    label: "Member",
    summary:
      "Creates a standard club member joining directly without attending a course first.",
  },
  {
    value: "associated-member",
    label: "Associated Member",
    summary:
      "Creates a member who joins outside the course journey and is marked as an affiliate member.",
  },
];

export function getJoiningRouteOptions() {
  return JOINING_ROUTE_OPTIONS;
}

export function getJoiningRouteSummary(route: string) {
  return (
    JOINING_ROUTE_OPTIONS.find((option) => option.value === route)?.summary ??
    JOINING_ROUTE_OPTIONS[0].summary
  );
}

export function applyJoiningRoutePreset(route: string, profile: Record<string, unknown>) {
  const baseProfile = {
    ...profile,
    activeMember: true,
    affiliateMember: false,
    membershipStatus: "member",
    programmeType: "none",
    userType: "general",
  };

  switch (route) {
    case "taster-to-beginners":
      return {
        ...baseProfile,
        membershipStatus: "non-member",
        programmeType: "taster-session",
        userType: "non-member",
      };
    case "beginners-to-member":
      return {
        ...baseProfile,
        membershipStatus: "non-member",
        programmeType: "beginners",
        userType: "non-member",
      };
    case "associated-member":
      return {
        ...baseProfile,
        affiliateMember: true,
      };
    case "direct-full-member":
    default:
      return baseProfile;
  }
}
