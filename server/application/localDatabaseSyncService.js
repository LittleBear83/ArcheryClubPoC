import {
  upsertTournamentTemplates, upsertTournamentHandicapTables, upsertTournamentHandicapTableRows,
  upsertTournaments, upsertTournamentRegistrations, upsertTournamentRounds,
  upsertTournamentScores, upsertTournamentMatches, reconcileTournamentSnapshotDeletes,
} from "../infrastructure/persistence/localSyncTournamentGateway.js";
import {
  upsertUsers, upsertRoles, upsertPermissions, replaceRolePermissions,
  replaceUserTypes, replaceUserDisciplines, deleteMissingRolesAndPermissions,
  tombstoneMissingUsers,
} from "../infrastructure/persistence/localSyncMemberGateway.js";
import {
  upsertEquipmentStorageLocations, upsertClubEvents, upsertCoachingSessions,
  upsertAnnouncements, upsertEquipmentItems, resolveEquipmentCaseRelationships,
  deleteMissingSnapshotRows, deleteUnreferencedEquipmentItems,
  deleteUnseenMissingAnnouncements, upsertBookingSnapshotRows,
  deleteMissingBookingSnapshotRows, upsertRangePresenceExtensionRows,
  reapplyPendingBookingOverlay,
} from "../infrastructure/persistence/localSyncOperationalGateway.js";
import {
  upsertOutdoorTableRows, deleteMissingOutdoorTableRows, upsertIndoorTableRows,
  deleteMissingIndoorTableRows, upsertGoldenRecordsMemberSyncRows,
  upsertGoldenRecordsIntegrationStatusRows, upsertGoldenRecordsLookupCacheRows,
} from "../infrastructure/persistence/localSyncAchievementGateway.js";
import { reconcileLegacyHistorySnapshot } from "../infrastructure/persistence/localSyncHistoryGateway.js";
import {
  upsertMemberDistanceSignOffRows, deleteMissingMemberDistanceSignOffRows,
  upsertCommitteeRoleRows, upsertCommitteeMeetingMinuteRows,
} from "../infrastructure/persistence/localSyncCommitteeGateway.js";
import { replaceCourseReportingGraph } from "../infrastructure/persistence/localSyncCourseGateway.js";
import { applyCollapsedChange } from "../infrastructure/persistence/localSyncChangeGateway.js";
import { setPullApplyMode } from "../infrastructure/persistence/localSyncQueryGateway.js";
import { reconcileFeedbackSnapshot } from "../domain/services/feedbackSyncApply.js";
import {
  isValidPublicationCursor,
  PUBLICATION_FEED_VERSION,
} from "../../shared/syncPublicationProtocol.js";

const SYNC_STATE_KEY = "local_machine_sync";
export const PUBLICATION_SYNC_STATE_KEY = "local_machine_publication_sync_v2";
export { isValidPublicationCursor, PUBLICATION_FEED_VERSION };
export const REPLICATED_DOMAINS = [
  "users", "user_types", "user_disciplines", "roles", "permissions",
  "role_permissions", "club_events", "coaching_sessions", "event_bookings",
  "coaching_session_bookings", "announcements", "equipment_storage_locations",
  "equipment_items", "login_events", "guest_login_events",
  "range_presence_extensions", "beginners_courses",
  "beginners_course_participants", "beginners_course_lessons",
  "beginners_course_lesson_coaches",
  "golden_records_member_sync",
  "golden_records_integration_status",
  "golden_records_lookup_cache",
  "outdoor_table_entries",
  "indoor_table_entries",
  "member_distance_sign_offs",
  "committee_roles",
  "committee_meeting_minutes",
  "member_questions",
  "suggestions",
  "tournament_templates",
  "tournament_handicap_tables",
  "tournament_handicap_table_rows",
  "tournaments",
  "tournament_registrations",
  "tournament_rounds",
  "tournament_scores",
  "tournament_matches",
];
const PUBLICATION_SNAPSHOT_PROPERTIES = [
  "users", "userTypes", "userDisciplines", "roles", "permissions",
  "rolePermissions", "clubEvents", "coachingSessions", "eventBookings",
  "coachingSessionBookings", "announcements", "equipmentStorageLocations",
  "equipmentItems", "loginEvents", "guestLoginEvents",
  "rangePresenceExtensions", "beginnersCourses", "beginnersCourseParticipants",
  "beginnersCourseLessons", "beginnersCourseLessonCoaches",
  "tournamentTemplates", "tournamentHandicapTables", "tournamentHandicapTableRows",
  "tournaments", "tournamentRegistrations", "tournamentRounds",
  "tournamentScores", "tournamentMatches",
];

