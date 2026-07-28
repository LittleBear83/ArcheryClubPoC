type CommitteeRole = {
  roleKey?: string;
  assignedMember?: {
    username?: string | null;
  } | null;
};

const COMMITTEE_APPROVAL_ROLE_KEYS = new Set(["chairman", "captain", "secretary"]);

export function isCommitteeApprovalRoleAssignee(
  actorUsername: string,
  committeeRoles: CommitteeRole[],
) {
  const normalizedUsername = actorUsername.trim().toLowerCase();

  if (!normalizedUsername) {
    return false;
  }

  return committeeRoles.some((role) => {
    const assignedUsername = role.assignedMember?.username?.trim().toLowerCase();

    return (
      COMMITTEE_APPROVAL_ROLE_KEYS.has(role.roleKey ?? "") &&
      Boolean(assignedUsername) &&
      assignedUsername === normalizedUsername
    );
  });
}

export function canViewCommitteeApprovalsCard({
  actorUsername,
  committeeRoles,
  userRole,
}: {
  actorUsername: string;
  committeeRoles: CommitteeRole[];
  userRole: string;
}) {
  if (userRole === "developer") {
    return true;
  }

  return isCommitteeApprovalRoleAssignee(actorUsername, committeeRoles);
}

export function hasCommitteeApprovalAccess({
  canManageBeginnersCourses,
  canManageHaveAGoSessions,
  canApproveBeginnersCourses,
  canApproveCoaching,
  canApproveEvents,
  canApproveHaveAGoSessions,
}: {
  canManageBeginnersCourses: boolean;
  canManageHaveAGoSessions: boolean;
  canApproveBeginnersCourses: boolean;
  canApproveCoaching: boolean;
  canApproveEvents: boolean;
  canApproveHaveAGoSessions: boolean;
}) {
  return (
    canManageBeginnersCourses ||
    canManageHaveAGoSessions ||
    canApproveBeginnersCourses ||
    canApproveCoaching ||
    canApproveEvents ||
    canApproveHaveAGoSessions
  );
}
