import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAuthChanges, applyAuthSnapshot } from "./localDatabaseSyncService.js";
import { createMemberQuestionGateway } from "../../infrastructure/persistence/memberQuestionGateway.js";
import { createSuggestionGateway } from "../../infrastructure/persistence/suggestionGateway.js";
import { processFeedbackCreateCommand, processFeedbackUpdateCommand } from "../../infrastructure/persistence/feedbackSyncCommand.js";
import { createSyncGateway } from "../../infrastructure/persistence/syncGateway.js";
import { enqueueLegacyFeedbackRows } from "../../infrastructure/persistence/feedbackSyncLegacyOutbox.js";
import { migration } from "../../infrastructure/persistence/postgresMigrations/015_feedback_sync.js";

const question = {
  sync_id: "11111111-1111-4111-8111-111111111111",
  sync_version: 1,
  submitted_by_username: "robin",
  question_title: "Question",
  question_body: "Body",
  status: "new",
  response_text: "",
  member_seen_response: true,
  created_at_date: "2026-09-01",
  created_at_time: "10:00:00",
};
const suggestion = {
  sync_id: "22222222-2222-4222-8222-222222222222",
  sync_version: 1,
  submitted_by_username: "robin",
  submitted_by_name: "Robin",
  is_anonymous: false,
  suggestion_title: "Suggestion",
  improvement_text: "Improve this",
  suggestion_details: "Details",
  status: "new",
  resolution_note: "",
  created_at_date: "2026-09-01",
  created_at_time: "10:00:00",
};

function recordingClient() {
  const queries = [];
  return {
    queries,
    client: {
      async query(sql, values = []) {
        queries.push({ sql: String(sql).replace(/\s+/g, " ").trim(), values });
        return { rowCount: 0, rows: [] };
      },
    },
  };
}

const syncGateway = { async listPendingBookingOverlayCommands() { return []; } };

test("cloud snapshot builder publishes both feedback arrays, including empty arrays", async () => {
  const pool = { async query(sql) {
    const text = String(sql).replace(/\s+/g, " ").trim();
    if (text.includes("FROM member_questions ORDER BY")) return { rows: [question] };
    if (text.includes("FROM suggestions ORDER BY")) return { rows: [suggestion] };
    if (text.includes("MAX(change_id)")) return { rows: [{ checkpoint: 4 }] };
    return { rows: [] };
  } };
  const result = await createSyncGateway({ pool }).getAuthSnapshot();
  assert.deepEqual(result.snapshot.memberQuestions, [question]);
  assert.deepEqual(result.snapshot.suggestions, [suggestion]);
  const empty = await createSyncGateway({ pool: { query: async () => ({ rows: [] }) } }).getAuthSnapshot();
  assert.deepEqual(empty.snapshot.memberQuestions, []);
  assert.deepEqual(empty.snapshot.suggestions, []);
});

test("feedback snapshot imports both domains and reconciles explicit empty arrays", async () => {
  const { client, queries } = recordingClient();
  await applyAuthSnapshot({ client, deactivatedRfidSuffix: "-deactivated", snapshot: {
    users: [], memberQuestions: [question], suggestions: [suggestion],
  }, syncGateway });
  assert.ok(queries.some((entry) => entry.sql.startsWith("INSERT INTO member_questions") && entry.values[0] === question.sync_id));
  assert.ok(queries.some((entry) => entry.sql.startsWith("INSERT INTO suggestions") && entry.values[0] === suggestion.sync_id));
  assert.ok(queries.filter((entry) => entry.sql.startsWith("INSERT INTO member_questions") || entry.sql.startsWith("INSERT INTO suggestions"))
    .every((entry) => entry.sql.includes("sync_is_cloud_managed") && entry.sql.includes("TRUE")));

  queries.length = 0;
  await applyAuthSnapshot({ client, deactivatedRfidSuffix: "-deactivated", snapshot: {
    users: [], memberQuestions: [], suggestions: [],
  }, syncGateway });
  for (const domain of ["member_questions", "suggestions"]) {
    const deletion = queries.find((entry) => entry.sql.startsWith(`DELETE FROM ${domain} AS feedback`));
    assert.deepEqual(deletion.values[0], []);
    assert.match(deletion.sql, /pending\.acknowledged_at IS NULL/);
  }

  queries.length = 0;
  await applyAuthSnapshot({ client, deactivatedRfidSuffix: "-deactivated", snapshot: { users: [] }, syncGateway });
  assert.equal(queries.some((entry) => /(?:INSERT INTO|DELETE FROM) (?:member_questions|suggestions)/.test(entry.sql)), false);
});