function requirePublicationSyncState(stateEntry) {
  const state = stateEntry?.state;
  if (!state
    || state.feedVersion !== PUBLICATION_FEED_VERSION
    || !isValidPublicationCursor(state.publicationCheckpoint)) {
    throw new Error(
      "Publication sync v2 requires an initialized v2 baseline; refusing to reuse or convert the v1 checkpoint.",
    );
  }
  return {
    feedVersion: state.feedVersion,
    publicationCheckpoint: state.publicationCheckpoint,
  };
}

function collapseChanges(changes = []) {
  const latestByKey = new Map();

  for (const change of changes) {
    latestByKey.set(`${change.domain}:${change.recordKey}`, change);
  }

  const upsertOrder = new Map([
    ["roles", 1],
    ["permissions", 2],
    ["role_permissions", 3],
    ["users", 4],
    ["user_types", 5],
    ["user_disciplines", 6],
    ["golden_records_member_sync", 7],
    ["golden_records_integration_status", 8],
    ["golden_records_lookup_cache", 9],
    ["outdoor_table_entries", 10],
    ["indoor_table_entries", 10],
    ["equipment_storage_locations", 11],
    ["equipment_items", 12],
    ["beginners_courses", 13],
    ["beginners_course_lessons", 14],
    ["beginners_course_lesson_coaches", 15],
    ["beginners_course_participants", 16],
    ["club_events", 17],
    ["coaching_sessions", 18],
    ["announcements", 19],
    ["range_presence_extensions", 20],
    ["login_events", 21],
    ["guest_login_events", 22],
    ["event_bookings", 23],
    ["coaching_session_bookings", 24],
    ["committee_roles", 25],
    ["member_distance_sign_offs", 26],
    ["committee_meeting_minutes", 27],
    ["member_questions", 27],
    ["suggestions", 27],
    ["tournament_templates", 28],
    ["tournament_handicap_tables", 29],
    ["tournament_handicap_table_rows", 30],
    ["tournaments", 31],
    ["tournament_registrations", 32],
    ["tournament_rounds", 33],
    ["tournament_scores", 34],
    ["tournament_matches", 35],
  ]);
  const deleteOrder = new Map([
    ["coaching_session_bookings", 1],
    ["event_bookings", 2],
    ["beginners_course_lesson_coaches", 3],
    ["beginners_course_lessons", 4],
    ["beginners_course_participants", 5],
    ["equipment_items", 6],
    ["club_events", 7],
    ["coaching_sessions", 8],
    ["beginners_courses", 9],
    ["range_presence_extensions", 10],
    ["equipment_storage_locations", 11],
    ["golden_records_member_sync", 12],
    ["golden_records_integration_status", 13],
    ["golden_records_lookup_cache", 14],
    ["outdoor_table_entries", 15],
    ["indoor_table_entries", 15],
    ["user_disciplines", 16],
    ["user_types", 17],
    ["role_permissions", 18],
    ["users", 19],
    ["roles", 20],
    ["permissions", 21],
    ["member_distance_sign_offs", 22],
    ["committee_roles", 23],
    ["committee_meeting_minutes", 24],
    ["member_questions", 24],
    ["suggestions", 24],
    ["tournament_matches", 1],
    ["tournament_scores", 2],
    ["tournament_rounds", 3],
    ["tournament_registrations", 4],
    ["tournaments", 5],
    ["tournament_handicap_table_rows", 6],
    ["tournament_handicap_tables", 7],
    ["tournament_templates", 8],
  ]);

  const finalChanges = [...latestByKey.values()];
  const deletedTournaments = new Set(finalChanges
    .filter((change) => change.domain === "tournaments" && change.operation === "delete")
    .map((change) => change.payload.sync_id));
  const deletedHandicapTables = new Set(finalChanges
    .filter((change) => change.domain === "tournament_handicap_tables" && change.operation === "delete")
    .map((change) => change.payload.table_key));
  const tournamentChildren = new Set([
    "tournament_registrations", "tournament_rounds", "tournament_scores", "tournament_matches",
  ]);
  // A final parent tombstone makes child upserts obsolete, including when the
  // parent never existed locally. Keep child deletes for existing local graphs.
  return finalChanges.filter((change) => change.operation !== "upsert" || !(
    (tournamentChildren.has(change.domain) && deletedTournaments.has(change.payload.tournament_sync_id))
    || (change.domain === "tournament_handicap_table_rows" && deletedHandicapTables.has(change.payload.table_key))
  )).sort((left, right) => {
    if (left.operation !== right.operation) {
      return left.operation === "upsert" ? -1 : 1;
    }

    const order = left.operation === "upsert" ? upsertOrder : deleteOrder;
    return (order.get(left.domain) ?? 99) - (order.get(right.domain) ?? 99);
  });
}

