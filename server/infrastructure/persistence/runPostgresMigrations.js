import { getDefaultGeneralInfoContent } from "../../../shared/generalInfoDefaults.js";
import { getDefaultRangeRulesContent } from "../../../shared/rangeRulesDefaults.js";
import { postgresMigrations } from "./postgresMigrations/index.js";

function buildInitialSchemaSql() {
  return `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      surname TEXT NOT NULL,
      gr_id TEXT,
      archery_gb_membership_number TEXT,
      email_address TEXT,
      password TEXT,
      rfid_tag TEXT UNIQUE,
      active_member INTEGER NOT NULL DEFAULT 1,
      affiliate_member INTEGER NOT NULL DEFAULT 0,
      junior_member INTEGER NOT NULL DEFAULT 0,
      membership_fees_due TEXT,
      coaching_volunteer INTEGER NOT NULL DEFAULT 0,
      membership_status TEXT NOT NULL DEFAULT 'member',
      programme_type TEXT NOT NULL DEFAULT 'none'
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id BIGSERIAL PRIMARY KEY,
      actor_username TEXT,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      metadata_json TEXT,
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      actor_user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS roles (
      role_key TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS permissions (
      permission_key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_key TEXT NOT NULL REFERENCES roles(role_key) ON DELETE CASCADE,
      permission_key TEXT NOT NULL REFERENCES permissions(permission_key) ON DELETE CASCADE,
      PRIMARY KEY (role_key, permission_key)
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id BIGSERIAL PRIMARY KEY,
      active_from_date TEXT NOT NULL,
      active_till_date TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      escalate_severity INTEGER NOT NULL DEFAULT 0,
      created_by_username TEXT NOT NULL REFERENCES users(username),
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      amended_by_username TEXT REFERENCES users(username),
      amended_at_date TEXT,
      amended_at_time TEXT,
      deleted_by_username TEXT REFERENCES users(username),
      deleted_at_date TEXT,
      deleted_at_time TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS announcement_seen_members (
      announcement_id BIGINT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
      username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      seen_at_date TEXT NOT NULL,
      seen_at_time TEXT NOT NULL,
      PRIMARY KEY (announcement_id, username)
    );

    CREATE TABLE IF NOT EXISTS suggestions (
      id BIGSERIAL PRIMARY KEY,
      submitted_by_username TEXT REFERENCES users(username),
      submitted_by_name TEXT NOT NULL DEFAULT 'Anonymous',
      is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
      suggestion_title TEXT NOT NULL,
      improvement_text TEXT NOT NULL,
      suggestion_details TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'new',
      resolution_note TEXT NOT NULL DEFAULT '',
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      updated_at_date TEXT,
      updated_at_time TEXT,
      updated_by_username TEXT REFERENCES users(username),
      submitted_by_user_id BIGINT REFERENCES users(id),
      updated_by_user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS member_questions (
      id BIGSERIAL PRIMARY KEY,
      submitted_by_username TEXT NOT NULL REFERENCES users(username),
      question_title TEXT NOT NULL,
      question_body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      response_text TEXT NOT NULL DEFAULT '',
      member_seen_response BOOLEAN NOT NULL DEFAULT TRUE,
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      responded_at_date TEXT,
      responded_at_time TEXT,
      responded_by_username TEXT REFERENCES users(username),
      updated_at_date TEXT,
      updated_at_time TEXT,
      submitted_by_user_id BIGINT REFERENCES users(id),
      responded_by_user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS committee_meeting_minutes (
      id BIGSERIAL PRIMARY KEY,
      meeting_date TEXT NOT NULL,
      title TEXT NOT NULL,
      sections_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      actions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      updated_at_date TEXT NOT NULL,
      updated_at_time TEXT NOT NULL,
      updated_by_username TEXT REFERENCES users(username),
      updated_by_user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS range_rules_content (
      content_key TEXT PRIMARY KEY,
      indoor_rules_json JSONB NOT NULL,
      outdoor_rules_json JSONB NOT NULL,
      outdoor_lane_rules_json JSONB NOT NULL,
      updated_at_date TEXT NOT NULL,
      updated_at_time TEXT NOT NULL,
      updated_by_username TEXT REFERENCES users(username)
    );

    CREATE TABLE IF NOT EXISTS general_info_content (
      content_key TEXT PRIMARY KEY,
      intro_paragraphs_json JSONB NOT NULL,
      quick_facts_json JSONB NOT NULL,
      facilities_json JSONB NOT NULL,
      beginners_json JSONB NOT NULL,
      club_life_json JSONB NOT NULL,
      updated_at_date TEXT NOT NULL,
      updated_at_time TEXT NOT NULL,
      updated_by_username TEXT REFERENCES users(username)
    );

    CREATE TABLE IF NOT EXISTS user_types (
      username TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
      user_type TEXT NOT NULL REFERENCES roles(role_key),
      user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_disciplines (
      username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      discipline TEXT NOT NULL,
      user_id BIGINT REFERENCES users(id),
      PRIMARY KEY (username, discipline)
    );

    CREATE TABLE IF NOT EXISTS member_distance_sign_offs (
      username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      discipline TEXT NOT NULL,
      distance_yards INTEGER NOT NULL,
      signed_off_by_username TEXT NOT NULL REFERENCES users(username),
      source TEXT NOT NULL DEFAULT 'manual',
      signed_off_at_date TEXT NOT NULL,
      signed_off_at_time TEXT NOT NULL,
      signed_off_by_user_id BIGINT REFERENCES users(id),
      user_id BIGINT REFERENCES users(id),
      PRIMARY KEY (username, discipline, distance_yards)
    );

    CREATE TABLE IF NOT EXISTS member_loan_bows (
      username TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
      has_loan_bow INTEGER NOT NULL DEFAULT 0,
      date_loaned TEXT,
      returned_date TEXT,
      riser_number TEXT,
      limbs_number TEXT,
      arrow_count INTEGER NOT NULL DEFAULT 6,
      returned_riser INTEGER NOT NULL DEFAULT 0,
      returned_limbs INTEGER NOT NULL DEFAULT 0,
      returned_arrows INTEGER NOT NULL DEFAULT 0,
      quiver INTEGER NOT NULL DEFAULT 0,
      returned_quiver INTEGER NOT NULL DEFAULT 0,
      finger_tab INTEGER NOT NULL DEFAULT 0,
      returned_finger_tab INTEGER NOT NULL DEFAULT 0,
      string_item INTEGER NOT NULL DEFAULT 0,
      returned_string_item INTEGER NOT NULL DEFAULT 0,
      arm_guard INTEGER NOT NULL DEFAULT 0,
      returned_arm_guard INTEGER NOT NULL DEFAULT 0,
      chest_guard INTEGER NOT NULL DEFAULT 0,
      returned_chest_guard INTEGER NOT NULL DEFAULT 0,
      sight INTEGER NOT NULL DEFAULT 0,
      returned_sight INTEGER NOT NULL DEFAULT 0,
      long_rod INTEGER NOT NULL DEFAULT 0,
      returned_long_rod INTEGER NOT NULL DEFAULT 0,
      pressure_button INTEGER NOT NULL DEFAULT 0,
      returned_pressure_button INTEGER NOT NULL DEFAULT 0,
      user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS lost_arrows (
      id BIGSERIAL PRIMARY KEY,
      archer_username TEXT NOT NULL REFERENCES users(username),
      date_lost TEXT NOT NULL,
      arrow_material TEXT NOT NULL,
      arrow_colour TEXT NOT NULL,
      arrow_identifier TEXT NOT NULL,
      fletching_colour_1 TEXT NOT NULL,
      fletching_colour_2 TEXT NOT NULL,
      fletching_colour_3 TEXT,
      nock_colour TEXT NOT NULL,
      target_distance TEXT NOT NULL,
      lane_number INTEGER NOT NULL,
      other_details TEXT,
      date_found TEXT,
      found_by_username TEXT REFERENCES users(username),
      found_collection_location TEXT,
      found_seen_at_date TEXT,
      found_seen_at_time TEXT,
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      archer_user_id BIGINT REFERENCES users(id),
      found_by_user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS outdoor_table_entries (
      id BIGSERIAL PRIMARY KEY,
      season_year INTEGER NOT NULL,
      archer_username TEXT NOT NULL REFERENCES users(username),
      bow_type TEXT NOT NULL,
      handicap INTEGER,
      archer_3rd BOOLEAN NOT NULL DEFAULT FALSE,
      archer_2nd BOOLEAN NOT NULL DEFAULT FALSE,
      archer_1st BOOLEAN NOT NULL DEFAULT FALSE,
      bowman_3rd BOOLEAN NOT NULL DEFAULT FALSE,
      bowman_2nd BOOLEAN NOT NULL DEFAULT FALSE,
      bowman_1st BOOLEAN NOT NULL DEFAULT FALSE,
      master_bowman BOOLEAN NOT NULL DEFAULT FALSE,
      grand_master_bowman BOOLEAN NOT NULL DEFAULT FALSE,
      elite_master_bowman BOOLEAN NOT NULL DEFAULT FALSE,
      archer_3rd_date TEXT NOT NULL DEFAULT '',
      archer_2nd_date TEXT NOT NULL DEFAULT '',
      archer_1st_date TEXT NOT NULL DEFAULT '',
      bowman_3rd_date TEXT NOT NULL DEFAULT '',
      bowman_2nd_date TEXT NOT NULL DEFAULT '',
      bowman_1st_date TEXT NOT NULL DEFAULT '',
      master_bowman_date TEXT NOT NULL DEFAULT '',
      grand_master_bowman_date TEXT NOT NULL DEFAULT '',
      elite_master_bowman_date TEXT NOT NULL DEFAULT '',
      award_252_20 BOOLEAN NOT NULL DEFAULT FALSE,
      award_252_30 BOOLEAN NOT NULL DEFAULT FALSE,
      award_252_40 BOOLEAN NOT NULL DEFAULT FALSE,
      award_252_50 BOOLEAN NOT NULL DEFAULT FALSE,
      award_252_60 BOOLEAN NOT NULL DEFAULT FALSE,
      award_252_80 BOOLEAN NOT NULL DEFAULT FALSE,
      award_252_100 BOOLEAN NOT NULL DEFAULT FALSE,
      award_252_20_sign_off_dates JSONB NOT NULL DEFAULT '["","",""]'::jsonb,
      award_252_30_sign_off_dates JSONB NOT NULL DEFAULT '["","",""]'::jsonb,
      award_252_40_sign_off_dates JSONB NOT NULL DEFAULT '["","",""]'::jsonb,
      award_252_50_sign_off_dates JSONB NOT NULL DEFAULT '["","",""]'::jsonb,
      award_252_60_sign_off_dates JSONB NOT NULL DEFAULT '["","",""]'::jsonb,
      award_252_80_sign_off_dates JSONB NOT NULL DEFAULT '["","",""]'::jsonb,
      award_252_100_sign_off_dates JSONB NOT NULL DEFAULT '["","",""]'::jsonb,
      clout_white_20 BOOLEAN NOT NULL DEFAULT FALSE,
      clout_white_30 BOOLEAN NOT NULL DEFAULT FALSE,
      clout_white_40 BOOLEAN NOT NULL DEFAULT FALSE,
      clout_white_50 BOOLEAN NOT NULL DEFAULT FALSE,
      clout_white_60 BOOLEAN NOT NULL DEFAULT FALSE,
      clout_white_70_80 BOOLEAN NOT NULL DEFAULT FALSE,
      clout_white_90_100 BOOLEAN NOT NULL DEFAULT FALSE,
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      updated_at_date TEXT,
      updated_at_time TEXT,
      updated_by_username TEXT REFERENCES users(username),
      updated_by_user_id BIGINT REFERENCES users(id),
      UNIQUE (season_year, archer_username, bow_type)
    );

    CREATE TABLE IF NOT EXISTS golden_records_member_sync (
      username TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
      snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      fetched_at TEXT NOT NULL DEFAULT '',
      synced_at_date TEXT NOT NULL,
      synced_at_time TEXT NOT NULL,
      updated_by_username TEXT REFERENCES users(username),
      user_id BIGINT REFERENCES users(id),
      updated_by_user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS golden_records_integration_status (
      status_key TEXT PRIMARY KEY,
      status_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS golden_records_lookup_cache (
      lookup_type TEXT PRIMARY KEY,
      item_count INTEGER NOT NULL DEFAULT 0,
      payload_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      fetched_at TEXT NOT NULL DEFAULT '',
      synced_at_date TEXT NOT NULL DEFAULT '',
      synced_at_time TEXT NOT NULL DEFAULT '',
      updated_by_username TEXT REFERENCES users(username)
    );

    CREATE TABLE IF NOT EXISTS login_events (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL REFERENCES users(username),
      login_method TEXT NOT NULL,
      logged_in_date TEXT NOT NULL,
      logged_in_time TEXT NOT NULL,
      user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS guest_login_events (
      id BIGSERIAL PRIMARY KEY,
      first_name TEXT NOT NULL,
      surname TEXT NOT NULL,
      archery_gb_membership_number TEXT NOT NULL,
      invited_by_username TEXT REFERENCES users(username),
      invited_by_name TEXT,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      logged_in_date TEXT NOT NULL,
      logged_in_time TEXT NOT NULL,
      invited_by_user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS range_presence_extensions (
      username TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
      active_until_date TEXT NOT NULL,
      active_until_time TEXT NOT NULL,
      updated_by_username TEXT NOT NULL REFERENCES users(username),
      updated_at_date TEXT NOT NULL,
      updated_at_time TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coaching_sessions (
      id BIGSERIAL PRIMARY KEY,
      coach_username TEXT NOT NULL REFERENCES users(username),
      session_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      available_slots INTEGER NOT NULL DEFAULT 1,
      topic TEXT NOT NULL,
      summary TEXT NOT NULL,
      venue TEXT NOT NULL,
      approval_status TEXT NOT NULL DEFAULT 'approved',
      rejection_reason TEXT,
      approved_by_username TEXT REFERENCES users(username),
      approved_at_date TEXT,
      approved_at_time TEXT,
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      coach_user_id BIGINT REFERENCES users(id),
      approved_by_user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS coaching_session_bookings (
      coaching_session_id BIGINT NOT NULL REFERENCES coaching_sessions(id) ON DELETE CASCADE,
      member_username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      booked_at_date TEXT NOT NULL,
      booked_at_time TEXT NOT NULL,
      member_user_id BIGINT REFERENCES users(id),
      PRIMARY KEY (coaching_session_id, member_username)
    );

    CREATE TABLE IF NOT EXISTS club_events (
      id BIGSERIAL PRIMARY KEY,
      event_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      title TEXT NOT NULL,
      details TEXT,
      type TEXT NOT NULL,
      types TEXT,
      venue TEXT NOT NULL DEFAULT 'both',
      submitted_by_username TEXT REFERENCES users(username),
      approval_status TEXT NOT NULL DEFAULT 'approved',
      rejection_reason TEXT,
      approved_by_username TEXT REFERENCES users(username),
      approved_at_date TEXT,
      approved_at_time TEXT,
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      submitted_by_user_id BIGINT REFERENCES users(id),
      approved_by_user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS event_bookings (
      club_event_id BIGINT NOT NULL REFERENCES club_events(id) ON DELETE CASCADE,
      member_username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      booked_at_date TEXT NOT NULL,
      booked_at_time TEXT NOT NULL,
      member_user_id BIGINT REFERENCES users(id),
      PRIMARY KEY (club_event_id, member_username)
    );

    ALTER TABLE club_events
    ADD COLUMN IF NOT EXISTS types TEXT;

    CREATE TABLE IF NOT EXISTS tournaments (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      tournament_type TEXT NOT NULL,
      template_key TEXT,
      template_definition_json TEXT,
      draw_date TEXT,
      round_schedule_json TEXT NOT NULL DEFAULT '[]',
      registration_start_date TEXT NOT NULL,
      registration_end_date TEXT NOT NULL,
      score_submission_start_date TEXT NOT NULL,
      score_submission_end_date TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(username),
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      created_by_user_id BIGINT REFERENCES users(id)
    );

    ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS template_key TEXT;

    ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS template_definition_json TEXT;

    ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS draw_date TEXT;

    ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS round_schedule_json TEXT NOT NULL DEFAULT '[]';

    CREATE TABLE IF NOT EXISTS tournament_templates (
      template_key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      tournament_type TEXT NOT NULL,
      format TEXT NOT NULL,
      round_type TEXT NOT NULL,
      defaults_json TEXT NOT NULL DEFAULT '{}',
      capabilities_json TEXT NOT NULL DEFAULT '{}',
      eligibility_rules_json TEXT,
      created_by TEXT NOT NULL REFERENCES users(username),
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      created_by_user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS tournament_registrations (
      tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      member_username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      bow_code TEXT,
      registered_at_date TEXT NOT NULL,
      registered_at_time TEXT NOT NULL,
      member_user_id BIGINT REFERENCES users(id),
      PRIMARY KEY (tournament_id, member_username)
    );

    ALTER TABLE tournament_registrations
    ADD COLUMN IF NOT EXISTS bow_code TEXT;

    CREATE TABLE IF NOT EXISTS tournament_rounds (
      tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      round_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      publish_date TEXT,
      submission_deadline TEXT,
      status TEXT NOT NULL DEFAULT 'scheduled',
      PRIMARY KEY (tournament_id, round_number)
    );

    CREATE TABLE IF NOT EXISTS tournament_matches (
      tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      round_number INTEGER NOT NULL,
      match_number INTEGER NOT NULL,
      left_member_username TEXT REFERENCES users(username) ON DELETE SET NULL,
      right_member_username TEXT REFERENCES users(username) ON DELETE SET NULL,
      left_score INTEGER,
      right_score INTEGER,
      winner_username TEXT REFERENCES users(username) ON DELETE SET NULL,
      submitted_by_username TEXT REFERENCES users(username) ON DELETE SET NULL,
      submitted_at_date TEXT,
      submitted_at_time TEXT,
      confirmed_by_username TEXT REFERENCES users(username) ON DELETE SET NULL,
      confirmed_at_date TEXT,
      confirmed_at_time TEXT,
      disputed_by_username TEXT REFERENCES users(username) ON DELETE SET NULL,
      disputed_at_date TEXT,
      disputed_at_time TEXT,
      dispute_reason TEXT,
      handicap_allowance_percent INTEGER,
      left_handicap_value INTEGER,
      left_handicap_type TEXT,
      left_handicap_bow_class TEXT,
      left_handicap_discipline TEXT,
      left_reference_score INTEGER,
      left_allowance_points INTEGER,
      left_adjusted_score INTEGER,
      left_handicap_table_key TEXT,
      left_handicap_table_title TEXT,
      right_handicap_value INTEGER,
      right_handicap_type TEXT,
      right_handicap_bow_class TEXT,
      right_handicap_discipline TEXT,
      right_reference_score INTEGER,
      right_allowance_points INTEGER,
      right_adjusted_score INTEGER,
      right_handicap_table_key TEXT,
      right_handicap_table_title TEXT,
      status TEXT NOT NULL DEFAULT 'scheduled',
      PRIMARY KEY (tournament_id, round_number, match_number)
    );

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS submitted_by_username TEXT REFERENCES users(username) ON DELETE SET NULL;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS submitted_at_date TEXT;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS submitted_at_time TEXT;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS confirmed_by_username TEXT REFERENCES users(username) ON DELETE SET NULL;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS confirmed_at_date TEXT;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS confirmed_at_time TEXT;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS disputed_by_username TEXT REFERENCES users(username) ON DELETE SET NULL;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS disputed_at_date TEXT;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS disputed_at_time TEXT;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS dispute_reason TEXT;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS handicap_allowance_percent INTEGER;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS left_handicap_value INTEGER;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS left_handicap_type TEXT;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS left_handicap_bow_class TEXT;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS left_handicap_discipline TEXT;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS left_reference_score INTEGER;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS left_allowance_points INTEGER;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS left_adjusted_score INTEGER;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS left_handicap_table_key TEXT;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS left_handicap_table_title TEXT;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS right_handicap_value INTEGER;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS right_handicap_type TEXT;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS right_handicap_bow_class TEXT;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS right_handicap_discipline TEXT;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS right_reference_score INTEGER;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS right_allowance_points INTEGER;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS right_adjusted_score INTEGER;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS right_handicap_table_key TEXT;

    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS right_handicap_table_title TEXT;

    CREATE TABLE IF NOT EXISTS tournament_handicap_tables (
      id BIGSERIAL PRIMARY KEY,
      table_key TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      allowance_percent INTEGER,
      is_editable INTEGER NOT NULL DEFAULT 0,
      updated_at_date TEXT,
      updated_at_time TEXT,
      updated_by_username TEXT REFERENCES users(username)
    );

    CREATE TABLE IF NOT EXISTS tournament_handicap_table_rows (
      table_id BIGINT NOT NULL REFERENCES tournament_handicap_tables(id) ON DELETE CASCADE,
      handicap_value INTEGER NOT NULL,
      reference_score INTEGER,
      display_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (table_id, handicap_value)
    );

    CREATE TABLE IF NOT EXISTS tournament_scores (
      tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      round_number INTEGER NOT NULL,
      member_username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      score INTEGER NOT NULL,
      submitted_at_date TEXT NOT NULL,
      submitted_at_time TEXT NOT NULL,
      member_user_id BIGINT REFERENCES users(id),
      PRIMARY KEY (tournament_id, round_number, member_username)
    );

    CREATE TABLE IF NOT EXISTS committee_roles (
      id BIGSERIAL PRIMARY KEY,
      role_key TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      responsibilities TEXT,
      personal_blurb TEXT,
      photo_data_url TEXT,
      display_order INTEGER NOT NULL,
      assigned_username TEXT REFERENCES users(username),
      assigned_user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS equipment_storage_locations (
      label TEXT PRIMARY KEY,
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS equipment_items (
      id BIGSERIAL PRIMARY KEY,
      equipment_type TEXT NOT NULL,
      item_number TEXT,
      size_category TEXT NOT NULL DEFAULT 'standard',
      arrow_length INTEGER,
      arrow_quantity INTEGER NOT NULL DEFAULT 1,
      details_json TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      location_type TEXT NOT NULL DEFAULT 'cupboard',
      location_label TEXT,
      location_case_id BIGINT REFERENCES equipment_items(id),
      location_member_username TEXT REFERENCES users(username),
      added_by_username TEXT NOT NULL REFERENCES users(username),
      added_at_date TEXT NOT NULL,
      added_at_time TEXT NOT NULL,
      decommissioned_by_username TEXT REFERENCES users(username),
      decommissioned_at_date TEXT,
      decommissioned_at_time TEXT,
      decommission_reason TEXT,
      last_assignment_by_username TEXT REFERENCES users(username),
      last_assignment_at_date TEXT,
      last_assignment_at_time TEXT,
      last_storage_updated_by_username TEXT REFERENCES users(username),
      last_storage_updated_at_date TEXT,
      last_storage_updated_at_time TEXT,
      location_member_user_id BIGINT REFERENCES users(id),
      added_by_user_id BIGINT REFERENCES users(id),
      decommissioned_by_user_id BIGINT REFERENCES users(id),
      last_assignment_by_user_id BIGINT REFERENCES users(id),
      last_storage_updated_by_user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS equipment_loans (
      id BIGSERIAL PRIMARY KEY,
      equipment_item_id BIGINT NOT NULL REFERENCES equipment_items(id),
      member_username TEXT NOT NULL REFERENCES users(username),
      loaned_by_username TEXT NOT NULL REFERENCES users(username),
      loaned_at_date TEXT NOT NULL,
      loaned_at_time TEXT NOT NULL,
      loan_context_case_id BIGINT REFERENCES equipment_items(id),
      returned_by_username TEXT REFERENCES users(username),
      returned_at_date TEXT,
      returned_at_time TEXT,
      return_location_type TEXT,
      return_location_label TEXT,
      return_case_id BIGINT REFERENCES equipment_items(id),
      member_user_id BIGINT REFERENCES users(id),
      loaned_by_user_id BIGINT REFERENCES users(id),
      returned_by_user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS beginners_courses (
      id BIGSERIAL PRIMARY KEY,
      course_type TEXT NOT NULL DEFAULT 'beginners',
      coordinator_username TEXT NOT NULL REFERENCES users(username),
      submitted_by_username TEXT NOT NULL REFERENCES users(username),
      first_lesson_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      lesson_count INTEGER NOT NULL,
      beginner_capacity INTEGER NOT NULL,
      approval_status TEXT NOT NULL DEFAULT 'pending',
      is_cancelled INTEGER NOT NULL DEFAULT 0,
      cancellation_reason TEXT,
      cancelled_by_username TEXT REFERENCES users(username),
      cancelled_at_date TEXT,
      cancelled_at_time TEXT,
      rejection_reason TEXT,
      approved_by_username TEXT REFERENCES users(username),
      approved_at_date TEXT,
      approved_at_time TEXT,
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      coordinator_user_id BIGINT REFERENCES users(id),
      submitted_by_user_id BIGINT REFERENCES users(id),
      cancelled_by_user_id BIGINT REFERENCES users(id),
      approved_by_user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS beginners_course_lessons (
      id BIGSERIAL PRIMARY KEY,
      course_id BIGINT NOT NULL REFERENCES beginners_courses(id) ON DELETE CASCADE,
      lesson_number INTEGER NOT NULL,
      lesson_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      UNIQUE (course_id, lesson_number)
    );

    CREATE TABLE IF NOT EXISTS beginners_course_participants (
      id BIGSERIAL PRIMARY KEY,
      course_id BIGINT NOT NULL REFERENCES beginners_courses(id) ON DELETE CASCADE,
      username TEXT NOT NULL UNIQUE REFERENCES users(username),
      first_name TEXT NOT NULL,
      surname TEXT NOT NULL,
      beginner_size_category TEXT NOT NULL,
      height_text TEXT,
      draw_length TEXT,
      handedness TEXT,
      eye_dominance TEXT,
      initial_email_sent INTEGER NOT NULL DEFAULT 0,
      thirty_day_reminder_sent INTEGER NOT NULL DEFAULT 0,
      course_fee_paid INTEGER NOT NULL DEFAULT 0,
      origin_course_type TEXT NOT NULL DEFAULT 'beginners',
      converted_to_member INTEGER NOT NULL DEFAULT 0,
      converted_at_date TEXT,
      converted_at_time TEXT,
      converted_by_username TEXT REFERENCES users(username),
      assigned_case_id BIGINT REFERENCES equipment_items(id),
      assigned_case_by_username TEXT REFERENCES users(username),
      assigned_case_at_date TEXT,
      assigned_case_at_time TEXT,
      created_by_username TEXT NOT NULL REFERENCES users(username),
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      user_id BIGINT REFERENCES users(id),
      converted_by_user_id BIGINT REFERENCES users(id),
      assigned_case_by_user_id BIGINT REFERENCES users(id),
      created_by_user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS beginners_course_lesson_coaches (
      lesson_id BIGINT NOT NULL REFERENCES beginners_course_lessons(id) ON DELETE CASCADE,
      coach_username TEXT NOT NULL REFERENCES users(username),
      assigned_by_username TEXT NOT NULL REFERENCES users(username),
      assigned_at_date TEXT NOT NULL,
      assigned_at_time TEXT NOT NULL,
      coach_user_id BIGINT REFERENCES users(id),
      assigned_by_user_id BIGINT REFERENCES users(id),
      PRIMARY KEY (lesson_id, coach_username)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS equipment_items_unique_number
      ON equipment_items (equipment_type, size_category, item_number)
      WHERE item_number IS NOT NULL AND status = 'active';

    CREATE UNIQUE INDEX IF NOT EXISTS equipment_loans_one_open_loan
      ON equipment_loans (equipment_item_id)
      WHERE returned_at_date IS NULL;
  `;
}

