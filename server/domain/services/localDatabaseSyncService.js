import { normalizeMemberStatusWithFees } from "./memberPersistenceService.js";

const SYNC_STATE_KEY = "local_machine_sync";

function normalizeIncomingUser(user, deactivatedRfidSuffix) {
  const normalized = normalizeMemberStatusWithFees(
    {
      ...user,
      active_member: Number(user.active_member ?? 0),
      affiliate_member: Number(user.affiliate_member ?? 0),
      coaching_volunteer: Number(user.coaching_volunteer ?? 0),
      junior_member: Number(user.junior_member ?? 0),
    },
    {
      deactivatedRfidSuffix,
    },
  );
  const { requiresMembershipStatusSync: _ignored, ...nextUser } = normalized;

  return nextUser;
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
    ["equipment_storage_locations", 7],
    ["club_events", 8],
    ["coaching_sessions", 9],
    ["announcements", 10],
    ["equipment_items", 11],
    ["event_bookings", 12],
    ["coaching_session_bookings", 13],
  ]);
  const deleteOrder = new Map([
    ["coaching_session_bookings", 1],
    ["event_bookings", 2],
    ["equipment_items", 3],
    ["club_events", 4],
    ["coaching_sessions", 5],
    ["equipment_storage_locations", 6],
    ["user_disciplines", 7],
    ["user_types", 8],
    ["role_permissions", 9],
    ["users", 10],
    ["roles", 11],
    ["permissions", 12],
  ]);

  return [...latestByKey.values()].sort((left, right) => {
    if (left.operation !== right.operation) {
      return left.operation === "upsert" ? -1 : 1;
    }

    const order = left.operation === "upsert" ? upsertOrder : deleteOrder;
    return (order.get(left.domain) ?? 99) - (order.get(right.domain) ?? 99);
  });
}

async function queryRows(client, sql, values = []) {
  const result = await client.query(sql, values);
  return result.rows ?? [];
}

async function querySingleValue(client, sql, values = []) {
  const rows = await queryRows(client, sql, values);
  return rows[0] ?? null;
}

function normalizeBookingKey(parentSyncId, username) {
  return `${String(parentSyncId ?? "").trim()}:${String(username ?? "").trim().toLowerCase()}`;
}