test("incremental feedback inserts, cloud updates and deletions use opaque sync IDs", async () => {
  const { client, queries } = recordingClient();
  await applyAuthChanges({ client, deactivatedRfidSuffix: "-deactivated", syncGateway, changes: [
    { domain: "member_questions", operation: "upsert", recordKey: question.sync_id, payload: question },
    { domain: "suggestions", operation: "upsert", recordKey: suggestion.sync_id, payload: { ...suggestion, status: "implemented", sync_version: 2 } },
  ] });
  assert.ok(queries.some((entry) => entry.sql.startsWith("INSERT INTO member_questions") && entry.values[0] === question.sync_id));
  assert.ok(queries.some((entry) => entry.sql.startsWith("INSERT INTO suggestions") && entry.values[1] === 2));
  assert.equal(queries.some((entry) => entry.sql.includes("sync_local_outbox") || entry.sql.includes("sync_change_log")), false);

  queries.length = 0;
  await applyAuthChanges({ client, deactivatedRfidSuffix: "-deactivated", syncGateway, changes: [
    { domain: "member_questions", operation: "delete", recordKey: question.sync_id, payload: { sync_id: question.sync_id } },
    { domain: "suggestions", operation: "delete", recordKey: suggestion.sync_id, payload: { sync_id: suggestion.sync_id } },
  ] });
  assert.ok(queries.some((entry) => entry.sql === "DELETE FROM member_questions WHERE sync_id = $1" && entry.values[0] === question.sync_id));
  assert.ok(queries.some((entry) => entry.sql === "DELETE FROM suggestions WHERE sync_id = $1" && entry.values[0] === suggestion.sync_id));
});

test("Pi creations of both feedback domains commit a durable outbox row with a stable sync ID", async () => {
  for (const [domain, eventType, create] of [
    ["member_questions", "member_question_created", (gateway) => gateway.createQuestion({ submittedByUsername: "robin", questionTitle: "Question", questionBody: "Body", createdAtDate: "2026-09-01", createdAtTime: "10:00:00" })],
    ["suggestions", "suggestion_created", (gateway) => gateway.createSuggestion({ submittedByUsername: "robin", submittedByName: "Robin", isAnonymous: false, suggestionTitle: "Suggestion", improvementText: "Improve this", suggestionDetails: "Details", status: "new", resolutionNote: "", createdAtDate: "2026-09-01", createdAtTime: "10:00:00" })],
  ]) {
    const { client, queries } = recordingClient();
    client.release = () => {};
    client.query = async (sql, values = []) => {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, values });
      if (normalized.startsWith(`INSERT INTO ${domain}`)) return { rows: [{ id: 9, sync_id: values.at(-3), sync_version: 1, sync_source_machine_id: "pi-1", sync_origin_event_id: values.at(-1), submitted_by_username: "robin" }] };
      return { rows: [] };
    };
    const pool = { connect: async () => client, query: async () => ({ rows: [{ id: 9 }] }) };
    const gateway = domain === "member_questions"
      ? createMemberQuestionGateway({ databaseEngine: "postgres", pool, isLocalPiNode: true, syncMachineId: "pi-1" })
      : createSuggestionGateway({ databaseEngine: "postgres", pool, isLocalPiNode: true, syncMachineId: "pi-1" });
    await create(gateway);
    const outbox = queries.find((entry) => entry.sql.startsWith("INSERT INTO sync_local_outbox"));
    assert.equal(outbox.values[1], eventType);
    const payload = JSON.parse(outbox.values[3]);
    assert.equal(payload.sync_id, outbox.values[2]);
    assert.equal(payload.sync_origin_event_id, outbox.values[0]);
    assert.equal(payload.expectedVersion, 0);
    assert.equal(Object.hasOwn(payload, "id"), false);
    assert.ok(queries.some((entry) => entry.sql === "COMMIT"));
  }
});

