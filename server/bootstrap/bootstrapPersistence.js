import {
  bootstrapSqliteBaseSchema,
  CLUB_EVENTS_TABLE_SQL,
  COACHING_SESSIONS_TABLE_SQL,
  COACHING_SESSION_BOOKINGS_TABLE_SQL,
  EVENT_BOOKINGS_TABLE_SQL,
  GUEST_LOGIN_EVENTS_TABLE_SQL,
  LOGIN_EVENTS_TABLE_SQL,
  TOURNAMENTS_TABLE_SQL,
  TOURNAMENT_REGISTRATIONS_TABLE_SQL,
  TOURNAMENT_SCORES_TABLE_SQL,
} from "../infrastructure/persistence/bootstrapSqliteBaseSchema.js";
import {
  bootstrapSqliteLegacyDateSupport,
  bootstrapSqliteRolesAndPermissions,
} from "../infrastructure/persistence/bootstrapSqliteLegacySupport.js";
import { bootstrapSqliteEquipmentCompatibility } from "../infrastructure/persistence/bootstrapSqliteEquipmentCompatibility.js";
import { bootstrapSqliteCourseScheduleCompatibility } from "../infrastructure/persistence/bootstrapSqliteCourseScheduleCompatibility.js";
import { bootstrapSqliteUserCompatibility } from "../infrastructure/persistence/bootstrapSqliteUserCompatibility.js";
import { bootstrapSqliteUserData } from "../infrastructure/persistence/bootstrapSqliteUserData.js";
import { getSeedUsers } from "../infrastructure/persistence/seedUsers.js";
import { runPostgresMigrations } from "../infrastructure/persistence/runPostgresMigrations.js";

export async function bootstrapPersistence({
  committeeRoleSeed,
  currentPermissionKeys,
  currentPermissionSqlPlaceholders,
  db,
  defaultEquipmentCupboardLabel,
  hashPassword,
  isPasswordHash,
  permissionDefinitions,
  runtime,
  systemRoleDefinitions,
}) {
  if (runtime.databaseEngine === "postgres") {
    await runPostgresMigrations({
      committeeRoleSeed,
      defaultEquipmentCupboardLabel,
      permissionDefinitions,
      pool: db.pool,
      seedUsers: getSeedUsers({
        hashPassword,
        isLive: runtime.isLive,
      }),
      systemRoleDefinitions,
    });

    return null;
  }

  bootstrapSqliteBaseSchema({
    db,
    defaultEquipmentCupboardLabel,
  });

  bootstrapSqliteRolesAndPermissions({
    currentPermissionKeys,
    currentPermissionSqlPlaceholders,
    db,
    permissionDefinitions,
    systemRoleDefinitions,
  });

  bootstrapSqliteLegacyDateSupport({
    clubEventsTableSql: CLUB_EVENTS_TABLE_SQL,
    coachingSessionBookingsTableSql: COACHING_SESSION_BOOKINGS_TABLE_SQL,
    coachingSessionsTableSql: COACHING_SESSIONS_TABLE_SQL,
    db,
    eventBookingsTableSql: EVENT_BOOKINGS_TABLE_SQL,
    guestLoginEventsTableSql: GUEST_LOGIN_EVENTS_TABLE_SQL,
    loginEventsTableSql: LOGIN_EVENTS_TABLE_SQL,
    tournamentsTableSql: TOURNAMENTS_TABLE_SQL,
    tournamentRegistrationsTableSql: TOURNAMENT_REGISTRATIONS_TABLE_SQL,
    tournamentScoresTableSql: TOURNAMENT_SCORES_TABLE_SQL,
  });

  bootstrapSqliteUserCompatibility({ db });
  bootstrapSqliteEquipmentCompatibility({ db });
  bootstrapSqliteCourseScheduleCompatibility({
    clubEventsTableSql: CLUB_EVENTS_TABLE_SQL,
    coachingSessionBookingsTableSql: COACHING_SESSION_BOOKINGS_TABLE_SQL,
    coachingSessionsTableSql: COACHING_SESSIONS_TABLE_SQL,
    db,
    eventBookingsTableSql: EVENT_BOOKINGS_TABLE_SQL,
    tournamentsTableSql: TOURNAMENTS_TABLE_SQL,
    tournamentRegistrationsTableSql: TOURNAMENT_REGISTRATIONS_TABLE_SQL,
    tournamentScoresTableSql: TOURNAMENT_SCORES_TABLE_SQL,
  });

  return bootstrapSqliteUserData({
    committeeRoleSeed,
    db,
    hashPassword,
    isLive: runtime.isLive,
    isPasswordHash,
  });
}

