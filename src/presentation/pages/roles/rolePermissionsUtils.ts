const PERMISSION_GROUP_ORDER = [
  "member-setup",
  "events-coaching",
  "equipment-committee",
  "system-admin",
] as const;

const PERMISSION_GROUP_METADATA = {
  "member-setup": {
    title: "Member administration",
    description:
      "Member records, member creation, profile structure, role assignment, and committee role administration.",
  },
  "events-coaching": {
    title: "Events/Tournaments and Coaching",
    description:
      "Create and approve events, coaching sessions, beginners courses, and tournament activity.",
  },
  "equipment-committee": {
    title: "Equipment",
    description: "Equipment lifecycle and equipment assignment management.",
  },
  "system-admin": {
    title: "System Administration",
    description: "Cross-system administration and permission governance.",
  },
};

type PermissionGroupKey = keyof typeof PERMISSION_GROUP_METADATA;

function getPermissionGroup(permissionKey: string): PermissionGroupKey {
  switch (permissionKey) {
    case "manage_members":
    case "manage_member_disciplines":
    case "sign_off_distances":
    case "manage_committee_roles":
      return "member-setup";
    case "manage_range_rules":
      return "system-admin";
    case "add_decommission_equipment":
    case "assign_equipment":
    case "return_equipment":
    case "update_equipment_storage":
      return "equipment-committee";
    case "add_events":
    case "approve_events":
    case "cancel_events":
    case "add_coaching_sessions":
    case "approve_coaching_sessions":
    case "manage_beginners_courses":
    case "approve_beginners_courses":
    case "reallocate_beginner_course_booking":
    case "manage_have_a_go_sessions":
    case "approve_have_a_go_sessions":
    case "manage_tournaments":
      return "events-coaching";
    case "manage_roles_permissions":
    case "delete_roles":
    case "manage_equipment_storage_locations":
    case "view_reports":
    case "send_email":
      return "system-admin";
    default:
      return "system-admin";
  }
}

export {
  getPermissionGroup,
  PERMISSION_GROUP_METADATA,
  PERMISSION_GROUP_ORDER,
};
