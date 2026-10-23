import { queryRows, querySingleValue } from "./localSyncQueryGateway.js";

export async function deleteUnreferencedEquipmentItems(client, items) {
  const equipmentKeys = items.map((row) => row.sync_id);
  await client.query(`UPDATE equipment_items SET location_case_id = NULL WHERE sync_id <> ALL($1::text[])`, [equipmentKeys]);
  await client.query(`
    DELETE FROM equipment_items AS item
    WHERE item.sync_id <> ALL($1::text[])
      AND NOT EXISTS (
        SELECT 1 FROM equipment_loans AS loan
        WHERE loan.equipment_item_id = item.id
          OR loan.loan_context_case_id = item.id
          OR loan.return_case_id = item.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM beginners_course_participants AS participant
        WHERE participant.assigned_case_id = item.id
      )
  `, [equipmentKeys]);
}

export async function deleteUnseenMissingAnnouncements(client, announcements) {
  await client.query(`
    DELETE FROM announcements AS announcement
    WHERE announcement.sync_id <> ALL($1::text[])
      AND NOT EXISTS (
        SELECT 1 FROM announcement_seen_members AS seen
        WHERE seen.announcement_id = announcement.id
      )
  `, [announcements.map((row) => row.sync_id)]);
}

export function normalizeBookingKey(parentSyncId, username) {
  return `${String(parentSyncId ?? "").trim()}:${String(username ?? "").trim().toLowerCase()}`;
}

export function getBookingDomainConfig(kind) {
  if (kind === "coaching") {
    return {
      bookingTable: "coaching_session_bookings",
      createEventType: "coaching_booking_created",
      deleteEventType: "coaching_booking_withdrawn",
      parentIdColumn: "coaching_session_id",
      parentSyncIdColumn: "parent_sync_id",
      parentTable: "coaching_sessions",
    };
  }

  return {
    bookingTable: "event_bookings",
    createEventType: "event_booking_created",
    deleteEventType: "event_booking_withdrawn",
    parentIdColumn: "club_event_id",
    parentSyncIdColumn: "parent_sync_id",
    parentTable: "club_events",
  };
}


export async function upsertEquipmentStorageLocations(client, locations = []) {
  for (const location of locations) {
    await client.query(
      `
        INSERT INTO equipment_storage_locations (
          sync_id,
          label,
          created_at_date,
          created_at_time
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (sync_id) DO UPDATE SET
          label = EXCLUDED.label,
          created_at_date = EXCLUDED.created_at_date,
          created_at_time = EXCLUDED.created_at_time
      `,
      [
        location.sync_id,
        location.label,
        location.created_at_date,
        location.created_at_time,
      ],
    );
  }
}

export async function upsertClubEvents(client, events = []) {
  for (const event of events) {
    await client.query(
      `
        INSERT INTO club_events (
          sync_id,
          event_date,
          start_time,
          end_time,
          title,
          details,
          type,
          types,
          venue,
          submitted_by_username,
          approval_status,
          rejection_reason,
          approved_by_username,
          approved_at_date,
          approved_at_time,
          created_at_date,
          created_at_time
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16, $17
        )
        ON CONFLICT (sync_id) DO UPDATE SET
          event_date = EXCLUDED.event_date,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          title = EXCLUDED.title,
          details = EXCLUDED.details,
          type = EXCLUDED.type,
          types = EXCLUDED.types,
          venue = EXCLUDED.venue,
          submitted_by_username = EXCLUDED.submitted_by_username,
          approval_status = EXCLUDED.approval_status,
          rejection_reason = EXCLUDED.rejection_reason,
          approved_by_username = EXCLUDED.approved_by_username,
          approved_at_date = EXCLUDED.approved_at_date,
          approved_at_time = EXCLUDED.approved_at_time,
          created_at_date = EXCLUDED.created_at_date,
          created_at_time = EXCLUDED.created_at_time
      `,
      [
        event.sync_id,
        event.event_date,
        event.start_time,
        event.end_time,
        event.title,
        event.details,
        event.type,
        event.types,
        event.venue,
        event.submitted_by_username,
        event.approval_status,
        event.rejection_reason,
        event.approved_by_username,
        event.approved_at_date,
        event.approved_at_time,
        event.created_at_date,
        event.created_at_time,
      ],
    );
  }
}

