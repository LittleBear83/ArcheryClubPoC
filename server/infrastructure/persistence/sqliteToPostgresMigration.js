const orderedTableCopies = [
  {
    tableName: "permissions",
    columns: ["permission_key", "label", "description"],
  },
  {
    tableName: "roles",
    columns: ["role_key", "title", "is_system"],
  },
  {
    tableName: "role_permissions",
    columns: ["role_key", "permission_key"],
  },
  {
    tableName: "users",
    columns: [
      "id",
      "username",
      "first_name",
      "surname",
      "password",
      "rfid_tag",
      "active_member",
      "membership_fees_due",
      "coaching_volunteer",
    ],
  },
  {
    tableName: "user_types",
    columns: ["username", "user_type", "user_id"],
  },
  {
    tableName: "user_disciplines",
    columns: ["username", "discipline", "user_id"],
  },
  {
    tableName: "member_loan_bows",
    columns: [
      "username",
      "has_loan_bow",
      "date_loaned",
      "returned_date",
      "riser_number",
      "limbs_number",
      "arrow_count",
      "returned_riser",
      "returned_limbs",
      "returned_arrows",
      "quiver",
      "returned_quiver",
      "finger_tab",
      "returned_finger_tab",
      "string_item",
      "returned_string_item",
      "arm_guard",
      "returned_arm_guard",
      "chest_guard",
      "returned_chest_guard",
      "sight",
      "returned_sight",
      "long_rod",
      "returned_long_rod",
      "pressure_button",
      "returned_pressure_button",
      "user_id",
    ],
  },
  {
    tableName: "login_events",
    columns: ["id", "username", "login_method", "logged_in_date", "logged_in_time", "user_id"],
  },
  {
    tableName: "guest_login_events",
    columns: [
      "id",
      "first_name",
      "surname",
      "archery_gb_membership_number",
      "invited_by_username",
      "invited_by_name",
      "logged_in_date",
      "logged_in_time",
      "invited_by_user_id",
    ],
  },
  {
    tableName: "coaching_sessions",
    columns: [
      "id",
      "coach_username",
      "session_date",
      "start_time",
      "end_time",
      "available_slots",
      "topic",
      "summary",
      "venue",
      "approval_status",
      "rejection_reason",
      "approved_by_username",
      "approved_at_date",
      "approved_at_time",
      "created_at_date",
      "created_at_time",
      "coach_user_id",
      "approved_by_user_id",
    ],
  },
  {
    tableName: "coaching_session_bookings",
    columns: [
      "coaching_session_id",
      "member_username",
      "booked_at_date",
      "booked_at_time",
      "member_user_id",
    ],
  },
  {
    tableName: "club_events",
    columns: [
      "id",
      "event_date",
      "start_time",
      "end_time",
      "title",
      "details",
      "type",
      "venue",
      "submitted_by_username",
      "approval_status",
      "rejection_reason",
      "approved_by_username",
      "approved_at_date",
      "approved_at_time",
      "created_at_date",
      "created_at_time",
      "submitted_by_user_id",
      "approved_by_user_id",
    ],
  },
  {
    tableName: "event_bookings",
    columns: ["club_event_id", "member_username", "booked_at_date", "booked_at_time", "member_user_id"],
  },
  {
    tableName: "tournaments",
    columns: [
      "id",
      "name",
      "tournament_type",
      "registration_start_date",
      "registration_end_date",
      "score_submission_start_date",
      "score_submission_end_date",
      "created_by",
      "created_at_date",
      "created_at_time",
      "created_by_user_id",
    ],
  },
  {
    tableName: "tournament_registrations",
    columns: [
      "tournament_id",
      "member_username",
      "registered_at_date",
      "registered_at_time",
      "member_user_id",
    ],
  },
  {
    tableName: "tournament_scores",
    columns: [
      "tournament_id",
      "round_number",
      "member_username",
      "score",
      "submitted_at_date",
      "submitted_at_time",
      "member_user_id",
    ],
  },
  {
    tableName: "committee_roles",
    columns: [
      "id",
      "role_key",
      "title",
      "summary",
      "responsibilities",
      "personal_blurb",
      "photo_data_url",
      "display_order",
      "assigned_username",
      "assigned_user_id",
    ],
  },
  {
    tableName: "equipment_storage_locations",
    columns: ["label", "created_at_date", "created_at_time"],
  },
  {
    tableName: "equipment_items",
    columns: [
      "id",
      "equipment_type",
      "item_number",
      "size_category",
      "arrow_length",
      "arrow_quantity",
      "status",
      "location_type",
      "location_label",
      "location_case_id",
      "location_member_username",
      "added_by_username",
      "added_at_date",
      "added_at_time",
      "decommissioned_by_username",
      "decommissioned_at_date",
      "decommissioned_at_time",
      "decommission_reason",
      "last_assignment_by_username",
      "last_assignment_at_date",
      "last_assignment_at_time",
      "last_storage_updated_by_username",
      "last_storage_updated_at_date",
      "last_storage_updated_at_time",
      "location_member_user_id",
      "added_by_user_id",
      "decommissioned_by_user_id",
      "last_assignment_by_user_id",
      "last_storage_updated_by_user_id",
    ],
    sqliteOrderBy:
      "CASE WHEN equipment_type = 'case' THEN 0 ELSE 1 END ASC, id ASC",
  },
  {
    tableName: "equipment_loans",
    columns: [
      "id",
      "equipment_item_id",
      "member_username",
      "loaned_by_username",
      "loaned_at_date",
      "loaned_at_time",
      "loan_context_case_id",
      "returned_by_username",
      "returned_at_date",
      "returned_at_time",
      "return_location_type",
      "return_location_label",
      "return_case_id",
      "member_user_id",
      "loaned_by_user_id",
      "returned_by_user_id",
    ],
  },
  {
    tableName: "beginners_courses",
    columns: [
      "id",
      "course_type",
      "coordinator_username",
      "submitted_by_username",
      "first_lesson_date",
      "start_time",
      "end_time",
      "lesson_count",
      "beginner_capacity",
      "approval_status",
      "is_cancelled",
      "cancellation_reason",
      "cancelled_by_username",
      "cancelled_at_date",
      "cancelled_at_time",
      "rejection_reason",
      "approved_by_username",
      "approved_at_date",
      "approved_at_time",
      "created_at_date",
      "created_at_time",
      "coordinator_user_id",
      "submitted_by_user_id",
      "cancelled_by_user_id",
      "approved_by_user_id",
    ],
  },
  {
    tableName: "beginners_course_lessons",
    columns: ["id", "course_id", "lesson_number", "lesson_date", "start_time", "end_time"],
  },
  {
    tableName: "beginners_course_participants",
    columns: [
      "id",
      "course_id",
      "username",
      "first_name",
      "surname",
      "beginner_size_category",
      "height_text",
      "handedness",
      "eye_dominance",
      "initial_email_sent",
      "thirty_day_reminder_sent",
      "course_fee_paid",
      "converted_to_member",
      "assigned_case_id",
      "assigned_case_by_username",
      "assigned_case_at_date",
      "assigned_case_at_time",
      "created_by_username",
      "created_at_date",
      "created_at_time",
      "user_id",
      "assigned_case_by_user_id",
      "created_by_user_id",
    ],
  },
  {
    tableName: "beginners_course_lesson_coaches",
    columns: [
      "lesson_id",
      "coach_username",
      "assigned_by_username",
      "assigned_at_date",
      "assigned_at_time",
      "coach_user_id",
      "assigned_by_user_id",
    ],
  },
  {
    tableName: "member_distance_sign_offs",
    columns: [
      "username",
      "discipline",
      "distance_yards",
      "signed_off_by_username",
      "signed_off_at_date",
      "signed_off_at_time",
      "signed_off_by_user_id",
      "user_id",
    ],
  },
  {
    tableName: "audit_events",
    columns: [
      "id",
      "actor_username",
      "action",
      "target",
      "status_code",
      "ip_address",
      "user_agent",
      "metadata_json",
      "created_at_date",
      "created_at_time",
      "actor_user_id",
    ],
  },
];