function buildRolePermissionSeedSql({
  committeeRoleSeed,
  defaultEquipmentCupboardLabel,
  permissionDefinitions,
  seedUsers,
  systemRoleDefinitions,
}) {
  const statements = [];
  const defaultRangeRulesContent = getDefaultRangeRulesContent();
  const defaultGeneralInfoContent = getDefaultGeneralInfoContent();

  for (const permission of permissionDefinitions) {
    statements.push({
      sql: `
        INSERT INTO permissions (permission_key, label, description)
        VALUES ($1, $2, $3)
        ON CONFLICT(permission_key) DO UPDATE SET
          label = EXCLUDED.label,
          description = EXCLUDED.description
      `,
      values: [permission.key, permission.label, permission.description],
    });
  }

  for (const role of systemRoleDefinitions) {
    statements.push({
      sql: `
        INSERT INTO roles (role_key, title, is_system)
        VALUES ($1, $2, 1)
        ON CONFLICT(role_key) DO UPDATE SET
          title = EXCLUDED.title,
          is_system = GREATEST(roles.is_system, EXCLUDED.is_system)
      `,
      values: [role.roleKey, role.title],
    });

    for (const permissionKey of role.permissions) {
      statements.push({
        sql: `
          INSERT INTO role_permissions (role_key, permission_key)
          VALUES ($1, $2)
          ON CONFLICT(role_key, permission_key) DO NOTHING
        `,
        values: [role.roleKey, permissionKey],
      });
    }
  }

  statements.push({
    sql: `
      INSERT INTO equipment_storage_locations (label, created_at_date, created_at_time)
      VALUES ($1, '1970-01-01', '00:00:00.000Z')
      ON CONFLICT(label) DO NOTHING
    `,
    values: [defaultEquipmentCupboardLabel],
  });

  statements.push({
    sql: `
      INSERT INTO general_info_content (
        content_key,
        intro_paragraphs_json,
        quick_facts_json,
        facilities_json,
        beginners_json,
        club_life_json,
        updated_at_date,
        updated_at_time,
        updated_by_username
      )
      VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, '1970-01-01', '00:00:00.000Z', NULL)
      ON CONFLICT(content_key) DO NOTHING
    `,
    values: [
      "default",
      JSON.stringify(defaultGeneralInfoContent.introParagraphs),
      JSON.stringify(defaultGeneralInfoContent.quickFacts),
      JSON.stringify(defaultGeneralInfoContent.facilities),
      JSON.stringify(defaultGeneralInfoContent.beginners),
      JSON.stringify(defaultGeneralInfoContent.clubLife),
    ],
  });

  statements.push({
    sql: `
      INSERT INTO range_rules_content (
        content_key,
        indoor_rules_json,
        outdoor_rules_json,
        outdoor_lane_rules_json,
        updated_at_date,
        updated_at_time,
        updated_by_username
      )
      VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, '1970-01-01', '00:00:00.000Z', NULL)
      ON CONFLICT(content_key) DO NOTHING
    `,
    values: [
      "default",
      JSON.stringify(defaultRangeRulesContent.indoorRules),
      JSON.stringify(defaultRangeRulesContent.outdoorRules),
      JSON.stringify(defaultRangeRulesContent.outdoorLaneRules),
    ],
  });

  for (const role of committeeRoleSeed) {
    statements.push({
      sql: `
        INSERT INTO committee_roles (
          role_key,
          title,
          summary,
          responsibilities,
          personal_blurb,
          photo_data_url,
          display_order,
          assigned_username
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
        ON CONFLICT(role_key) DO NOTHING
      `,
      values: [
        role.roleKey,
        role.title,
        role.summary,
        role.responsibilities ?? role.summary,
        role.personalBlurb ?? "",
        role.photoDataUrl ?? null,
        role.displayOrder,
      ],
    });
  }

  for (const user of seedUsers) {
    statements.push({
      sql: `
        INSERT INTO users (
          username,
          first_name,
          surname,
          archery_gb_membership_number,
          email_address,
          password,
          rfid_tag,
          active_member,
          affiliate_member,
          junior_member,
          membership_fees_due,
          coaching_volunteer,
          membership_status,
          programme_type
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT(username) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          surname = EXCLUDED.surname,
          archery_gb_membership_number = EXCLUDED.archery_gb_membership_number,
          email_address = EXCLUDED.email_address,
          password = EXCLUDED.password,
          rfid_tag = EXCLUDED.rfid_tag,
          active_member = EXCLUDED.active_member,
          affiliate_member = EXCLUDED.affiliate_member,
          junior_member = EXCLUDED.junior_member,
          membership_fees_due = EXCLUDED.membership_fees_due,
          coaching_volunteer = EXCLUDED.coaching_volunteer,
          membership_status = EXCLUDED.membership_status,
          programme_type = EXCLUDED.programme_type
      `,
      values: [
        user.username,
        user.firstName,
        user.surname,
        user.archeryGbMembershipNumber ?? null,
        user.emailAddress ?? null,
        user.password,
        user.rfidTag,
        user.activeMember ? 1 : 0,
        user.affiliateMember ? 1 : 0,
        user.juniorMember ? 1 : 0,
        user.membershipFeesDue,
        user.coachingVolunteer ? 1 : 0,
        user.membershipStatus ??
          (user.userType === "beginner" ||
          user.userType === "have-a-go" ||
          user.userType === "non-member"
            ? "non-member"
            : "member"),
        user.programmeType ??
          (user.userType === "beginner"
            ? "beginners"
            : user.userType === "have-a-go"
              ? "have-a-go"
              : "none"),
      ],
    });
    statements.push({
      sql: `
        INSERT INTO user_types (username, user_type)
        VALUES ($1, $2)
        ON CONFLICT(username) DO UPDATE SET
          user_type = EXCLUDED.user_type
      `,
      values: [user.username, user.userType],
    });

    for (const discipline of user.disciplines) {
      statements.push({
        sql: `
          INSERT INTO user_disciplines (username, discipline)
          VALUES ($1, $2)
          ON CONFLICT(username, discipline) DO NOTHING
        `,
        values: [user.username, discipline],
      });
    }
  }

  return statements;
}