export async function upsertCoachingSessions(client, sessions = []) {
  for (const session of sessions) {
    await client.query(
      `
        INSERT INTO coaching_sessions (
          sync_id,
          coach_username,
          session_date,
          start_time,
          end_time,
          available_slots,
          topic,
          summary,
          venue,
          approval_status,
          rejection_reason,
          approved_by_username,
          approved_at_date,
          approved_at_time,
          created_at_date,
          created_at_time
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16
        )
        ON CONFLICT (sync_id) DO UPDATE SET
          coach_username = EXCLUDED.coach_username,
          session_date = EXCLUDED.session_date,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          available_slots = EXCLUDED.available_slots,
          topic = EXCLUDED.topic,
          summary = EXCLUDED.summary,
          venue = EXCLUDED.venue,
          approval_status = EXCLUDED.approval_status,
          rejection_reason = EXCLUDED.rejection_reason,
          approved_by_username = EXCLUDED.approved_by_username,
          approved_at_date = EXCLUDED.approved_at_date,
          approved_at_time = EXCLUDED.approved_at_time,
          created_at_date = EXCLUDED.created_at_date,
          created_at_time = EXCLUDED.created_at_time
      `,
      [
        session.sync_id,
        session.coach_username,
        session.session_date,
        session.start_time,
        session.end_time,
        session.available_slots,
        session.topic,
        session.summary,
        session.venue,
        session.approval_status,
        session.rejection_reason,
        session.approved_by_username,
        session.approved_at_date,
        session.approved_at_time,
        session.created_at_date,
        session.created_at_time,
      ],
    );
  }
}

export async function upsertAnnouncements(client, announcements = []) {
  for (const announcement of announcements) {
    await client.query(
      `
        INSERT INTO announcements (
          sync_id,
          active_from_date,
          active_till_date,
          severity,
          message,
          escalate_severity,
          created_by_username,
          created_at_date,
          created_at_time,
          amended_by_username,
          amended_at_date,
          amended_at_time,
          deleted_by_username,
          deleted_at_date,
          deleted_at_time,
          is_deleted
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16
        )
        ON CONFLICT (sync_id) DO UPDATE SET
          active_from_date = EXCLUDED.active_from_date,
          active_till_date = EXCLUDED.active_till_date,
          severity = EXCLUDED.severity,
          message = EXCLUDED.message,
          escalate_severity = EXCLUDED.escalate_severity,
          amended_by_username = EXCLUDED.amended_by_username,
          amended_at_date = EXCLUDED.amended_at_date,
          amended_at_time = EXCLUDED.amended_at_time,
          deleted_by_username = EXCLUDED.deleted_by_username,
          deleted_at_date = EXCLUDED.deleted_at_date,
          deleted_at_time = EXCLUDED.deleted_at_time,
          is_deleted = EXCLUDED.is_deleted
      `,
      [
        announcement.sync_id,
        announcement.active_from_date,
        announcement.active_till_date,
        announcement.severity,
        announcement.message,
        announcement.escalate_severity,
        announcement.created_by_username,
        announcement.created_at_date,
        announcement.created_at_time,
        announcement.amended_by_username,
        announcement.amended_at_date,
        announcement.amended_at_time,
        announcement.deleted_by_username,
        announcement.deleted_at_date,
        announcement.deleted_at_time,
        announcement.is_deleted,
      ],
    );
  }
}

