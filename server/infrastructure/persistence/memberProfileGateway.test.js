import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMemberProfileGateway } from './memberProfileGateway.js';
import { createSyncGateway } from './syncGateway.js';

function harness({ pending = false, failEnqueue = false, currentTag = 'OLD' } = {}) {
  const queries = [];
  let tag = currentTag;
  let snapshot;
  const outbox = [];
  const client = {
    async query(sql, values = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      queries.push({ text, values });
      if (text === 'BEGIN') snapshot = tag;
      if (text === 'ROLLBACK') { tag = snapshot; outbox.length = 0; }
      if (text.startsWith('SELECT username, rfid_tag')) return { rows: [{ username: 'Canonical', rfid_tag: tag }], rowCount: 1 };
      if (text.startsWith('SELECT 1 FROM sync_local_outbox')) return { rows: pending ? [{}] : [], rowCount: pending ? 1 : 0 };
      if (text.startsWith('INSERT INTO users')) tag = values[6];
      if (text.startsWith('INSERT INTO sync_local_outbox')) {
        if (failEnqueue) throw new Error('enqueue unavailable');
        outbox.push(JSON.parse(values[2]));
      }
      return { rows: [], rowCount: 0 };
    }, release() {},
  };
  const pool = { connect: async () => client };
  const gateway = createMemberProfileGateway({ databaseEngine: 'postgres', pool, syncGateway: createSyncGateway({ pool }) });
  const input = { disciplines: [], loanBow: {}, userType: 'member',
    userPayload: { username: 'Canonical', rfidTag: 'NEW' },
    rfidSync: { sourceNodeMode: 'local-pi', updatedByUsername: 'Admin' } };
  return { gateway, input, queries, outbox, tag: () => tag };
}

test('Pi RFID and exactly one outbox command commit in existing profile transaction', async () => {
  const h = harness();
  await h.gateway.saveMemberProfile(h.input);
  assert.equal(h.tag(), 'NEW');
  assert.equal(h.outbox.length, 1);
  assert.deepEqual(h.outbox[0], { eventId: h.outbox[0].eventId, username: 'Canonical', previousRfidTag: 'OLD', rfidTag: 'NEW', updatedByUsername: 'Admin' });
  assert.match(h.outbox[0].eventId, /^[0-9a-f-]{36}$/);
  const statements = h.queries.map((q) => q.text);
  assert.equal(statements[0], 'BEGIN');
  assert.equal(statements.at(-1), 'COMMIT');
  assert.ok(statements.findIndex((s) => s.startsWith('INSERT INTO sync_local_outbox')) > statements.findIndex((s) => s.startsWith('INSERT INTO member_loan_bows')));
  assert.equal(h.queries.find((q) => q.text.startsWith('INSERT INTO sync_local_outbox')).values[1], 'canonical');
});

for (const options of [{ failEnqueue: true }, { pending: true }]) {
  test(`RFID transaction rolls back on ${options.pending ? 'unresolved command' : 'enqueue failure'}`, async () => {
    const h = harness(options);
    await assert.rejects(h.gateway.saveMemberProfile(h.input), options.pending ? { code: 'rfid_update_pending' } : /enqueue unavailable/);
    assert.equal(h.tag(), 'OLD');
    assert.equal(h.outbox.length, 0);
    assert.equal(h.queries.at(-1).text, 'ROLLBACK');
    if (options.pending) assert.equal(h.queries.some((q) => q.text.startsWith('INSERT INTO users')), false);
  });
}

for (const [name, node, tag] of [['unchanged', 'local-pi', ' old '], ['cloud', 'cloud-server', 'NEW'], ['clear', 'local-pi', null]]) {
  test(`RFID transaction ${name}`, async () => {
    const h = harness();
    h.input.userPayload.rfidTag = tag;
    h.input.rfidSync.sourceNodeMode = node;
    await h.gateway.saveMemberProfile(h.input);
    assert.equal(h.outbox.length, name === 'clear' ? 1 : 0);
    if (name === 'clear') assert.equal(h.outbox[0].rfidTag, null);
  });
}

test('automatic expiry deactivation does not enqueue an explicit RFID assignment', async () => {
  const h = harness();
  h.input.userPayload.rfidTag = 'OLD-deactivated';
  h.input.rfidSync.requestedRfidTag = 'OLD';
  await h.gateway.saveMemberProfile(h.input);
  assert.equal(h.tag(), 'OLD-deactivated');
  assert.equal(h.outbox.length, 0);
});

test('stale unchanged form cannot overwrite a pending optimistic RFID assignment', async () => {
  const h = harness({ pending: true, currentTag: 'NEW' });
  h.input.userPayload.rfidTag = 'OLD';
  h.input.rfidSync.requestedRfidTag = 'OLD';
  await assert.rejects(h.gateway.saveMemberProfile(h.input), { code: 'rfid_update_pending' });
  assert.equal(h.tag(), 'NEW');
});
