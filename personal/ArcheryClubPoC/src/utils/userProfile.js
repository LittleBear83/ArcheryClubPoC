const ROLE_PERMISSION_FALLBACKS = {
  guest: [],
  general: [],
  coach: ["add_coaching_sessions"],
  admin: [
    "manage_members",
    "manage_roles_permissions",
    "manage_committee_roles",
    "add_events",
    "approve_events",
    "cancel_events",
    "add_coaching_sessions",
    "approve_coaching_sessions",
    "add_decommission_equipment",
    "assign_equipment",
    "return_equipment",
    "update_equipment_storage",
    "manage_beginners_courses",
    "approve_beginners_courses",
    "manage_tournaments",
  ],
  developer: [
    "manage_members",
    "manage_roles_permissions",
    "manage_committee_roles",
    "add_events",
    "approve_events",
    "cancel_events",
    "add_coaching_sessions",
    "approve_coaching_sessions",
    "add_decommission_equipment",
    "assign_equipment",
    "return_equipment",
    "update_equipment_storage",
    "manage_beginners_courses",
    "approve_beginners_courses",
    "manage_tournaments",
  ],
};

function normalizePermissions(permissions, role) {
  if (Array.isArray(permissions)) {
    return [...new Set(permissions.filter((permission) => typeof permission === "string"))];
  }

  return ROLE_PERMISSION_FALLBACKS[role] ?? [];
}

export function normalizeUserProfile(profile) {
  if (!profile) {
    return null;
  }

  if (profile.personal && profile.membership && profile.auth) {
    return {
      id: profile.id,
      accountType: profile.accountType,
      auth: {
        username: profile.auth.username ?? null,
        rfidEnabled: Boolean(profile.auth.rfidEnabled),
      },
      personal: {
        firstName: profile.personal.firstName ?? "",
        surname: profile.personal.surname ?? "",
        fullName:
          profile.personal.fullName ??
          `${profile.personal.firstName ?? ""} ${profile.personal.surname ?? ""}`.trim(),
        archeryGbMembershipNumber:
          profile.personal.archeryGbMembershipNumber ?? null,
      },
      membership: {
        role: profile.membership.role ?? "guest",
        permissions: normalizePermissions(
          profile.membership.permissions,
          profile.membership.role ?? "guest",
        ),
        disciplines: Array.isArray(profile.membership.disciplines)
          ? profile.membership.disciplines
          : [],
      },
      meta: {
        activeMember: Boolean(profile.meta?.activeMember),
        membershipFeesDue: profile.meta?.membershipFeesDue ?? "",
        ...profile.meta,
      },
    };
  }

  const firstName = profile.firstName ?? "";
  const surname = profile.surname ?? "";
  const archeryGbMembershipNumber = profile.archeryGbMembershipNumber ?? null;
  const username = profile.username ?? null;
  const role = profile.userType ?? "guest";
  const accountType = username ? "member" : "guest";

  return {
    id: profile.id ?? username ?? `guest:${archeryGbMembershipNumber ?? `${firstName}-${surname}`}`,
    accountType,
    auth: {
      username,
      rfidEnabled: Boolean(profile.rfidEnabled),
    },
    personal: {
      firstName,
      surname,
      fullName: `${firstName} ${surname}`.trim(),
      archeryGbMembershipNumber,
    },
    membership: {
      role,
      permissions: normalizePermissions(
        profile.permissions ?? profile.membership?.permissions,
        role,
      ),
      disciplines: Array.isArray(profile.disciplines) ? profile.disciplines : [],
    },
    meta: {
      activeMember: Boolean(profile.activeMember ?? profile.meta?.activeMember),
      membershipFeesDue:
        profile.membershipFeesDue ?? profile.meta?.membershipFeesDue ?? "",
      ...profile.meta,
    },
  };
}

export function hasPermission(profile, permissionKey) {
  if (!profile || !permissionKey) {
    return false;
  }

  return normalizePermissions(profile.membership?.permissions, profile.membership?.role)
    .includes(permissionKey);
}

export function getUserProfileKey(profile) {
  if (!profile) {
    return null;
  }

  return (
    profile.id ??
    profile.auth?.username ??
    `guest:${profile.personal?.archeryGbMembershipNumber ?? `${profile.personal?.firstName}-${profile.personal?.surname}`}`
  );
}

export function isSameUserProfile(left, right) {
  if (!left || !right) {
    return false;
  }

  const leftUsername = left.auth?.username;
  const rightUsername = right.auth?.username;

  if (leftUsername && rightUsername) {
    return leftUsername === rightUsername;
  }

  return (
    left.personal?.firstName === right.personal?.firstName &&
    left.personal?.surname === right.personal?.surname &&
    left.personal?.archeryGbMembershipNumber ===
      right.personal?.archeryGbMembershipNumber
  );
}