test("cloud feedback creation replays the same event once and rejects a conflicting sync ID", async () => {
  const received = new Map();
  const rows = new Map();
  let inserts = 0;
  const client = {
    async query(sql, values = []) {
      const text = String(sql).replace(/\s+/g, " ").trim();
      if (text.startsWith("SELECT outcome_json")) return { rows: received.has(values[0]) ? [received.get(values[0])] : [] };
      if (text.startsWith("SELECT sync_version, sync_origin_event_id")) return { rows: rows.has(values[0]) ? [rows.get(values[0])] : [] };
      if (text.startsWith("SELECT username FROM users")) return { rows: [{ username: "robin" }] };
      if (text.startsWith("INSERT INTO member_questions")) { inserts += 1; rows.set(values.at(-3), { sync_version: 1, sync_source_machine_id: values.at(-2), sync_origin_event_id: values.at(-1) }); }
      if (text.startsWith("INSERT INTO sync_received_commands")) received.set(values[0], { outcome_json: JSON.parse(values[3]), event_type: values[1], machine_id: values[2] });
      return { rows: [] };
    },
  };
  const event = { eventId: "event-1", eventType: "member_question_created", payload: {
    ...question, sync_source_machine_id: "pi-1", sync_origin_event_id: "event-1", expectedVersion: 0,
  } };
  assert.deepEqual(await processFeedbackCreateCommand({ client, event, machineId: "pi-1" }), { accepted: true });
  assert.deepEqual(await processFeedbackCreateCommand({ client, event, machineId: "pi-1" }), { accepted: true });
  assert.equal(inserts, 1);
  const stale = { ...event, eventId: "event-2", payload: { ...event.payload, sync_origin_event_id: "event-2" } };
  assert.equal((await processFeedbackCreateCommand({ client, event: stale, machineId: "pi-1" })).code, "feedback_stale_version");
});

test("duplicate Pi suggestion push cannot duplicate the cloud row", async () => {
  const outcomes = new Map();
  let inserts = 0;
  const client = { async query(sql, values = []) {
    const text = String(sql).replace(/\s+/g, " ").trim();
    if (text.startsWith("SELECT outcome_json")) return { rows: outcomes.has(values[0]) ? [outcomes.get(values[0])] : [] };
    if (text.startsWith("SELECT sync_version, sync_origin_event_id")) return { rows: [] };
    if (text.startsWith("SELECT username FROM users")) return { rows: [{ username: "robin" }] };
    if (text.startsWith("INSERT INTO suggestions")) inserts += 1;
    if (text.startsWith("INSERT INTO sync_received_commands")) outcomes.set(values[0], {
      outcome_json: JSON.parse(values[3]), event_type: values[1], machine_id: values[2],
    });
    return { rows: [] };
  } };
  const event = { eventId: "suggestion-event", eventType: "suggestion_created", payload: {
    ...suggestion, expectedVersion: 0, sync_source_machine_id: "pi-1", sync_origin_event_id: "suggestion-event",
  } };
  await processFeedbackCreateCommand({ client, event, machineId: "pi-1" });
  await processFeedbackCreateCommand({ client, event, machineId: "pi-1" });
  assert.equal(inserts, 1);
});