export async function upsertEquipmentItems(client, items = []) {
  for (const item of items) {
    await client.query(
      `
        INSERT INTO equipment_items (
          sync_id,
          equipment_type,
          item_number,
          size_category,
          arrow_length,
          arrow_quantity,
          details_json,
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
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          NULL, $11, $12, $13, $14, $15, $16, $17, $18, $19,
          $20, $21, $22, $23, $24
        )
        ON CONFLICT (sync_id) DO UPDATE SET
          equipment_type = EXCLUDED.equipment_type,
          item_number = EXCLUDED.item_number,
          size_category = EXCLUDED.size_category,
          arrow_length = EXCLUDED.arrow_length,
          arrow_quantity = EXCLUDED.arrow_quantity,
          details_json = EXCLUDED.details_json,
          status = EXCLUDED.status,
          location_type = EXCLUDED.location_type,
          location_label = EXCLUDED.location_label,
          location_case_id = NULL,
          location_member_username = EXCLUDED.location_member_username,
          added_by_username = EXCLUDED.added_by_username,
          added_at_date = EXCLUDED.added_at_date,
          added_at_time = EXCLUDED.added_at_time,
          decommissioned_by_username = EXCLUDED.decommissioned_by_username,
          decommissioned_at_date = EXCLUDED.decommissioned_at_date,
          decommissioned_at_time = EXCLUDED.decommissioned_at_time,
          decommission_reason = EXCLUDED.decommission_reason,
          last_assignment_by_username = EXCLUDED.last_assignment_by_username,
          last_assignment_at_date = EXCLUDED.last_assignment_at_date,
          last_assignment_at_time = EXCLUDED.last_assignment_at_time,
          last_storage_updated_by_username = EXCLUDED.last_storage_updated_by_username,
          last_storage_updated_at_date = EXCLUDED.last_storage_updated_at_date,
          last_storage_updated_at_time = EXCLUDED.last_storage_updated_at_time
      `,
      [
        item.sync_id,
        item.equipment_type,
        item.item_number,
        item.size_category,
        item.arrow_length,
        item.arrow_quantity,
        item.details_json,
        item.status,
        item.location_type,
        item.location_label,
        item.location_member_username,
        item.added_by_username,
        item.added_at_date,
        item.added_at_time,
        item.decommissioned_by_username,
        item.decommissioned_at_date,
        item.decommissioned_at_time,
        item.decommission_reason,
        item.last_assignment_by_username,
        item.last_assignment_at_date,
        item.last_assignment_at_time,
        item.last_storage_updated_by_username,
        item.last_storage_updated_at_date,
        item.last_storage_updated_at_time,
      ],
    );
  }
}

export async function resolveEquipmentCaseRelationships(client, items = []) {
  for (const item of items) {
    if (!item.location_case_sync_id) {
      await client.query(
        `
          UPDATE equipment_items
          SET location_case_id = NULL
          WHERE sync_id = $1
        `,
        [item.sync_id],
      );
      continue;
    }

    await client.query(
      `
        UPDATE equipment_items AS item
        SET location_case_id = parent.id
        FROM equipment_items AS parent
        WHERE item.sync_id = $1
          AND parent.sync_id = $2
      `,
      [item.sync_id, item.location_case_sync_id],
    );
  }
}

export async function deleteMissingSnapshotRows({
  client,
  incomingKeys,
  keyColumn = "sync_id",
  tableName,
}) {
  if (incomingKeys.length === 0) {
    await client.query(`DELETE FROM ${tableName}`);
    return;
  }

  await client.query(
    `
      DELETE FROM ${tableName}
      WHERE ${keyColumn} <> ALL($1::text[])
    `,
    [incomingKeys],
  );
}

export async function listCurrentBookingKeys(client, kind) {
  const config = getBookingDomainConfig(kind);

  return queryRows(
    client,
    `
      SELECT
        parents.sync_id AS parent_sync_id,
        bookings.member_username
      FROM ${config.bookingTable} AS bookings
      INNER JOIN ${config.parentTable} AS parents
        ON parents.id = bookings.${config.parentIdColumn}
      ORDER BY parents.sync_id ASC, bookings.member_username ASC
    `,
  );
}

export async function upsertBookingSnapshotRows(client, kind, rows = []) {
  const config = getBookingDomainConfig(kind);

  for (const row of rows) {
    await client.query(
      `
        INSERT INTO ${config.bookingTable} (
          ${config.parentIdColumn},
          member_username,
          booked_at_date,
          booked_at_time,
          member_user_id
        )
        VALUES (
          (SELECT id FROM ${config.parentTable} WHERE sync_id = $1 LIMIT 1),
          $2,
          $3,
          $4,
          (SELECT id FROM users WHERE LOWER(username) = LOWER($2) LIMIT 1)
        )
        ON CONFLICT (${config.parentIdColumn}, member_username) DO UPDATE SET
          booked_at_date = EXCLUDED.booked_at_date,
          booked_at_time = EXCLUDED.booked_at_time,
          member_user_id = EXCLUDED.member_user_id
      `,
      [
        row.parent_sync_id,
        row.member_username,
        row.booked_at_date,
        row.booked_at_time,
      ],
    );
  }
}