async function applyOperationalSnapshot({
  client,
  snapshot,
  syncGateway,
}) {
  const hasCourseGraph = [
    "beginnersCourses",
    "beginnersCourseLessons",
    "beginnersCourseLessonCoaches",
    "beginnersCourseParticipants",
  ].every((property) => Object.hasOwn(snapshot, property));

  if (Object.hasOwn(snapshot, "memberQuestions")) {
    await reconcileFeedbackSnapshot(client, "member_questions", snapshot.memberQuestions);
  }
  if (Object.hasOwn(snapshot, "suggestions")) {
    await reconcileFeedbackSnapshot(client, "suggestions", snapshot.suggestions);
  }

  if (Object.hasOwn(snapshot, "equipmentStorageLocations")) {
    await upsertEquipmentStorageLocations(client, snapshot.equipmentStorageLocations);
    await deleteMissingSnapshotRows({
      client,
      incomingKeys: snapshot.equipmentStorageLocations.map((entry) => entry.sync_id),
      tableName: "equipment_storage_locations",
    });
  }

  if (Object.hasOwn(snapshot, "clubEvents")) {
    await upsertClubEvents(client, snapshot.clubEvents);
    await deleteMissingSnapshotRows({
      client,
      incomingKeys: snapshot.clubEvents.map((entry) => entry.sync_id),
      tableName: "club_events",
    });
  }

  if (Object.hasOwn(snapshot, "coachingSessions")) {
    await upsertCoachingSessions(client, snapshot.coachingSessions);
    await deleteMissingSnapshotRows({
      client,
      incomingKeys: snapshot.coachingSessions.map((entry) => entry.sync_id),
      tableName: "coaching_sessions",
    });
  }

  if (Object.hasOwn(snapshot, "announcements")) {
    await upsertAnnouncements(client, snapshot.announcements);
  }

  const hasEquipmentItems = Object.hasOwn(snapshot, "equipmentItems");

  if (hasEquipmentItems) {
    await upsertEquipmentItems(client, snapshot.equipmentItems);
    await resolveEquipmentCaseRelationships(client, snapshot.equipmentItems);
  }

  if (hasCourseGraph) {
    await replaceCourseReportingGraph(client, snapshot);
  }

  if (hasEquipmentItems) {
    await deleteMissingSnapshotRows({
      client,
      incomingKeys: snapshot.equipmentItems.map((entry) => entry.sync_id),
      tableName: "equipment_items",
    });
  }

  if (Object.hasOwn(snapshot, "eventBookings")) {
    await upsertBookingSnapshotRows(client, "event", snapshot.eventBookings);
    await deleteMissingBookingSnapshotRows(client, "event", snapshot.eventBookings);
  }

  if (Object.hasOwn(snapshot, "coachingSessionBookings")) {
    await upsertBookingSnapshotRows(client, "coaching", snapshot.coachingSessionBookings);
    await deleteMissingBookingSnapshotRows(client, "coaching", snapshot.coachingSessionBookings);
  }

  if (Object.hasOwn(snapshot, "rangePresenceExtensions")) {
    await upsertRangePresenceExtensionRows(client, snapshot.rangePresenceExtensions);
    await deleteMissingSnapshotRows({
      client,
      incomingKeys: snapshot.rangePresenceExtensions.map((entry) => entry.username),
      keyColumn: "username",
      tableName: "range_presence_extensions",
    });
  }

  if (Object.hasOwn(snapshot, "loginEvents")) {
    await reconcileLegacyHistorySnapshot(client, "login", snapshot.loginEvents);
  }

  if (Object.hasOwn(snapshot, "guestLoginEvents")) {
    await reconcileLegacyHistorySnapshot(client, "guest", snapshot.guestLoginEvents);
  }

  if (Object.hasOwn(snapshot, "committeeRoles")) {
    await upsertCommitteeRoleRows(client, snapshot.committeeRoles);
    await deleteMissingSnapshotRows({
      client,
      incomingKeys: snapshot.committeeRoles.map((row) => row.role_key),
      keyColumn: "role_key",
      tableName: "committee_roles",
    });
  }

  if (Object.hasOwn(snapshot, "committeeMeetingMinutes")) {
    await upsertCommitteeMeetingMinuteRows(
      client,
      snapshot.committeeMeetingMinutes,
    );
    await deleteMissingSnapshotRows({
      client,
      incomingKeys: snapshot.committeeMeetingMinutes.map(
        (row) => row.sync_id,
      ),
      tableName: "committee_meeting_minutes",
    });
  }

  if (Object.hasOwn(snapshot, "memberDistanceSignOffs")) {
    await upsertMemberDistanceSignOffRows(client, snapshot.memberDistanceSignOffs);
    await deleteMissingMemberDistanceSignOffRows(
      client,
      snapshot.memberDistanceSignOffs,
    );
  }

  await reapplyPendingBookingOverlay(client, syncGateway);
}