function getBookingDomainConfig(kind) {
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

async function upsertUsers(client, users, deactivatedRfidSuffix) {
  for (const user of users) {
    const normalized = normalizeIncomingUser(user, deactivatedRfidSuffix);

    await client.query(
      `
        INSERT INTO users (
          username,
          first_name,
          surname,
          gr_id,
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
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        )
        ON CONFLICT (username) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          surname = EXCLUDED.surname,
          gr_id = EXCLUDED.gr_id,
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
      [
        normalized.username,
        normalized.first_name,
        normalized.surname,
        normalized.gr_id ?? null,
        normalized.archery_gb_membership_number ?? null,
        normalized.email_address ?? null,
        normalized.password ?? null,
        normalized.rfid_tag ?? null,
        normalized.active_member,
        normalized.affiliate_member,
        normalized.junior_member,
        normalized.membership_fees_due ?? null,
        normalized.coaching_volunteer,
        normalized.membership_status ?? "member",
        normalized.programme_type ?? "none",
      ],
    );
  }
}

async function replaceRolePermissions(client, rolePermissions) {
  await client.query(`DELETE FROM role_permissions`);

  for (const entry of rolePermissions) {
    await client.query(
      `
        INSERT INTO role_permissions (role_key, permission_key)
        VALUES ($1, $2)
        ON CONFLICT (role_key, permission_key) DO NOTHING
      `,
      [entry.role_key, entry.permission_key],
    );
  }
}

async function replaceUserTypes(client, userTypes) {
  await client.query(`DELETE FROM user_types`);

  for (const entry of userTypes) {
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
      [entry.username, entry.user_type],
    );
  }
}

async function replaceUserDisciplines(client, userDisciplines) {
  await client.query(`DELETE FROM user_disciplines`);

  for (const entry of userDisciplines) {
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
      [entry.username, entry.discipline],
    );
  }
}

async function tombstoneUser(client, username, rfidTag, deactivatedRfidSuffix) {
  const normalized = normalizeIncomingUser(
    {
      username,
      rfid_tag: rfidTag,
      active_member: 0,
    },
    deactivatedRfidSuffix,
  );

  await client.query(`DELETE FROM user_disciplines WHERE username = $1`, [username]);
  await client.query(`DELETE FROM user_types WHERE username = $1`, [username]);
  await client.query(
    `
      UPDATE users
      SET
        password = NULL,
        rfid_tag = $1,
        active_member = 0,
        membership_status = 'non-member',
        programme_type = 'none'
      WHERE username = $2
    `,
    [normalized.rfid_tag ?? null, username],
  );
}

async function tombstoneMissingUsers(client, incomingUsers, deactivatedRfidSuffix) {
  const incomingUsernames = incomingUsers.map((entry) => entry.username);

  await client.query(
    `
      DELETE FROM user_disciplines
      WHERE username <> ALL($1::text[])
    `,
    [incomingUsernames],
  );
  await client.query(
    `
      DELETE FROM user_types
      WHERE username <> ALL($1::text[])
    `,
    [incomingUsernames],
  );
  const missingUsersResult = await client.query(
    `
      SELECT username, rfid_tag
      FROM users
      WHERE username <> ALL($1::text[])
    `,
    [incomingUsernames],
  );

  for (const user of missingUsersResult.rows) {
    await tombstoneUser(
      client,
      user.username,
      user.rfid_tag,
      deactivatedRfidSuffix,
    );
  }
}

async function upsertEquipmentStorageLocations(client, locations = []) {
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

async function upsertClubEvents(client, events = []) {
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

async function upsertCoachingSessions(client, sessions = []) {
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

async function upsertAnnouncements(client, announcements = []) {
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

async function upsertEquipmentItems(client, items = []) {
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

async function resolveEquipmentCaseRelationships(client, items = []) {
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

async function deleteMissingSnapshotRows({
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

async function listCurrentBookingKeys(client, kind) {
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

async function upsertBookingSnapshotRows(client, kind, rows = []) {
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

async function deleteMissingBookingSnapshotRows(client, kind, snapshotRows = []) {
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

async function applyBookingChange(client, kind, change) {
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

async function reapplyPendingBookingOverlay(client, syncGateway) {
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

async function applyOperationalSnapshot({
  client,
  snapshot,
  syncGateway,
}) {
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

  if (Object.hasOwn(snapshot, "equipmentItems")) {
    await upsertEquipmentItems(client, snapshot.equipmentItems);
    await resolveEquipmentCaseRelationships(client, snapshot.equipmentItems);
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

  await reapplyPendingBookingOverlay(client, syncGateway);
}

export async function applyAuthSnapshot({
  client,
  deactivatedRfidSuffix,
  snapshot,
  syncGateway,
}) {
  await upsertUsers(client, snapshot.users ?? [], deactivatedRfidSuffix);

  for (const role of snapshot.roles ?? []) {
    await client.query(
      `
        INSERT INTO roles (role_key, title, is_system)
        VALUES ($1, $2, $3)
        ON CONFLICT (role_key) DO UPDATE SET
          title = EXCLUDED.title,
          is_system = EXCLUDED.is_system
      `,
      [role.role_key, role.title, Number(role.is_system ?? 0)],
    );
  }

  for (const permission of snapshot.permissions ?? []) {
    await client.query(
      `
        INSERT INTO permissions (permission_key, label, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (permission_key) DO UPDATE SET
          label = EXCLUDED.label,
          description = EXCLUDED.description
      `,
      [permission.permission_key, permission.label, permission.description],
    );
  }

  await replaceRolePermissions(client, snapshot.rolePermissions ?? []);
  await replaceUserTypes(client, snapshot.userTypes ?? []);
  await replaceUserDisciplines(client, snapshot.userDisciplines ?? []);

  const roleKeys = (snapshot.roles ?? []).map((entry) => entry.role_key);
  const permissionKeys = (snapshot.permissions ?? []).map((entry) => entry.permission_key);

  await client.query(`DELETE FROM roles WHERE role_key <> ALL($1::text[])`, [roleKeys]);
  await client.query(
    `DELETE FROM permissions WHERE permission_key <> ALL($1::text[])`,
    [permissionKeys],
  );
  await tombstoneMissingUsers(client, snapshot.users ?? [], deactivatedRfidSuffix);
  await applyOperationalSnapshot({
    client,
    snapshot,
    syncGateway,
  });
}

async function applyCollapsedChange({
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
      await client.query(
        `
          INSERT INTO roles (role_key, title, is_system)
          VALUES ($1, $2, $3)
          ON CONFLICT (role_key) DO UPDATE SET
            title = EXCLUDED.title,
            is_system = EXCLUDED.is_system
        `,
        [
          change.payload.role_key,
          change.payload.title,
          Number(change.payload.is_system ?? 0),
        ],
      );
      return;
    case "permissions":
      if (change.operation === "delete") {
        await client.query(`DELETE FROM permissions WHERE permission_key = $1`, [
          change.payload.permission_key,
        ]);
        return;
      }
      await client.query(
        `
          INSERT INTO permissions (permission_key, label, description)
          VALUES ($1, $2, $3)
          ON CONFLICT (permission_key) DO UPDATE SET
            label = EXCLUDED.label,
            description = EXCLUDED.description
        `,
        [
          change.payload.permission_key,
          change.payload.label,
          change.payload.description,
        ],
      );
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

export async function applyAuthChanges({
  changes,
  client,
  deactivatedRfidSuffix,
  syncGateway,
}) {
  for (const change of collapseChanges(changes)) {
    await applyCollapsedChange({
      change,
      client,
      deactivatedRfidSuffix,
    });
  }

  await reapplyPendingBookingOverlay(client, syncGateway);
}

export async function applyPulledSyncResponse({
  client,
  currentCheckpoint,
  deactivatedRfidSuffix,
  pullResponse,
  syncGateway,
}) {
  await client.query("BEGIN");

  try {
    await client.query(
      `SELECT set_config('archery.sync.apply_mode', 'pull', true)`,
    );

    if (pullResponse.mode === "snapshot") {
      await applyAuthSnapshot({
        client,
        deactivatedRfidSuffix,
        snapshot: pullResponse.snapshot,
        syncGateway,
      });
    } else {
      await applyAuthChanges({
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