function buildUserReferenceSyncStatements() {
  const userReferenceMappings = [
    {
      tableName: "audit_events",
      references: [{ usernameColumn: "actor_username", userIdColumn: "actor_user_id" }],
    },
    {
      tableName: "suggestions",
      references: [
        { usernameColumn: "submitted_by_username", userIdColumn: "submitted_by_user_id" },
        { usernameColumn: "updated_by_username", userIdColumn: "updated_by_user_id" },
      ],
    },
    {
      tableName: "committee_meeting_minutes",
      references: [
        { usernameColumn: "updated_by_username", userIdColumn: "updated_by_user_id" },
      ],
    },
    {
      tableName: "user_types",
      references: [{ usernameColumn: "username", userIdColumn: "user_id" }],
    },
    {
      tableName: "user_disciplines",
      references: [{ usernameColumn: "username", userIdColumn: "user_id" }],
    },
    {
      tableName: "member_distance_sign_offs",
      references: [
        { usernameColumn: "username", userIdColumn: "user_id" },
        {
          usernameColumn: "signed_off_by_username",
          userIdColumn: "signed_off_by_user_id",
        },
      ],
    },
    {
      tableName: "member_loan_bows",
      references: [{ usernameColumn: "username", userIdColumn: "user_id" }],
    },
    {
      tableName: "lost_arrows",
      references: [
        { usernameColumn: "archer_username", userIdColumn: "archer_user_id" },
        {
          usernameColumn: "found_by_username",
          userIdColumn: "found_by_user_id",
        },
      ],
    },
    {
      tableName: "login_events",
      references: [{ usernameColumn: "username", userIdColumn: "user_id" }],
    },
    {
      tableName: "guest_login_events",
      references: [
        {
          usernameColumn: "invited_by_username",
          userIdColumn: "invited_by_user_id",
        },
      ],
    },
    {
      tableName: "coaching_sessions",
      references: [
        { usernameColumn: "coach_username", userIdColumn: "coach_user_id" },
        {
          usernameColumn: "approved_by_username",
          userIdColumn: "approved_by_user_id",
        },
      ],
    },
    {
      tableName: "coaching_session_bookings",
      references: [{ usernameColumn: "member_username", userIdColumn: "member_user_id" }],
    },
    {
      tableName: "club_events",
      references: [
        {
          usernameColumn: "submitted_by_username",
          userIdColumn: "submitted_by_user_id",
        },
        {
          usernameColumn: "approved_by_username",
          userIdColumn: "approved_by_user_id",
        },
      ],
    },
    {
      tableName: "event_bookings",
      references: [{ usernameColumn: "member_username", userIdColumn: "member_user_id" }],
    },
    {
      tableName: "tournaments",
      references: [{ usernameColumn: "created_by", userIdColumn: "created_by_user_id" }],
    },
    {
      tableName: "tournament_registrations",
      references: [{ usernameColumn: "member_username", userIdColumn: "member_user_id" }],
    },
    {
      tableName: "tournament_scores",
      references: [{ usernameColumn: "member_username", userIdColumn: "member_user_id" }],
    },
    {
      tableName: "committee_roles",
      references: [{ usernameColumn: "assigned_username", userIdColumn: "assigned_user_id" }],
    },
    {
      tableName: "equipment_items",
      references: [
        {
          usernameColumn: "location_member_username",
          userIdColumn: "location_member_user_id",
        },
        { usernameColumn: "added_by_username", userIdColumn: "added_by_user_id" },
        {
          usernameColumn: "decommissioned_by_username",
          userIdColumn: "decommissioned_by_user_id",
        },
        {
          usernameColumn: "last_assignment_by_username",
          userIdColumn: "last_assignment_by_user_id",
        },
        {
          usernameColumn: "last_storage_updated_by_username",
          userIdColumn: "last_storage_updated_by_user_id",
        },
      ],
    },
    {
      tableName: "equipment_loans",
      references: [
        { usernameColumn: "member_username", userIdColumn: "member_user_id" },
        { usernameColumn: "loaned_by_username", userIdColumn: "loaned_by_user_id" },
        { usernameColumn: "returned_by_username", userIdColumn: "returned_by_user_id" },
      ],
    },
    {
      tableName: "beginners_courses",
      references: [
        {
          usernameColumn: "coordinator_username",
          userIdColumn: "coordinator_user_id",
        },
        {
          usernameColumn: "submitted_by_username",
          userIdColumn: "submitted_by_user_id",
        },
        {
          usernameColumn: "cancelled_by_username",
          userIdColumn: "cancelled_by_user_id",
        },
        {
          usernameColumn: "approved_by_username",
          userIdColumn: "approved_by_user_id",
        },
      ],
    },
    {
      tableName: "beginners_course_participants",
      references: [
        { usernameColumn: "username", userIdColumn: "user_id" },
        {
          usernameColumn: "converted_by_username",
          userIdColumn: "converted_by_user_id",
        },
        {
          usernameColumn: "assigned_case_by_username",
          userIdColumn: "assigned_case_by_user_id",
        },
        {
          usernameColumn: "created_by_username",
          userIdColumn: "created_by_user_id",
        },
      ],
    },
    {
      tableName: "beginners_course_lesson_coaches",
      references: [
        { usernameColumn: "coach_username", userIdColumn: "coach_user_id" },
        {
          usernameColumn: "assigned_by_username",
          userIdColumn: "assigned_by_user_id",
        },
      ],
    },
  ];

  return userReferenceMappings.flatMap(({ references, tableName }) => {
    const functionName = `sync_${tableName}_user_refs`;
    const triggerName = `${tableName}_user_refs_trigger`;
    const assignments = references
      .map(
        ({ usernameColumn, userIdColumn }) => `
          IF NEW.${usernameColumn} IS NULL OR BTRIM(NEW.${usernameColumn}) = '' THEN
            NEW.${userIdColumn} := NULL;
          ELSE
            SELECT id INTO NEW.${userIdColumn}
            FROM users
            WHERE LOWER(username) = LOWER(NEW.${usernameColumn})
            LIMIT 1;
          END IF;
        `,
      )
      .join("\n");
    const backfillAssignments = references
      .map(
        ({ usernameColumn, userIdColumn }) => `
          ${userIdColumn} = CASE
            WHEN ${usernameColumn} IS NULL OR BTRIM(${usernameColumn}) = '' THEN NULL
            ELSE (
              SELECT id
              FROM users
              WHERE LOWER(users.username) = LOWER(${tableName}.${usernameColumn})
              LIMIT 1
            )
          END
        `,
      )
      .join(",");

    return [
      {
        sql: `
          CREATE OR REPLACE FUNCTION ${functionName}()
          RETURNS TRIGGER
          LANGUAGE plpgsql
          AS $$
          BEGIN
            ${assignments}
            RETURN NEW;
          END;
          $$;
        `,
      },
      {
        sql: `
          DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName};
          CREATE TRIGGER ${triggerName}
          BEFORE INSERT OR UPDATE ON ${tableName}
          FOR EACH ROW
          EXECUTE FUNCTION ${functionName}();
        `,
      },
      {
        sql: `
          UPDATE ${tableName}
          SET ${backfillAssignments};
        `,
      },
    ];
  });
}

