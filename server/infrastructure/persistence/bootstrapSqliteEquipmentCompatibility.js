export function bootstrapSqliteEquipmentCompatibility({ db }) {
  const equipmentItemsTable = db
    .prepare(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'equipment_items'`,
    )
    .get();

  if (!equipmentItemsTable?.sql?.includes("'quiver'")) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      ALTER TABLE equipment_items RENAME TO equipment_items_old;
      CREATE TABLE equipment_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        equipment_type TEXT NOT NULL CHECK (
          equipment_type IN (
            'case',
            'riser',
            'limb',
            'quiver',
            'sight',
            'long_rod',
            'arm_guard',
            'chest_guard',
            'finger_tab',
            'arrows'
          )
        ),
        item_number TEXT,
        size_category TEXT NOT NULL DEFAULT 'standard' CHECK (
          size_category IN ('standard', 'junior')
        ),
        arrow_length INTEGER,
        arrow_quantity INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active' CHECK (
          status IN ('active', 'decommissioned')
        ),
        location_type TEXT NOT NULL DEFAULT 'cupboard' CHECK (
          location_type IN ('cupboard', 'case', 'member')
        ),
        location_label TEXT,
        location_case_id INTEGER,
        location_member_username TEXT,
        added_by_username TEXT NOT NULL,
        added_at_date TEXT NOT NULL,
        added_at_time TEXT NOT NULL,
        decommissioned_by_username TEXT,
        decommissioned_at_date TEXT,
        decommissioned_at_time TEXT,
        decommission_reason TEXT,
        last_assignment_by_username TEXT,
        last_assignment_at_date TEXT,
        last_assignment_at_time TEXT,
        last_storage_updated_by_username TEXT,
        last_storage_updated_at_date TEXT,
        last_storage_updated_at_time TEXT,
        FOREIGN KEY (location_case_id) REFERENCES equipment_items(id),
        FOREIGN KEY (location_member_username) REFERENCES users(username),
        FOREIGN KEY (added_by_username) REFERENCES users(username),
        FOREIGN KEY (decommissioned_by_username) REFERENCES users(username),
        FOREIGN KEY (last_assignment_by_username) REFERENCES users(username),
        FOREIGN KEY (last_storage_updated_by_username) REFERENCES users(username)
      );
      INSERT INTO equipment_items (
        id,
        equipment_type,
        item_number,
        size_category,
        arrow_length,
        arrow_quantity,
        status,
        location_type,
        location_label,
        location_case_id,
        location_member_username,
        added_by_username,
        added_at_date,
        added_at_time,
        decommissioned_by_username,
        decommissioned_at_date,
        decommissioned_at_time,
        decommission_reason,
        last_assignment_by_username,
        last_assignment_at_date,
        last_assignment_at_time,
        last_storage_updated_by_username,
        last_storage_updated_at_date,
        last_storage_updated_at_time
      )
      SELECT
        id,
        equipment_type,
        item_number,
        size_category,
        arrow_length,
        arrow_quantity,
        status,
        location_type,
        location_label,
        location_case_id,
        location_member_username,
        added_by_username,
        added_at_date,
        added_at_time,
        decommissioned_by_username,
        decommissioned_at_date,
        decommissioned_at_time,
        decommission_reason,
        last_assignment_by_username,
        last_assignment_at_date,
        last_assignment_at_time,
        last_storage_updated_by_username,
        last_storage_updated_at_date,
        last_storage_updated_at_time
      FROM equipment_items_old;
      DROP TABLE equipment_items_old;
      PRAGMA foreign_keys = ON;
    `);
  }

  const equipmentLoansTable = db
    .prepare(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'equipment_loans'`,
    )
    .get();

  if (equipmentLoansTable?.sql?.includes("equipment_items_old")) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      ALTER TABLE equipment_loans RENAME TO equipment_loans_old;
      CREATE TABLE equipment_loans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        equipment_item_id INTEGER NOT NULL,
        member_username TEXT NOT NULL,
        loaned_by_username TEXT NOT NULL,
        loaned_at_date TEXT NOT NULL,
        loaned_at_time TEXT NOT NULL,
        loan_context_case_id INTEGER,
        returned_by_username TEXT,
        returned_at_date TEXT,
        returned_at_time TEXT,
        return_location_type TEXT CHECK (
          return_location_type IN ('cupboard', 'case')
        ),
        return_location_label TEXT,
        return_case_id INTEGER,
        FOREIGN KEY (equipment_item_id) REFERENCES equipment_items(id),
        FOREIGN KEY (member_username) REFERENCES users(username),
        FOREIGN KEY (loaned_by_username) REFERENCES users(username),
        FOREIGN KEY (loan_context_case_id) REFERENCES equipment_items(id),
        FOREIGN KEY (returned_by_username) REFERENCES users(username),
        FOREIGN KEY (return_case_id) REFERENCES equipment_items(id)
      );
      INSERT INTO equipment_loans (
        id,
        equipment_item_id,
        member_username,
        loaned_by_username,
        loaned_at_date,
        loaned_at_time,
        loan_context_case_id,
        returned_by_username,
        returned_at_date,
        returned_at_time,
        return_location_type,
        return_location_label,
        return_case_id
      )
      SELECT
        id,
        equipment_item_id,
        member_username,
        loaned_by_username,
        loaned_at_date,
        loaned_at_time,
        loan_context_case_id,
        returned_by_username,
        returned_at_date,
        returned_at_time,
        return_location_type,
        return_location_label,
        return_case_id
      FROM equipment_loans_old;
      DROP TABLE equipment_loans_old;
      PRAGMA foreign_keys = ON;
    `);
  }

  const beginnersCourseParticipantsTable = db
    .prepare(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'beginners_course_participants'`,
    )
    .get();

  if (beginnersCourseParticipantsTable?.sql?.includes("equipment_items_old")) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      ALTER TABLE beginners_course_participants RENAME TO beginners_course_participants_old;
      CREATE TABLE beginners_course_participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL,
        username TEXT NOT NULL UNIQUE,
        first_name TEXT NOT NULL,
        surname TEXT NOT NULL,
        beginner_size_category TEXT NOT NULL CHECK (
          beginner_size_category IN ('senior', 'junior')
        ),
        height_text TEXT,
        handedness TEXT CHECK (handedness IN ('left', 'right')),
        eye_dominance TEXT CHECK (eye_dominance IN ('left', 'right')),
        initial_email_sent INTEGER NOT NULL DEFAULT 0,
        thirty_day_reminder_sent INTEGER NOT NULL DEFAULT 0,
        course_fee_paid INTEGER NOT NULL DEFAULT 0,
        converted_to_member INTEGER NOT NULL DEFAULT 0,
        assigned_case_id INTEGER,
        assigned_case_by_username TEXT,
        assigned_case_at_date TEXT,
        assigned_case_at_time TEXT,
        created_by_username TEXT NOT NULL,
        created_at_date TEXT NOT NULL,
        created_at_time TEXT NOT NULL,
        FOREIGN KEY (course_id) REFERENCES beginners_courses(id),
        FOREIGN KEY (username) REFERENCES users(username),
        FOREIGN KEY (assigned_case_id) REFERENCES equipment_items(id),
        FOREIGN KEY (assigned_case_by_username) REFERENCES users(username),
        FOREIGN KEY (created_by_username) REFERENCES users(username)
      );
      INSERT INTO beginners_course_participants (
        id,
        course_id,
        username,
        first_name,
        surname,
        beginner_size_category,
        height_text,
        handedness,
        eye_dominance,
        initial_email_sent,
        thirty_day_reminder_sent,
        course_fee_paid,
        converted_to_member,
        assigned_case_id,
        assigned_case_by_username,
        assigned_case_at_date,
        assigned_case_at_time,
        created_by_username,
        created_at_date,
        created_at_time
      )
      SELECT
        id,
        course_id,
        username,
        first_name,
        surname,
        beginner_size_category,
        height_text,
        handedness,
        eye_dominance,
        initial_email_sent,
        thirty_day_reminder_sent,
        course_fee_paid,
        0,
        assigned_case_id,
        assigned_case_by_username,
        assigned_case_at_date,
        assigned_case_at_time,
        created_by_username,
        created_at_date,
        created_at_time
      FROM beginners_course_participants_old;
      DROP TABLE beginners_course_participants_old;
      PRAGMA foreign_keys = ON;
    `);
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS equipment_loans_one_open_loan
    ON equipment_loans (equipment_item_id)
    WHERE returned_at_date IS NULL
  `);
}
