import { querySingleValue } from "./localSyncQueryGateway.js";
import { upsertTournamentTemplates, upsertTournamentHandicapTables, upsertTournamentHandicapTableRows, upsertTournaments, upsertTournamentRegistrations, upsertTournamentRounds, upsertTournamentScores, upsertTournamentMatches } from "./localSyncTournamentGateway.js";
import { upsertUsers, tombstoneUser, upsertRoles, upsertPermissions } from "./localSyncMemberGateway.js";
import { upsertEquipmentStorageLocations, upsertClubEvents, upsertCoachingSessions, upsertAnnouncements, upsertEquipmentItems, resolveEquipmentCaseRelationships, applyBookingChange, upsertRangePresenceExtensionRows } from "./localSyncOperationalGateway.js";
import { upsertOutdoorTableRows, upsertIndoorTableRows, upsertGoldenRecordsMemberSyncRows, upsertGoldenRecordsIntegrationStatusRows, upsertGoldenRecordsLookupCacheRows } from "./localSyncAchievementGateway.js";
import { mergeLoginEventHistoryRow, mergeGuestLoginEventHistoryRow } from "./localSyncHistoryGateway.js";
import { upsertMemberDistanceSignOffRows, upsertCommitteeRoleRows, upsertCommitteeMeetingMinuteRows } from "./localSyncCommitteeGateway.js";
import { upsertBeginnersCourses, upsertBeginnersCourseParticipants, upsertBeginnersCourseLessons, upsertBeginnersCourseLessonCoaches } from "./localSyncCourseGateway.js";
import { applyFeedbackChange } from "../../domain/services/feedbackSyncApply.js";