async function applyNumberedPostgresMigrations(client) {
  for (const migration of postgresMigrations) {
    const versionResult = await client.query(
      `
        SELECT 1
        FROM schema_migrations
        WHERE version = $1
        LIMIT 1
      `,
      [migration.version],
    );

    if (versionResult.rowCount > 0) {
      continue;
    }

    for (const statement of migration.statements) {
      await client.query(statement);
    }

    await client.query(
      `
        INSERT INTO schema_migrations (version)
        VALUES ($1)
      `,
      [migration.version],
    );
  }
}

export async function runPostgresMigrations({
  committeeRoleSeed,
  defaultEquipmentCupboardLabel,
  permissionDefinitions,
  pool,
  seedUsers = [],
  systemRoleDefinitions,
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    // Cloud Run instances share this database-level transaction lock, so only
    // one instance can bootstrap or apply a numbered migration at a time.
    await client.query("SELECT pg_advisory_xact_lock($1)", [81420732]);
    await client.query(buildInitialSchemaSql());
    // Repair numbered schema before any legacy maintenance can fire its triggers.
    await applyNumberedPostgresMigrations(client);
    await client.query(
      `SELECT set_config('archery.sync.apply_mode', 'maintenance', true)`,
    );

    const appliedResult = await client.query(
      `
        SELECT 1
        FROM schema_migrations
        WHERE version = $1
        LIMIT 1
      `,
      ["001_initial_schema"],
    );

    if (appliedResult.rowCount === 0) {
      const seedStatements = buildRolePermissionSeedSql({
        committeeRoleSeed,
        defaultEquipmentCupboardLabel,
        permissionDefinitions,
        seedUsers,
        systemRoleDefinitions,
      });

      for (const statement of seedStatements) {
        await client.query(statement.sql, statement.values);
      }

      await client.query(
        `
          INSERT INTO schema_migrations (version)
          VALUES ($1)
        `,
        ["001_initial_schema"],
      );
    }

    await client.query(`
      ALTER TABLE beginners_course_participants
      ADD COLUMN IF NOT EXISTS converted_by_username TEXT REFERENCES users(username)
    `);
    await client.query(`
      ALTER TABLE beginners_course_participants
      ADD COLUMN IF NOT EXISTS converted_at_date TEXT
    `);
    await client.query(`
      ALTER TABLE beginners_course_participants
      ADD COLUMN IF NOT EXISTS converted_at_time TEXT
    `);
    await client.query(`
      ALTER TABLE beginners_course_participants
      ADD COLUMN IF NOT EXISTS converted_by_user_id BIGINT REFERENCES users(id)
    `);

    for (const statement of buildUserReferenceSyncStatements()) {
      await client.query(statement.sql, statement.values);
    }

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS gr_id TEXT
    `);
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS archery_gb_membership_number TEXT
    `);
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email_address TEXT
    `);
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS affiliate_member INTEGER NOT NULL DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS junior_member INTEGER NOT NULL DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE equipment_items
      ADD COLUMN IF NOT EXISTS details_json TEXT
    `);
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS membership_status TEXT NOT NULL DEFAULT 'member'
    `);
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS programme_type TEXT NOT NULL DEFAULT 'none'
    `);
    await client.query(`
      UPDATE users
      SET membership_status = CASE
        WHEN membership_status IS NULL OR BTRIM(membership_status) = '' THEN
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM user_types
              WHERE user_types.username = users.username
                AND user_types.user_type IN ('beginner', 'have-a-go')
            ) THEN 'non-member'
            ELSE 'member'
          END
        ELSE membership_status
      END
    `);
    await client.query(`
      UPDATE users
      SET programme_type = CASE
        WHEN programme_type IS NULL OR BTRIM(programme_type) = '' THEN
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM user_types
              WHERE user_types.username = users.username
                AND user_types.user_type = 'beginner'
            ) THEN 'beginners'
            WHEN EXISTS (
              SELECT 1
              FROM user_types
              WHERE user_types.username = users.username
                AND user_types.user_type = 'have-a-go'
            ) THEN 'have-a-go'
            ELSE 'none'
          END
        ELSE programme_type
      END
    `);
    await client.query(`
      ALTER TABLE beginners_course_participants
      ADD COLUMN IF NOT EXISTS origin_course_type TEXT NOT NULL DEFAULT 'beginners'
    `);
    await client.query(`
      ALTER TABLE beginners_course_participants
      ADD COLUMN IF NOT EXISTS no_show_recorded INTEGER NOT NULL DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE beginners_course_participants
      ADD COLUMN IF NOT EXISTS no_show_recorded_at_date TEXT
    `);
    await client.query(`
      ALTER TABLE beginners_course_participants
      ADD COLUMN IF NOT EXISTS no_show_recorded_at_time TEXT
    `);
    await client.query(`
      ALTER TABLE beginners_course_participants
      ADD COLUMN IF NOT EXISTS no_show_recorded_by_username TEXT REFERENCES users(username)
    `);
    await client.query(`
      ALTER TABLE beginners_course_participants
      ADD COLUMN IF NOT EXISTS draw_length TEXT
    `);
    await client.query(`
      ALTER TABLE beginners_course_participants
      ADD COLUMN IF NOT EXISTS converted_at_date TEXT
    `);
    await client.query(`
      ALTER TABLE beginners_course_participants
      ADD COLUMN IF NOT EXISTS converted_at_time TEXT
    `);
    await client.query(`
      ALTER TABLE beginners_course_participants
      ADD COLUMN IF NOT EXISTS converted_by_username TEXT REFERENCES users(username)
    `);
    await client.query(`
      ALTER TABLE beginners_course_participants
      ADD COLUMN IF NOT EXISTS converted_by_user_id BIGINT REFERENCES users(id)
    `);
    await client.query(`
      UPDATE beginners_course_participants
      SET origin_course_type = COALESCE(
        NULLIF(BTRIM(origin_course_type), ''),
        (
          SELECT beginners_courses.course_type
          FROM beginners_courses
          WHERE beginners_courses.id = beginners_course_participants.course_id
        ),
        'beginners'
      )
      WHERE origin_course_type IS NULL OR BTRIM(origin_course_type) = ''
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS range_presence_extensions (
        username TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
        active_until_date TEXT NOT NULL,
        active_until_time TEXT NOT NULL,
        updated_by_username TEXT NOT NULL REFERENCES users(username),
        updated_at_date TEXT NOT NULL,
        updated_at_time TEXT NOT NULL
      )
    `);
    await client.query(`
      ALTER TABLE suggestions
      ADD COLUMN IF NOT EXISTS submitted_by_user_id BIGINT REFERENCES users(id)
    `);
    await client.query(`
      ALTER TABLE suggestions
      ADD COLUMN IF NOT EXISTS updated_by_user_id BIGINT REFERENCES users(id)
    `);
    await client.query(`
      ALTER TABLE suggestions
      ADD COLUMN IF NOT EXISTS resolution_note TEXT NOT NULL DEFAULT ''
    `);
    await client.query(`
      ALTER TABLE guest_login_events
      ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cash'
    `);
    await client.query(`
      ALTER TABLE member_distance_sign_offs
      ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id)
    `);
    await client.query(`
      ALTER TABLE member_distance_sign_offs
      ADD COLUMN IF NOT EXISTS signed_off_by_user_id BIGINT REFERENCES users(id)
    `);
    await client.query(`
      ALTER TABLE member_distance_sign_offs
      ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    `);
    await client.query(`
      ALTER TABLE announcements
      ADD COLUMN IF NOT EXISTS amended_by_username TEXT REFERENCES users(username)
    `);
    await client.query(`
      ALTER TABLE announcements
      ADD COLUMN IF NOT EXISTS amended_at_date TEXT
    `);
    await client.query(`
      ALTER TABLE announcements
      ADD COLUMN IF NOT EXISTS amended_at_time TEXT
    `);
    await client.query(`
      ALTER TABLE announcements
      ADD COLUMN IF NOT EXISTS deleted_by_username TEXT REFERENCES users(username)
    `);
    await client.query(`
      ALTER TABLE announcements
      ADD COLUMN IF NOT EXISTS deleted_at_date TEXT
    `);
    await client.query(`
      ALTER TABLE announcements
      ADD COLUMN IF NOT EXISTS deleted_at_time TEXT
    `);
    await client.query(`
      ALTER TABLE announcements
      ADD COLUMN IF NOT EXISTS is_deleted INTEGER NOT NULL DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE lost_arrows
      ADD COLUMN IF NOT EXISTS found_seen_at_date TEXT
    `);
    await client.query(`
      ALTER TABLE lost_arrows
      ADD COLUMN IF NOT EXISTS fletching_colour_3 TEXT
    `);
    await client.query(`
      ALTER TABLE lost_arrows
      ADD COLUMN IF NOT EXISTS found_collection_location TEXT
    `);
    await client.query(`
      ALTER TABLE lost_arrows
      ADD COLUMN IF NOT EXISTS found_seen_at_time TEXT
    `);
    await client.query(`
      ALTER TABLE outdoor_table_entries
      ADD COLUMN IF NOT EXISTS award_252_20_sign_off_dates JSONB NOT NULL DEFAULT '["","",""]'::jsonb
    `);
    await client.query(`
      ALTER TABLE outdoor_table_entries
      ADD COLUMN IF NOT EXISTS award_252_30_sign_off_dates JSONB NOT NULL DEFAULT '["","",""]'::jsonb
    `);
    await client.query(`
      ALTER TABLE outdoor_table_entries
      ADD COLUMN IF NOT EXISTS award_252_40_sign_off_dates JSONB NOT NULL DEFAULT '["","",""]'::jsonb
    `);
    await client.query(`
      ALTER TABLE outdoor_table_entries
      ADD COLUMN IF NOT EXISTS award_252_50_sign_off_dates JSONB NOT NULL DEFAULT '["","",""]'::jsonb
    `);
    await client.query(`
      ALTER TABLE outdoor_table_entries
      ADD COLUMN IF NOT EXISTS award_252_60_sign_off_dates JSONB NOT NULL DEFAULT '["","",""]'::jsonb
    `);
    await client.query(`
      ALTER TABLE outdoor_table_entries
      ADD COLUMN IF NOT EXISTS award_252_80_sign_off_dates JSONB NOT NULL DEFAULT '["","",""]'::jsonb
    `);
    await client.query(`
      ALTER TABLE outdoor_table_entries
      ADD COLUMN IF NOT EXISTS award_252_100_sign_off_dates JSONB NOT NULL DEFAULT '["","",""]'::jsonb
    `);
    await client.query(`
      ALTER TABLE outdoor_table_entries
      ADD COLUMN IF NOT EXISTS archer_3rd_date TEXT NOT NULL DEFAULT ''
    `);
    await client.query(`
      ALTER TABLE outdoor_table_entries
      ADD COLUMN IF NOT EXISTS archer_2nd_date TEXT NOT NULL DEFAULT ''
    `);
    await client.query(`
      ALTER TABLE outdoor_table_entries
      ADD COLUMN IF NOT EXISTS archer_1st_date TEXT NOT NULL DEFAULT ''
    `);
    await client.query(`
      ALTER TABLE outdoor_table_entries
      ADD COLUMN IF NOT EXISTS bowman_3rd_date TEXT NOT NULL DEFAULT ''
    `);
    await client.query(`
      ALTER TABLE outdoor_table_entries
      ADD COLUMN IF NOT EXISTS bowman_2nd_date TEXT NOT NULL DEFAULT ''
    `);
    await client.query(`
      ALTER TABLE outdoor_table_entries
      ADD COLUMN IF NOT EXISTS bowman_1st_date TEXT NOT NULL DEFAULT ''
    `);
    await client.query(`
      ALTER TABLE outdoor_table_entries
      ADD COLUMN IF NOT EXISTS master_bowman_date TEXT NOT NULL DEFAULT ''
    `);
    await client.query(`
      ALTER TABLE outdoor_table_entries
      ADD COLUMN IF NOT EXISTS grand_master_bowman_date TEXT NOT NULL DEFAULT ''
    `);
    await client.query(`
      ALTER TABLE outdoor_table_entries
      ADD COLUMN IF NOT EXISTS elite_master_bowman_date TEXT NOT NULL DEFAULT ''
    `);

    const defaultRangeRulesContent = getDefaultRangeRulesContent();

    await client.query(
      `
        UPDATE range_rules_content
        SET
          indoor_rules_json = $1::jsonb,
          outdoor_rules_json = $2::jsonb,
          outdoor_lane_rules_json = $3::jsonb
        WHERE content_key = $4
          AND updated_at_date = $5
          AND updated_at_time = $6
          AND updated_by_username IS NULL
      `,
      [
        JSON.stringify(defaultRangeRulesContent.indoorRules),
        JSON.stringify(defaultRangeRulesContent.outdoorRules),
        JSON.stringify(defaultRangeRulesContent.outdoorLaneRules),
        "default",
        "1970-01-01",
        "00:00:00.000Z",
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