async function reconcilePublicationSnapshot({ client, deactivatedRfidSuffix, snapshot }) {
  await upsertUsers(client, snapshot.users, deactivatedRfidSuffix);

  if (Object.hasOwn(snapshot, "memberQuestions")) {
    await reconcileFeedbackSnapshot(client, "member_questions", snapshot.memberQuestions);
  }
  if (Object.hasOwn(snapshot, "suggestions")) {
    await reconcileFeedbackSnapshot(client, "suggestions", snapshot.suggestions);
  }

  await upsertRoles(client, snapshot.roles);
  await upsertPermissions(client, snapshot.permissions);
  await replaceRolePermissions(client, snapshot.rolePermissions);
  await replaceUserTypes(client, snapshot.userTypes);
  await replaceUserDisciplines(client, snapshot.userDisciplines);

  await upsertTournamentTemplates(client, snapshot.tournamentTemplates);
  await upsertTournamentHandicapTables(client, snapshot.tournamentHandicapTables);
  await upsertTournamentHandicapTableRows(client, snapshot.tournamentHandicapTableRows);
  await upsertTournaments(client, snapshot.tournaments);
  await upsertTournamentRegistrations(client, snapshot.tournamentRegistrations);
  await upsertTournamentRounds(client, snapshot.tournamentRounds);
  await upsertTournamentScores(client, snapshot.tournamentScores);
  await upsertTournamentMatches(client, snapshot.tournamentMatches);

  await upsertEquipmentStorageLocations(client, snapshot.equipmentStorageLocations);
  await upsertClubEvents(client, snapshot.clubEvents);
  await upsertCoachingSessions(client, snapshot.coachingSessions);
  await upsertAnnouncements(client, snapshot.announcements);
  await upsertEquipmentItems(client, snapshot.equipmentItems);
  await resolveEquipmentCaseRelationships(client, snapshot.equipmentItems);
  await replaceCourseReportingGraph(client, snapshot);
  await upsertBookingSnapshotRows(client, "event", snapshot.eventBookings);
  await upsertBookingSnapshotRows(client, "coaching", snapshot.coachingSessionBookings);
  await upsertRangePresenceExtensionRows(client, snapshot.rangePresenceExtensions);
  await reconcileLegacyHistorySnapshot(client, "login", snapshot.loginEvents);
  await reconcileLegacyHistorySnapshot(client, "guest", snapshot.guestLoginEvents);

  if (Object.hasOwn(snapshot, "goldenRecordsMemberSync")) {
    await upsertGoldenRecordsMemberSyncRows(
      client,
      snapshot.goldenRecordsMemberSync,
    );
  }

  if (Object.hasOwn(snapshot, "goldenRecordsIntegrationStatus")) {
    await upsertGoldenRecordsIntegrationStatusRows(
      client,
      snapshot.goldenRecordsIntegrationStatus,
    );
  }

  if (Object.hasOwn(snapshot, "goldenRecordsLookupCache")) {
    await upsertGoldenRecordsLookupCacheRows(
      client,
      snapshot.goldenRecordsLookupCache,
    );
  }

  if (Object.hasOwn(snapshot, "outdoorTableEntries")) {
    await upsertOutdoorTableRows(
      client,
      snapshot.outdoorTableEntries,
    );
  }
  if (Object.hasOwn(snapshot, "indoorTableEntries")) {
    await upsertIndoorTableRows(client, snapshot.indoorTableEntries);
  }

  if (Object.hasOwn(snapshot, "committeeRoles")) {
    await upsertCommitteeRoleRows(client, snapshot.committeeRoles);
  }

  if (Object.hasOwn(snapshot, "committeeMeetingMinutes")) {
    await upsertCommitteeMeetingMinuteRows(
      client,
      snapshot.committeeMeetingMinutes,
    );
  }

  if (Object.hasOwn(snapshot, "memberDistanceSignOffs")) {
    await upsertMemberDistanceSignOffRows(
      client,
      snapshot.memberDistanceSignOffs,
    );
  }

  // Dependents first. Histories and local-only tables are deliberately never
  // truncated; referenced replicated parents are retained where deletion is unsafe.
  await deleteMissingBookingSnapshotRows(client, "event", snapshot.eventBookings);
  await deleteMissingBookingSnapshotRows(client, "coaching", snapshot.coachingSessionBookings);
  await deleteMissingSnapshotRows({ client, incomingKeys: snapshot.clubEvents.map((row) => row.sync_id), tableName: "club_events" });
  await deleteMissingSnapshotRows({ client, incomingKeys: snapshot.coachingSessions.map((row) => row.sync_id), tableName: "coaching_sessions" });
  await deleteMissingSnapshotRows({ client, incomingKeys: snapshot.rangePresenceExtensions.map((row) => row.username), keyColumn: "username", tableName: "range_presence_extensions" });

  await deleteUnreferencedEquipmentItems(client, snapshot.equipmentItems);
  await deleteMissingSnapshotRows({ client, incomingKeys: snapshot.equipmentStorageLocations.map((row) => row.sync_id), tableName: "equipment_storage_locations" });

  if (Object.hasOwn(snapshot, "goldenRecordsMemberSync")) {
    await deleteMissingSnapshotRows({
      client,
      incomingKeys: snapshot.goldenRecordsMemberSync.map((row) => row.username),
      keyColumn: "username",
      tableName: "golden_records_member_sync",
    });
  }

  if (Object.hasOwn(snapshot, "goldenRecordsIntegrationStatus")) {
    await deleteMissingSnapshotRows({
      client,
      incomingKeys: snapshot.goldenRecordsIntegrationStatus.map((row) => row.status_key),
      keyColumn: "status_key",
      tableName: "golden_records_integration_status",
    });
  }

  if (Object.hasOwn(snapshot, "goldenRecordsLookupCache")) {
    await deleteMissingSnapshotRows({
      client,
      incomingKeys: snapshot.goldenRecordsLookupCache.map((row) => row.lookup_type),
      keyColumn: "lookup_type",
      tableName: "golden_records_lookup_cache",
    });
  }

  if (Object.hasOwn(snapshot, "outdoorTableEntries")) {
    await deleteMissingOutdoorTableRows(client, snapshot.outdoorTableEntries);
  }
  if (Object.hasOwn(snapshot, "indoorTableEntries")) {
    await deleteMissingIndoorTableRows(client, snapshot.indoorTableEntries);
  }

  if (Object.hasOwn(snapshot, "memberDistanceSignOffs")) {
    await deleteMissingMemberDistanceSignOffRows(
      client,
      snapshot.memberDistanceSignOffs,
    );
  }

  if (Object.hasOwn(snapshot, "committeeRoles")) {
    await deleteMissingSnapshotRows({
      client,
      incomingKeys: snapshot.committeeRoles.map((row) => row.role_key),
      keyColumn: "role_key",
      tableName: "committee_roles",
    });
  }

  if (Object.hasOwn(snapshot, "committeeMeetingMinutes")) {
    await deleteMissingSnapshotRows({
      client,
      incomingKeys: snapshot.committeeMeetingMinutes.map(
        (row) => row.sync_id,
      ),
      tableName: "committee_meeting_minutes",
    });
  }

  await reconcileTournamentSnapshotDeletes(client, snapshot);

  await deleteUnseenMissingAnnouncements(client, snapshot.announcements);
  await deleteMissingRolesAndPermissions(client, snapshot.roles, snapshot.permissions);
  await tombstoneMissingUsers(client, snapshot.users, deactivatedRfidSuffix);
}