const resetSequenceTables = [
  "users",
  "audit_events",
  "login_events",
  "guest_login_events",
  "coaching_sessions",
  "club_events",
  "tournaments",
  "committee_roles",
  "equipment_items",
  "equipment_loans",
  "beginners_courses",
  "beginners_course_lessons",
  "beginners_course_participants",
];

export function getOrderedTableCopies() {
  return orderedTableCopies.map((entry) => ({ ...entry, columns: [...entry.columns] }));
}

export function buildSqliteSelectSql({ columns, sqliteOrderBy, tableName }) {
  const quotedColumns = columns.map((column) => `"${column}"`).join(", ");
  const orderBy = sqliteOrderBy || "rowid ASC";

  return `SELECT ${quotedColumns} FROM "${tableName}" ORDER BY ${orderBy}`;
}

export function buildPostgresInsertSql({ columns, tableName }) {
  const quotedColumns = columns.map((column) => `"${column}"`).join(", ");
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");

  return `INSERT INTO "${tableName}" (${quotedColumns}) VALUES (${placeholders})`;
}

export function buildTruncateSql() {
  const tableNames = [...orderedTableCopies]
    .reverse()
    .map((entry) => `"${entry.tableName}"`)
    .join(", ");

  return `TRUNCATE ${tableNames} RESTART IDENTITY CASCADE`;
}

export function buildResetSequenceStatements() {
  return resetSequenceTables.map((tableName) => ({
    sql: `
      SELECT setval(
        pg_get_serial_sequence($1, 'id'),
        COALESCE((SELECT MAX(id) FROM "${tableName}"), 1),
        COALESCE((SELECT MAX(id) FROM "${tableName}") IS NOT NULL, false)
      )
    `,
    values: [tableName],
  }));
}

