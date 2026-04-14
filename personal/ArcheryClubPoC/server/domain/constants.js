import { serverRuntime } from "../config/runtime.js";

export const PERMISSIONS = {
  MANAGE_MEMBERS: "manage_members",
  MANAGE_ROLES_PERMISSIONS: "manage_roles_permissions",
  MANAGE_COMMITTEE_ROLES: "manage_committee_roles",
  ADD_EVENTS: "add_events",
  APPROVE_EVENTS: "approve_events",
  CANCEL_EVENTS: "cancel_events",
  ADD_COACHING_SESSIONS: "add_coaching_sessions",
  APPROVE_COACHING_SESSIONS: "approve_coaching_sessions",
  ADD_DECOMMISSION_EQUIPMENT: "add_decommission_equipment",
  ASSIGN_EQUIPMENT: "assign_equipment",
  RETURN_EQUIPMENT: "return_equipment",
  UPDATE_EQUIPMENT_STORAGE: "update_equipment_storage",
  MANAGE_BEGINNERS_COURSES: "manage_beginners_courses",
  APPROVE_BEGINNERS_COURSES: "approve_beginners_courses",
  MANAGE_TOURNAMENTS: "manage_tournaments",
};

export const DEACTIVATED_RFID_SUFFIX = "-deactivated";
export const RFID_READER_NAMES = serverRuntime.rfidReaderNames;
export const PERMISSION_DEFINITIONS = [
  {
    key: PERMISSIONS.MANAGE_MEMBERS,
    label: "Manage Members",
    description: "Create and update member profiles.",
  },
  {
    key: PERMISSIONS.MANAGE_ROLES_PERMISSIONS,
    label: "Manage Roles And Permissions",
    description: "Create roles and assign permission sets.",
  },
  {
    key: PERMISSIONS.MANAGE_COMMITTEE_ROLES,
    label: "Manage Committee Roles",
    description: "Assign members to committee positions.",
  },
  {
    key: PERMISSIONS.ADD_EVENTS,
    label: "Add Events",
    description: "Create events and competitions.",
  },
  {
    key: PERMISSIONS.APPROVE_EVENTS,
    label: "Approve Events",
    description: "Approve submitted events and competitions.",
  },
  {
    key: PERMISSIONS.CANCEL_EVENTS,
    label: "Cancel Events",
    description: "Cancel published or pending events.",
  },
  {
    key: PERMISSIONS.ADD_COACHING_SESSIONS,
    label: "Add Coaching Sessions",
    description: "Create and cancel coaching sessions.",
  },
  {
    key: PERMISSIONS.APPROVE_COACHING_SESSIONS,
    label: "Approve Coaching Sessions",
    description: "Approve submitted coaching sessions.",
  },
  {
    key: PERMISSIONS.ADD_DECOMMISSION_EQUIPMENT,
    label: "Add And Decommission Equipment",
    description: "Register new equipment and retire equipment from service.",
  },
  {
    key: PERMISSIONS.ASSIGN_EQUIPMENT,
    label: "Assign Equipment",
    description: "Assign equipment to cases or issue it to members.",
  },
  {
    key: PERMISSIONS.RETURN_EQUIPMENT,
    label: "Return Equipment",
    description: "Book loaned equipment back in from members.",
  },
  {
    key: PERMISSIONS.UPDATE_EQUIPMENT_STORAGE,
    label: "Update Storage Location",
    description: "Update cupboard or case storage for equipment.",
  },
  {
    key: PERMISSIONS.MANAGE_BEGINNERS_COURSES,
    label: "Manage Beginners Courses",
    description: "Submit beginners courses, book beginners, and assign course coaches and equipment.",
  },
  {
    key: PERMISSIONS.APPROVE_BEGINNERS_COURSES,
    label: "Approve Beginners Courses",
    description: "Approve or reject submitted beginners courses.",
  },
  {
    key: PERMISSIONS.MANAGE_TOURNAMENTS,
    label: "Manage Tournaments",
    description: "Create, amend, and delete tournaments.",
  },
];

export const CURRENT_PERMISSION_KEYS = PERMISSION_DEFINITIONS.map(
  (permission) => permission.key,
);
export const CURRENT_PERMISSION_KEY_SET = new Set(CURRENT_PERMISSION_KEYS);
export const CURRENT_PERMISSION_SQL_PLACEHOLDERS = CURRENT_PERMISSION_KEYS
  .map(() => "?")
  .join(", ");

export const SYSTEM_ROLE_DEFINITIONS = [
  {
    roleKey: "general",
    title: "General",
    permissions: [],
  },
  {
    roleKey: "admin",
    title: "Admin",
    permissions: PERMISSION_DEFINITIONS.map((permission) => permission.key),
  },
  {
    roleKey: "developer",
    title: "Developer",
    permissions: PERMISSION_DEFINITIONS.map((permission) => permission.key),
  },
  {
    roleKey: "coach",
    title: "Coach",
    permissions: [PERMISSIONS.ADD_COACHING_SESSIONS],
  },
  {
    roleKey: "beginner",
    title: "Beginner",
    permissions: [],
  },
];

export const ALLOWED_DISCIPLINES = [
  "Long Bow",
  "Flat Bow",
  "Bare Bow",
  "Recurve Bow",
  "Compound Bow",
];

export const DEFAULT_LOAN_ARROW_COUNT = 6;
export const DEFAULT_EVENT_DURATION_MINUTES = 60;
export const DEFAULT_EQUIPMENT_CUPBOARD_LABEL = "Main Cupboard";