export async function applyAuthSnapshot({
  client,
  deactivatedRfidSuffix,
  snapshot,
  syncGateway,
}) {
  await upsertUsers(client, snapshot.users ?? [], deactivatedRfidSuffix);

  await upsertRoles(client, snapshot.roles ?? []);
  await upsertPermissions(client, snapshot.permissions ?? []);

  await replaceRolePermissions(client, snapshot.rolePermissions ?? []);
  await replaceUserTypes(client, snapshot.userTypes ?? []);
  await replaceUserDisciplines(client, snapshot.userDisciplines ?? []);

  await deleteMissingRolesAndPermissions(client, snapshot.roles ?? [], snapshot.permissions ?? []);
  await tombstoneMissingUsers(client, snapshot.users ?? [], deactivatedRfidSuffix);
  await applyOperationalSnapshot({
    client,
    snapshot,
    syncGateway,
  });
}

export async function applyAuthChanges({
  changes,
  client,
  deactivatedRfidSuffix,
  syncGateway,
}) {
  const appliedDomains = new Set();
  for (const change of collapseChanges(changes)) {
    // Count writes made by the actual application path, including its no-op
    // guards, rather than treating every incoming domain as an applied change.
    let wroteRows = false;
    const trackingClient = {
      async query(...args) {
        const result = await client.query(...args);
        if (/^\s*(INSERT|UPDATE|DELETE)\b/i.test(String(args[0])) && result.rowCount > 0) {
          wroteRows = true;
        }
        return result;
      },
    };
    await applyCollapsedChange({
      change,
      client: trackingClient,
      deactivatedRfidSuffix,
    });
    if (wroteRows) appliedDomains.add(change.domain);
  }

  await reapplyPendingBookingOverlay(client, syncGateway);
  return [...appliedDomains];
}