export async function applyCollapsedChange({
  change,
  client,
  deactivatedRfidSuffix,
}) {
  switch (change.domain) {
    case "users":
      if (change.operation === "delete") {
        await tombstoneUser(
          client,
          change.payload.username,
          change.payload.rfid_tag,
          deactivatedRfidSuffix,
        );
        return;
      }
      await upsertUsers(client, [change.payload], deactivatedRfidSuffix);
      return;
    case "roles":
      if (change.operation === "delete") {
        await client.query(`DELETE FROM role_permissions WHERE role_key = $1`, [change.payload.role_key]);
        await client.query(`DELETE FROM roles WHERE role_key = $1`, [change.payload.role_key]);
        return;
      }
      await upsertRoles(client, [change.payload]);
      return;
    case "permissions":
      if (change.operation === "delete") {
        await client.query(`DELETE FROM permissions WHERE permission_key = $1`, [
          change.payload.permission_key,
        ]);
        return;
      }
      await upsertPermissions(client, [change.payload]);
      return;
    case "role_permissions":
      if (change.operation === "delete") {
        await client.query(
          `
            DELETE FROM role_permissions
            WHERE role_key = $1 AND permission_key = $2
          `,
          [change.payload.role_key, change.payload.permission_key],
        );
        return;
      }
      await client.query(
        `
          INSERT INTO role_permissions (role_key, permission_key)
          VALUES ($1, $2)
          ON CONFLICT (role_key, permission_key) DO NOTHING
        `,
        [change.payload.role_key, change.payload.permission_key],
      );
      return;
    case "user_types":
      if (change.operation === "delete") {
        await client.query(`DELETE FROM user_types WHERE username = $1`, [change.payload.username]);
        return;
      }
      await client.query(
        `
          INSERT INTO user_types (username, user_type, user_id)
          VALUES (
            $1,
            $2,
            (SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1)
          )
          ON CONFLICT (username) DO UPDATE SET
            user_type = EXCLUDED.user_type,
            user_id = EXCLUDED.user_id
        `,
        [change.payload.username, change.payload.user_type],
      );
      return;
    case "user_disciplines":
      if (change.operation === "delete") {
        await client.query(
          `
            DELETE FROM user_disciplines
            WHERE username = $1 AND discipline = $2
          `,
          [change.payload.username, change.payload.discipline],
        );
        return;
      }
      await client.query(
        `
          INSERT INTO user_disciplines (username, discipline, user_id)
          VALUES (
            $1,
            $2,
            (SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1)
          )
          ON CONFLICT (username, discipline) DO NOTHING
        `,
        [change.payload.username, change.payload.discipline],
      );
      return;
    case "tournament_templates":
      if (change.operation === "delete") {
        await client.query(`DELETE FROM tournament_templates WHERE template_key = $1`, [change.payload.template_key]);
        return;
      }
      await upsertTournamentTemplates(client, [change.payload]);
      return;
    case "tournament_handicap_tables":
      if (change.operation === "delete") {
        await client.query(`DELETE FROM tournament_handicap_tables WHERE table_key = $1`, [change.payload.table_key]);
        return;
      }
      await upsertTournamentHandicapTables(client, [change.payload]);
      return;
    case "tournament_handicap_table_rows":
      if (change.operation === "delete") {
        await client.query(`
          DELETE FROM tournament_handicap_table_rows
          WHERE table_id = (SELECT id FROM tournament_handicap_tables WHERE table_key = $1 LIMIT 1)
            AND handicap_value = $2
        `, [change.payload.table_key, Number(change.payload.handicap_value)]);
        return;
      }
      await upsertTournamentHandicapTableRows(client, [change.payload]);
      return;
    case "tournaments":
      if (change.operation === "delete") {
        const existing = await querySingleValue(client,
          `SELECT sync_is_cloud_managed FROM tournaments WHERE sync_id = $1 FOR UPDATE`,
          [change.payload.sync_id]);
        if (existing && Number(existing.sync_is_cloud_managed) !== 1) {
          throw new Error(`Tournament delete refused: ${change.payload.sync_id} is not Cloud-managed.`);
        }
        await client.query(`DELETE FROM tournaments WHERE sync_id = $1 AND sync_is_cloud_managed = 1`, [change.payload.sync_id]);
        return;
      }
      await upsertTournaments(client, [change.payload]);
      return;
    case "tournament_registrations":
      if (change.operation === "delete") {
        await client.query(`
          DELETE FROM tournament_registrations
          WHERE tournament_id = (SELECT id FROM tournaments WHERE sync_id = $1 LIMIT 1)
            AND LOWER(member_username) = LOWER($2)
        `, [change.payload.tournament_sync_id, change.payload.member_username]);
        return;
      }
      await upsertTournamentRegistrations(client, [change.payload]);
      return;
    case "tournament_rounds":
      if (change.operation === "delete") {
        await client.query(`
          DELETE FROM tournament_rounds
          WHERE tournament_id = (SELECT id FROM tournaments WHERE sync_id = $1 LIMIT 1)
            AND round_number = $2
        `, [change.payload.tournament_sync_id, Number(change.payload.round_number)]);
        return;
      }
      await upsertTournamentRounds(client, [change.payload]);
      return;
    case "tournament_scores":
      if (change.operation === "delete") {
        await client.query(`
          DELETE FROM tournament_scores
          WHERE tournament_id = (SELECT id FROM tournaments WHERE sync_id = $1 LIMIT 1)
            AND round_number = $2 AND LOWER(member_username) = LOWER($3)
        `, [change.payload.tournament_sync_id, Number(change.payload.round_number), change.payload.member_username]);
        return;
      }
      await upsertTournamentScores(client, [change.payload]);
      return;
    case "tournament_matches":
      if (change.operation === "delete") {
        await client.query(`
          DELETE FROM tournament_matches
          WHERE tournament_id = (SELECT id FROM tournaments WHERE sync_id = $1 LIMIT 1)
            AND round_number = $2 AND match_number = $3
        `, [change.payload.tournament_sync_id, Number(change.payload.round_number), Number(change.payload.match_number)]);
        return;
      }
      await upsertTournamentMatches(client, [change.payload]);
      return;
    case "beginners_courses":
      if (change.operation === "delete") {
        await client.query(`DELETE FROM beginners_courses WHERE sync_id = $1`, [change.payload.sync_id]);
        return;
      }
      await upsertBeginnersCourses(client, [change.payload]);
      return;
    case "beginners_course_participants":
      if (change.operation === "delete") {
        await client.query(`DELETE FROM beginners_course_participants WHERE sync_id = $1`, [change.payload.sync_id]);
        return;
      }
      await upsertBeginnersCourseParticipants(client, [change.payload]);
      return;
    case "beginners_course_lessons":
      if (change.operation === "delete") {
        await client.query(`DELETE FROM beginners_course_lessons WHERE sync_id = $1`, [change.payload.sync_id]);
        return;
      }
      await upsertBeginnersCourseLessons(client, [change.payload]);
      return;
    case "beginners_course_lesson_coaches":
      if (change.operation === "delete") {
        await client.query(
          `DELETE FROM beginners_course_lesson_coaches WHERE lesson_id = (SELECT id FROM beginners_course_lessons WHERE sync_id = $1 LIMIT 1) AND coach_username = $2`,
          [change.payload.lesson_sync_id, change.payload.coach_username],
        );
        return;
      }
      await upsertBeginnersCourseLessonCoaches(client, [change.payload]);
      return;
    case "club_events":
      if (change.operation === "delete") {
        await client.query(`DELETE FROM club_events WHERE sync_id = $1`, [change.payload.sync_id]);
        return;
      }
      await upsertClubEvents(client, [change.payload]);
      return;
    case "coaching_sessions":
      if (change.operation === "delete") {
        await client.query(`DELETE FROM coaching_sessions WHERE sync_id = $1`, [change.payload.sync_id]);
        return;
      }
      await upsertCoachingSessions(client, [change.payload]);
      return;
    case "announcements":
      if (change.operation === "delete") {
        return;
      }
      await upsertAnnouncements(client, [change.payload]);
      return;
    case "equipment_storage_locations":
      if (change.operation === "delete") {
        await client.query(
          `DELETE FROM equipment_storage_locations WHERE sync_id = $1`,
          [change.payload.sync_id],
        );
        return;
      }
      await upsertEquipmentStorageLocations(client, [change.payload]);
      return;
    case "equipment_items":
      if (change.operation === "delete") {
        await client.query(`DELETE FROM equipment_items WHERE sync_id = $1`, [change.payload.sync_id]);
        return;
      }
      await upsertEquipmentItems(client, [change.payload]);
      await resolveEquipmentCaseRelationships(client, [change.payload]);
      return;
    case "golden_records_member_sync":
      if (change.operation === "delete") {
        await client.query(
          `DELETE FROM golden_records_member_sync WHERE username = $1`,
          [change.payload.username],
        );
        return;
      }
      await upsertGoldenRecordsMemberSyncRows(client, [change.payload]);
      return;

    case "golden_records_integration_status":
      if (change.operation === "delete") {
        await client.query(
          `DELETE FROM golden_records_integration_status WHERE status_key = $1`,
          [change.payload.status_key],
        );
        return;
      }
      await upsertGoldenRecordsIntegrationStatusRows(client, [change.payload]);
      return;

    case "golden_records_lookup_cache":
      if (change.operation === "delete") {
        await client.query(
          `DELETE FROM golden_records_lookup_cache WHERE lookup_type = $1`,
          [change.payload.lookup_type],
        );
        return;
      }
      await upsertGoldenRecordsLookupCacheRows(client, [change.payload]);
      return;

    case "outdoor_table_entries":
      if (change.operation === "delete") {
        await client.query(
          `
            DELETE FROM outdoor_table_entries
            WHERE season_year = $1
              AND LOWER(archer_username) = LOWER($2)
              AND LOWER(bow_type) = LOWER($3)
          `,
          [
            change.payload.season_year,
            change.payload.archer_username,
            change.payload.bow_type,
          ],
        );
        return;
      }
      await upsertOutdoorTableRows(client, [change.payload]);
      return;

    case "indoor_table_entries":
      if (change.operation === "delete") {
        await client.query(`DELETE FROM indoor_table_entries WHERE season_year = $1
          AND LOWER(archer_username) = LOWER($2) AND LOWER(bow_type) = LOWER($3)`,
          [change.payload.season_year, change.payload.archer_username, change.payload.bow_type]);
        return;
      }
      await upsertIndoorTableRows(client, [change.payload]);
      return;

    case "committee_meeting_minutes":
      if (change.operation === "delete") {
        await client.query(
          `DELETE FROM committee_meeting_minutes WHERE sync_id = $1`,
          [change.payload.sync_id],
        );
        return;
      }
      await upsertCommitteeMeetingMinuteRows(client, [change.payload]);
      return;

    case "member_questions":
    case "suggestions":
      await applyFeedbackChange(client, change);
      return;

    case "committee_roles":
      if (change.operation === "delete") {
        await client.query(
          `DELETE FROM committee_roles WHERE role_key = $1`,
          [change.payload.role_key],
        );
        return;
      }
      await upsertCommitteeRoleRows(client, [change.payload]);
      return;

    case "member_distance_sign_offs":
      if (change.operation === "delete") {
        await client.query(
          `
            DELETE FROM member_distance_sign_offs
            WHERE LOWER(username) = LOWER($1)
              AND LOWER(discipline) = LOWER($2)
              AND distance_yards = $3
          `,
          [
            change.payload.username,
            change.payload.discipline,
            Number(change.payload.distance_yards),
          ],
        );
        return;
      }
      await upsertMemberDistanceSignOffRows(client, [change.payload]);
      return;

    case "range_presence_extensions":
      if (change.operation === "delete") {
        await client.query(`DELETE FROM range_presence_extensions WHERE username = $1`, [change.payload.username]);
        return;
      }
      await upsertRangePresenceExtensionRows(client, [change.payload]);
      return;
    case "login_events":
      await mergeLoginEventHistoryRow(client, change.payload);
      return;
    case "guest_login_events":
      await mergeGuestLoginEventHistoryRow(client, change.payload);
      return;
    case "event_bookings":
      await applyBookingChange(client, "event", change);
      return;
    case "coaching_session_bookings":
      await applyBookingChange(client, "coaching", change);
      return;
    default:
      return;
  }
}