export async function deleteMissingBookingSnapshotRows(client, kind, snapshotRows = []) {
  const currentRows = await listCurrentBookingKeys(client, kind);
  const incomingKeys = new Set(
    snapshotRows.map((row) => normalizeBookingKey(row.parent_sync_id, row.member_username)),
  );
  const config = getBookingDomainConfig(kind);

  for (const row of currentRows) {
    const key = normalizeBookingKey(row.parent_sync_id, row.member_username);

    if (incomingKeys.has(key)) {
      continue;
    }

    await client.query(
      `
        DELETE FROM ${config.bookingTable}
        WHERE ${config.parentIdColumn} = (
          SELECT id
          FROM ${config.parentTable}
          WHERE sync_id = $1
          LIMIT 1
        )
          AND member_username = $2
      `,
      [row.parent_sync_id, row.member_username],
    );
  }
}

export async function applyBookingChange(client, kind, change) {
  const config = getBookingDomainConfig(kind);

  if (change.operation === "delete") {
    await client.query(
      `
        DELETE FROM ${config.bookingTable}
        WHERE ${config.parentIdColumn} = (
          SELECT id
          FROM ${config.parentTable}
          WHERE sync_id = $1
          LIMIT 1
        )
          AND member_username = $2
      `,
      [change.payload.parent_sync_id, change.payload.member_username],
    );
    return;
  }

  await upsertBookingSnapshotRows(client, kind, [change.payload]);
}

export async function upsertRangePresenceExtensionRows(client, rows = []) {
  for (const row of rows) {
    await client.query(
      `
        INSERT INTO range_presence_extensions (
          username,
          active_until_date,
          active_until_time,
          updated_by_username,
          updated_at_date,
          updated_at_time,
          sync_version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (username) DO UPDATE SET
          active_until_date = EXCLUDED.active_until_date,
          active_until_time = EXCLUDED.active_until_time,
          updated_by_username = EXCLUDED.updated_by_username,
          updated_at_date = EXCLUDED.updated_at_date,
          updated_at_time = EXCLUDED.updated_at_time,
          sync_version = EXCLUDED.sync_version
      `,
      [
        row.username,
        row.active_until_date,
        row.active_until_time,
        row.updated_by_username,
        row.updated_at_date,
        row.updated_at_time,
        Number(row.sync_version ?? 0),
      ],
    );
  }
}




export async function reapplyPendingBookingOverlay(client, syncGateway) {
  if (!syncGateway?.listPendingBookingOverlayCommands) {
    return;
  }

  const commands = await syncGateway.listPendingBookingOverlayCommands({ client });

  for (const command of commands) {
    const kind = command.eventType.startsWith("coaching_") ? "coaching" : "event";
    const config = getBookingDomainConfig(kind);
    const parent = await querySingleValue(
      client,
      `
        SELECT id
        FROM ${config.parentTable}
        WHERE sync_id = $1
        LIMIT 1
      `,
      [command.payload.syncId],
    );

    if (!parent) {
      continue;
    }

    if (command.eventType === config.deleteEventType) {
      await client.query(
        `
          DELETE FROM ${config.bookingTable}
          WHERE ${config.parentIdColumn} = $1
            AND member_username = $2
        `,
        [parent.id, command.payload.username],
      );
      continue;
    }

    await client.query(
      `
        INSERT INTO ${config.bookingTable} (
          ${config.parentIdColumn},
          member_username,
          booked_at_date,
          booked_at_time,
          member_user_id
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          (SELECT id FROM users WHERE LOWER(username) = LOWER($2) LIMIT 1)
        )
        ON CONFLICT (${config.parentIdColumn}, member_username) DO UPDATE SET
          booked_at_date = EXCLUDED.booked_at_date,
          booked_at_time = EXCLUDED.booked_at_time,
          member_user_id = EXCLUDED.member_user_id
      `,
      [
        parent.id,
        command.payload.username,
        command.payload.bookedAtDate,
        command.payload.bookedAtTime,
      ],
    );
  }
}