test("stale Pi status update is terminal and cannot overwrite cloud authority", async () => {
  const queries = [];
  const client = { async query(sql) {
    const text = String(sql).replace(/\s+/g, " ").trim();
    queries.push(text);
    if (text.startsWith("SELECT outcome_json")) return { rows: [] };
    if (text.startsWith("SELECT sync_version, submitted_by_username FROM suggestions")) return { rows: [{ sync_version: 3 }] };
    return { rows: [] };
  } };
  const outcome = await processFeedbackUpdateCommand({ client, machineId: "pi-1", event: {
    eventId: "update-1", eventType: "suggestion_status_updated", payload: {
      syncId: suggestion.sync_id, expectedVersion: 2, status: "declined", resolutionNote: "No", updatedByUsername: "committee",
    },
  } });
  assert.equal(outcome.code, "feedback_stale_version");
  assert.equal(queries.some((sql) => sql.startsWith("UPDATE suggestions")), false);
});

test("matching versions apply committee updates on cloud and use cloud timestamps", async () => {
  for (const [eventType, payload, table] of [
    ["member_question_response_updated", { syncId: question.sync_id, expectedVersion: 2, responseText: "Answer", respondedByUsername: "committee" }, "member_questions"],
    ["suggestion_status_updated", { syncId: suggestion.sync_id, expectedVersion: 2, status: "implemented", resolutionNote: "Done", updatedByUsername: "committee" }, "suggestions"],
  ]) {
    const { client, queries } = recordingClient();
    client.query = async (sql, values = []) => {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, values });
      if (normalized.startsWith("SELECT sync_version, submitted_by_username FROM")) return { rows: [{ sync_version: 2 }] };
      if (normalized.startsWith("SELECT username FROM users")) return { rows: [{ username: "committee" }] };
      if (normalized.startsWith("SELECT 1 FROM user_types")) return { rows: [{ "?column?": 1 }] };
      return { rows: [] };
    };
    const outcome = await processFeedbackUpdateCommand({ client, machineId: "pi-1", event: {
      eventId: `event-${eventType}`, eventType, payload,
    } });
    assert.deepEqual(outcome, { accepted: true });
    const update = queries.find((entry) => entry.sql.startsWith(`UPDATE ${table} SET`));
    assert.ok(update);
    assert.match(update.sql, /NOW\(\) AT TIME ZONE 'UTC'/);
  }
});

test("Pi committee updates carry expectedVersion into durable outbox", async () => {
  const { client, queries } = recordingClient();
  client.release = () => {};
  client.query = async (sql, values = []) => {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    queries.push({ sql: normalized, values });
    if (normalized.startsWith("SELECT sync_id, sync_version, submitted_by_username FROM suggestions")) {
      return { rows: [{ sync_id: suggestion.sync_id, sync_version: 4, submitted_by_username: "robin" }] };
    }
    return { rows: [] };
  };
  const pool = { connect: async () => client, query: async () => ({ rows: [suggestion] }) };
  const gateway = createSuggestionGateway({ databaseEngine: "postgres", pool, isLocalPiNode: true, syncMachineId: "pi-1" });
  await gateway.updateSuggestionStatus(7, {
    status: "implemented", resolutionNote: "Done", updatedAtDate: "2026-09-01",
    updatedAtTime: "10:00:00", updatedByUsername: "committee",
  });
  const outbox = queries.find((entry) => entry.sql.startsWith("INSERT INTO sync_local_outbox"));
  assert.equal(outbox.values[1], "suggestion_status_updated");
  assert.equal(JSON.parse(outbox.values[3]).expectedVersion, 4);
});

test("feedback migration suppresses pull echoes and outbox acknowledgements remain durable", async () => {
  assert.ok(migration.statements.some((statement) => statement.includes("archery.sync.apply_mode") && statement.includes("sync_change_log")));
  const { client, queries } = recordingClient();
  const gateway = createSyncGateway({ pool: client });
  await gateway.acknowledgeOutboxEvents({ client, eventIds: ["event-1"] });
  await gateway.rejectOutboxEvents({ client, rejections: [{ eventId: "event-2", code: "feedback_stale_version", reason: "stale" }] });
  assert.ok(queries.some((entry) => entry.sql.startsWith("UPDATE sync_local_outbox SET acknowledged_at")));
  assert.ok(queries.some((entry) => entry.sql.startsWith("UPDATE sync_local_outbox SET rejected_at")));
});