export async function applyPulledSyncResponse({
  client,
  currentCheckpoint,
  deactivatedRfidSuffix,
  pullResponse,
  syncGateway,
  onIncrementalApplied,
}) {
  let appliedDomains = [];
  await client.query("BEGIN");

  try {
    await setPullApplyMode(client);

    if (pullResponse.mode === "snapshot") {
      await applyAuthSnapshot({
        client,
        deactivatedRfidSuffix,
        snapshot: pullResponse.snapshot,
        syncGateway,
      });
    } else {
      appliedDomains = await applyAuthChanges({
        changes: pullResponse.changes ?? [],
        client,
        deactivatedRfidSuffix,
        syncGateway,
      });
    }

    await writeSyncAttemptState({
      client,
      syncGateway,
      values: {
        currentCheckpoint: Number(pullResponse.checkpoint ?? currentCheckpoint ?? 0),
        lastError: null,
        lastSuccessfulAt: new Date().toISOString(),
        syncServerVersion: pullResponse.serverVersion ?? "sync-v1",
      },
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  // This runs outside the database transaction and its failure path. A hint
  // delivery failure must never roll back or mark a committed sync as failed.
  if (appliedDomains.length > 0 && onIncrementalApplied) {
    try { await onIncrementalApplied(appliedDomains); } catch { /* Best-effort invalidation. */ }
  }
}

export async function readPublicationSyncState({ syncGateway, client }) {
  return requirePublicationSyncState(
    await syncGateway.readLocalState(PUBLICATION_SYNC_STATE_KEY, client),
  );
}

export async function drainPendingOutboxCommands({ batchSize, pushEvents, syncGateway }) {
  let batches = 0;
  let resolvedEvents = 0;
  for (;;) {
    const events = await syncGateway.listPendingOutboxEvents({
      includeUnavailable: true,
      limit: batchSize,
    });
    if (events.length === 0) {
      if (await syncGateway.countPendingOutboxEvents() !== 0) {
        throw new Error("V2 rebaseline refused because unresolved outbox commands remain.");
      }
      return { batches, resolvedEvents };
    }

    let response;
    try {
      response = await pushEvents(events.map((entry) => ({
        eventId: entry.eventId,
        eventType: entry.eventType,
        payload: entry.payload,
      })));
    } catch (error) {
      await syncGateway.recordOutboxFailure({
        errorMessage: error instanceof Error ? error.message : String(error),
        eventIds: events.map((entry) => entry.eventId),
      });
      throw error;
    }

    const inputIds = new Set(events.map((entry) => entry.eventId));
    const acceptedIds = Array.isArray(response?.acceptedEventIds) ? response.acceptedEventIds : [];
    const rejections = Array.isArray(response?.rejectedEvents) ? response.rejectedEvents : [];
    const rejectedIds = rejections.map((entry) => entry.eventId);
    const acceptedIdSet = new Set(acceptedIds);
    const rejectedIdSet = new Set(rejectedIds);
    const resolvedIds = new Set([...acceptedIdSet, ...rejectedIdSet]);
    const invalidOutcome = acceptedIdSet.size !== acceptedIds.length
      || rejectedIdSet.size !== rejectedIds.length
      || [...resolvedIds].some((eventId) => !inputIds.has(eventId))
      || [...acceptedIdSet].some((eventId) => rejectedIdSet.has(eventId));
    const unresolvedIds = [...inputIds].filter((eventId) => !resolvedIds.has(eventId));
    if (invalidOutcome || unresolvedIds.length > 0) {
      const failedIds = unresolvedIds.length > 0 ? unresolvedIds : [...inputIds];
      await syncGateway.recordOutboxFailure({
        errorMessage: "Cloud did not return one terminal outcome for every rebaseline outbox command.",
        eventIds: failedIds,
      });
      throw new Error("V2 rebaseline refused because pending outbox commands could not be resolved.");
    }

    await syncGateway.rejectOutboxEvents({ rejections });
    await syncGateway.acknowledgeOutboxEvents({ eventIds: acceptedIds });
    batches += 1;
    resolvedEvents += events.length;
  }
}

export async function applyPublicationSnapshot({
  client,
  deactivatedRfidSuffix,
  snapshotResponse,
  syncGateway,
  onSnapshotApplied,
}) {
  if (snapshotResponse?.feedVersion !== PUBLICATION_FEED_VERSION) {
    throw new Error(`Publication feed-version mismatch: expected ${PUBLICATION_FEED_VERSION}.`);
  }
  if (snapshotResponse.mode !== "snapshot" || !isValidPublicationCursor(snapshotResponse.checkpoint)) {
    throw new Error("Publication sync v2 returned an invalid rebaseline snapshot boundary.");
  }
  if (!snapshotResponse.snapshot || PUBLICATION_SNAPSHOT_PROPERTIES.some(
    (property) => !Array.isArray(snapshotResponse.snapshot[property]),
  )) {
    throw new Error("Publication sync v2 returned an incomplete authoritative snapshot.");
  }

  await client.query("BEGIN");
  try {
    await setPullApplyMode(client);
    await reconcilePublicationSnapshot({
      client,
      deactivatedRfidSuffix,
      snapshot: snapshotResponse.snapshot,
    });
    await syncGateway.writeLocalState({
      client,
      state: {
        feedVersion: PUBLICATION_FEED_VERSION,
        publicationCheckpoint: snapshotResponse.checkpoint,
      },
      stateKey: PUBLICATION_SYNC_STATE_KEY,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  if (onSnapshotApplied) {
    try { await onSnapshotApplied(REPLICATED_DOMAINS); } catch { /* Best-effort invalidation. */ }
  }
}

// Nightly v1 recovery reuses the existing authoritative reconciliation used by
// v2. Its numeric checkpoint stays in the v1 state; the two feeds never mix.
export async function applyReconciliationSnapshot({
  client, deactivatedRfidSuffix, snapshotResponse, syncGateway, onSnapshotApplied,
}) {
  if (snapshotResponse?.mode !== "snapshot"
    || !Number.isSafeInteger(snapshotResponse.checkpoint) || snapshotResponse.checkpoint < 0
    || !snapshotResponse.snapshot || PUBLICATION_SNAPSHOT_PROPERTIES.some(
      (property) => !Array.isArray(snapshotResponse.snapshot[property]),
    )) {
    throw new Error("Nightly reconciliation requires a complete snapshot and valid v1 checkpoint.");
  }
  await client.query("BEGIN");
  try {
    await setPullApplyMode(client);
    await reconcilePublicationSnapshot({ client, deactivatedRfidSuffix, snapshot: snapshotResponse.snapshot });
    await writeSyncAttemptState({ client, syncGateway, values: {
      currentCheckpoint: snapshotResponse.checkpoint,
      lastError: null,
      lastSuccessfulAt: new Date().toISOString(),
      syncServerVersion: snapshotResponse.serverVersion ?? "sync-v1",
    } });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  if (onSnapshotApplied) {
    try { await onSnapshotApplied(REPLICATED_DOMAINS); } catch { /* Best-effort invalidation. */ }
  }
}

export async function applyPulledPublicationResponse({
  client,
  deactivatedRfidSuffix,
  pullResponse,
  syncGateway,
  onIncrementalApplied,
}) {
  if (pullResponse?.feedVersion !== PUBLICATION_FEED_VERSION) {
    throw new Error(
      `Publication feed-version mismatch: expected ${PUBLICATION_FEED_VERSION}, received ${String(pullResponse?.feedVersion ?? "missing")}.`,
    );
  }
  if (pullResponse.mode !== "incremental") {
    throw new Error("Publication sync v2 only supports incremental pages; rebaseline is not implemented.");
  }
  if (!isValidPublicationCursor(pullResponse.checkpoint)) {
    throw new Error("Publication sync v2 returned an invalid checkpoint.");
  }

  const changes = pullResponse.changes ?? [];
  if (!Array.isArray(changes)) {
    throw new Error("Publication sync v2 returned invalid changes.");
  }
  for (const change of changes) {
    if (!isValidPublicationCursor(change?.publicationCursor)) {
      throw new Error("Publication sync v2 returned a change with an invalid publication cursor.");
    }
  }

  let appliedDomains = [];
  await client.query("BEGIN");
  try {
    const current = await readPublicationSyncState({ syncGateway, client });
    const currentCursor = BigInt(current.publicationCheckpoint);
    const responseCursor = BigInt(pullResponse.checkpoint);
    if (responseCursor < currentCursor) {
      throw new Error("Publication sync v2 refused to move its checkpoint backwards.");
    }

    let previousCursor = null;
    for (const change of changes) {
      const cursor = BigInt(change.publicationCursor);
      if (previousCursor !== null && cursor <= previousCursor) {
        throw new Error("Publication sync v2 changes are not in strictly increasing cursor order.");
      }
      if (cursor > responseCursor) {
        throw new Error("Publication sync v2 change cursor exceeds the response checkpoint.");
      }
      previousCursor = cursor;
    }
    if (changes.length === 0 && responseCursor !== currentCursor) {
      throw new Error("Publication sync v2 refused an empty page that advances the checkpoint.");
    }
    if (changes.length > 0 && previousCursor !== responseCursor) {
      throw new Error("Publication sync v2 response checkpoint does not match its final change cursor.");
    }

    await setPullApplyMode(client);
    appliedDomains = await applyAuthChanges({
      changes: changes.filter((change) => BigInt(change.publicationCursor) > currentCursor),
      client,
      deactivatedRfidSuffix,
      syncGateway,
    });
    await syncGateway.writeLocalState({
      client,
      state: {
        feedVersion: PUBLICATION_FEED_VERSION,
        publicationCheckpoint: pullResponse.checkpoint,
      },
      stateKey: PUBLICATION_SYNC_STATE_KEY,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  if (appliedDomains.length > 0 && onIncrementalApplied) {
    try { await onIncrementalApplied(appliedDomains); } catch { /* Best-effort invalidation. */ }
  }
}

export async function readSyncStatus({ syncGateway }) {
  const stateEntry = await syncGateway.readLocalState(SYNC_STATE_KEY);
  const pendingOutboxCount = await syncGateway.countPendingOutboxEvents();
  const rejectedOutboxCount = await syncGateway.countRejectedOutboxEvents();
  const recentRejectedOutboxEvents =
    await syncGateway.listRecentRejectedOutboxEvents({ limit: 10 });

  return {
    currentCheckpoint: Number(stateEntry?.state?.currentCheckpoint ?? 0),
    lastAttemptedAt: stateEntry?.state?.lastAttemptedAt ?? null,
    lastError: stateEntry?.state?.lastError ?? null,
    lastSuccessfulAt: stateEntry?.state?.lastSuccessfulAt ?? null,
    pendingOutboxCount,
    recentRejectedOutboxEvents,
    rejectedOutboxCount,
    syncClientVersion: stateEntry?.state?.syncClientVersion ?? "sync-v1",
    syncServerVersion: stateEntry?.state?.syncServerVersion ?? null,
  };
}

export async function writeSyncAttemptState({
  client,
  syncGateway,
  values,
}) {
  const current = (await syncGateway.readLocalState(SYNC_STATE_KEY, client))?.state ?? {};
  await syncGateway.writeLocalState({
    client,
    state: {
      ...current,
      ...values,
    },
    stateKey: SYNC_STATE_KEY,
  });
}