export const EQUIPMENT_TYPES = {
  CASE: "case",
  RISER: "riser",
  LIMB: "limb",
  QUIVER: "quiver",
  SIGHT: "sight",
  LONG_ROD: "long_rod",
  ARM_GUARD: "arm_guard",
  CHEST_GUARD: "chest_guard",
  FINGER_TAB: "finger_tab",
  ARROWS: "arrows",
};

export const EQUIPMENT_TYPE_LABELS = {
  [EQUIPMENT_TYPES.CASE]: "Case",
  [EQUIPMENT_TYPES.RISER]: "Riser",
  [EQUIPMENT_TYPES.LIMB]: "Limb Pair",
  [EQUIPMENT_TYPES.QUIVER]: "Quiver",
  [EQUIPMENT_TYPES.SIGHT]: "Sight",
  [EQUIPMENT_TYPES.LONG_ROD]: "Long Rod",
  [EQUIPMENT_TYPES.ARM_GUARD]: "Arm Guard",
  [EQUIPMENT_TYPES.CHEST_GUARD]: "Chest Guard",
  [EQUIPMENT_TYPES.FINGER_TAB]: "Finger Tab",
  [EQUIPMENT_TYPES.ARROWS]: "Arrows",
};

export const EQUIPMENT_TYPE_OPTIONS = Object.values(EQUIPMENT_TYPES);
export const EQUIPMENT_SIZE_CATEGORIES = ["standard", "junior"];

export const EQUIPMENT_LOCATION_TYPES = {
  CUPBOARD: "cupboard",
  CASE: "case",
  MEMBER: "member",
};

export const EQUIPMENT_CASE_CAPACITY = {
  [EQUIPMENT_TYPES.RISER]: 1,
  [EQUIPMENT_TYPES.LIMB]: 1,
  [EQUIPMENT_TYPES.QUIVER]: 1,
  [EQUIPMENT_TYPES.SIGHT]: 1,
  [EQUIPMENT_TYPES.LONG_ROD]: 1,
  [EQUIPMENT_TYPES.ARM_GUARD]: 1,
  [EQUIPMENT_TYPES.CHEST_GUARD]: 1,
  [EQUIPMENT_TYPES.FINGER_TAB]: 1,
  [EQUIPMENT_TYPES.ARROWS]: 12,
};

export const EQUIPMENT_NUMBER_REQUIRED_TYPES = new Set([
  EQUIPMENT_TYPES.CASE,
  EQUIPMENT_TYPES.RISER,
  EQUIPMENT_TYPES.LIMB,
  EQUIPMENT_TYPES.QUIVER,
  EQUIPMENT_TYPES.SIGHT,
  EQUIPMENT_TYPES.LONG_ROD,
]);

export const TOURNAMENT_TYPE_OPTIONS = [
  { value: "portsmouth", label: "Portsmouth" },
  { value: "wa720", label: "WA 720" },
  { value: "head-to-head", label: "Head-to-head Knockout" },
];

export const COMMITTEE_ROLE_SEED = [
  {
    roleKey: "chairman",
    title: "Chairman",
    summary:
      "Leads the committee, chairs meetings, and sets the club direction.",
    displayOrder: 1,
  },
  {
    roleKey: "captain",
    title: "Captain",
    summary:
      "Leads shooting activities, represents members on the shooting line, and supports club standards.",
    displayOrder: 2,
  },
  {
    roleKey: "vice-captain",
    title: "Vice Captain",
    summary:
      "Supports the captain and steps in when the captain is unavailable.",
    displayOrder: 3,
  },
  {
    roleKey: "secretary",
    title: "Secretary",
    summary:
      "Manages committee records, meeting notes, and club correspondence.",
    displayOrder: 4,
  },
  {
    roleKey: "treasurer",
    title: "Treasurer",
    summary:
      "Oversees finances, budgets, fee tracking, and financial reporting.",
    displayOrder: 5,
  },
  {
    roleKey: "membership-secretary",
    title: "Membership Secretary",
    summary:
      "Looks after member records, renewals, and new member administration.",
    displayOrder: 6,
  },
  {
    roleKey: "records-officer",
    title: "Records Officer",
    summary:
      "Maintains club records, scores, classifications, and achievement history.",
    displayOrder: 7,
  },
  {
    roleKey: "tournament-officer",
    title: "Tournament Officer",
    summary:
      "Coordinates tournaments, entries, fixtures, and competition logistics.",
    displayOrder: 8,
  },
  {
    roleKey: "safeguarding-officer",
    title: "Safeguarding Officer",
    summary:
      "Supports welfare, safeguarding processes, and member wellbeing matters.",
    displayOrder: 9,
  },
  {
    roleKey: "equipment-officer",
    title: "Equipment Officer",
    summary:
      "Oversees club equipment, maintenance, and issue or return processes.",
    displayOrder: 10,
  },
  {
    roleKey: "coaching-representative",
    title: "Coaching Representative",
    summary:
      "Represents coaching activity, development pathways, and training needs.",
    displayOrder: 11,
  },
  {
    roleKey: "ordinary-committee-member",
    title: "Ordinary Committee Member",
    summary:
      "Supports committee decisions and contributes to club governance tasks.",
    displayOrder: 12,
  },
  {
    roleKey: "associate-member",
    title: "Associate Member",
    summary:
      "Attends in a supporting capacity and contributes where invited by the committee.",
    displayOrder: 13,
  },
];