test("terminal create rejection removes only the matching optimistic Pi row", async () => {
  const { client, queries } = recordingClient();
  client.query = async (sql, values = []) => {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    queries.push({ sql: normalized, values });
    if (normalized.startsWith("UPDATE sync_local_outbox")) return { rows: [{
      event_type: "member_question_created", payload_json: { sync_id: question.sync_id },
    }] };
    if (normalized.startsWith("DELETE FROM member_questions")) return { rowCount: 1, rows: [] };
    return { rowCount: 0, rows: [] };
  };
  const gateway = createSyncGateway({ pool: client });
  await gateway.rejectOutboxEvents({ client, rejections: [
    { eventId: "event-1", code: "feedback_stale_version", reason: "conflict" },
  ] });
  const deletion = queries.find((entry) => entry.sql.startsWith("DELETE FROM member_questions"));
  assert.deepEqual(deletion.values, [question.sync_id, "event-1"]);
});

test("legacy Pi feedback is queued once before snapshots, excluding pulled cloud rows", async () => {
  const queries = [];
  let pendingLegacy = true;
  const client = { release() {}, async query(sql, values = []) {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    queries.push({ sql: normalized, values });
    if (normalized.startsWith("SELECT 1 FROM schema_migrations")) return { rows: [{ "?column?": 1 }] };
    if (normalized.startsWith("SELECT * FROM member_questions")) return { rows: pendingLegacy ? [{ id: 7, ...question, sync_origin_event_id: null }] : [] };
    if (normalized.startsWith("SELECT * FROM suggestions")) return { rows: [] };
    if (normalized.startsWith("UPDATE member_questions")) {
      pendingLegacy = false;
      return { rows: [{ id: 7, ...question, sync_origin_event_id: values[2], sync_source_machine_id: values[1] }] };
    }
    return { rows: [] };
  } };
  const pool = { connect: async () => client };
  assert.equal(await enqueueLegacyFeedbackRows({ pool, machineId: "pi-1" }), 1);
  assert.equal(await enqueueLegacyFeedbackRows({ pool, machineId: "pi-1" }), 0);
  assert.equal(queries.filter((entry) => entry.sql.startsWith("INSERT INTO sync_local_outbox")).length, 1);
  assert.ok(queries.some((entry) => entry.sql.includes("sync_is_cloud_managed = FALSE")));
});

test("legacy reviewed feedback queues its create before its versioned review command", async () => {
  const outboxTypes = [];
  const client = { release() {}, async query(sql, values = []) {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    if (normalized.startsWith("SELECT 1 FROM schema_migrations")) return { rows: [{ "?column?": 1 }] };
    if (normalized.startsWith("SELECT * FROM member_questions")) return { rows: [{
      id: 7, ...question, status: "answered", response_text: "Answer",
      responded_by_username: "committee", member_seen_response: true,
    }] };
    if (normalized.startsWith("SELECT * FROM suggestions")) return { rows: [{
      id: 8, ...suggestion, status: "implemented", updated_by_username: "committee",
      resolution_note: "Done",
    }] };
    if (normalized.startsWith("UPDATE member_questions")) return { rows: [{ id: 7, ...question, sync_origin_event_id: values[2], status: "answered", response_text: "Answer", responded_by_username: "committee", member_seen_response: true }] };
    if (normalized.startsWith("UPDATE suggestions")) return { rows: [{ id: 8, ...suggestion, sync_origin_event_id: values[2], status: "implemented", updated_by_username: "committee", resolution_note: "Done" }] };
    if (normalized.startsWith("INSERT INTO sync_local_outbox")) outboxTypes.push(
      normalized.includes("'member_question_seen'") ? "member_question_seen" : values[1],
    );
    return { rows: [] };
  } };
  assert.equal(await enqueueLegacyFeedbackRows({ pool: { connect: async () => client }, machineId: "pi-1" }), 5);
  assert.deepEqual(outboxTypes, [
    "member_question_created", "member_question_response_updated", "member_question_seen",
    "suggestion_created", "suggestion_status_updated",
  ]);
});
