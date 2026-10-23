import assert from "node:assert/strict";
import test from "node:test";
import { createRememberedDeviceService } from "./rememberedDeviceService.js";
import { REMEMBERED_DEVICE_MAX_AGE_SECONDS } from "../../../shared/rememberedDevicePolicy.js";

function harness() {
  const records = new Map();
  let currentTime = new Date("2026-10-22T12:00:00Z");
  const gateway = {
    async insert(record) { records.set(record.tokenHash, {
      user_id: record.userId, username: "archer",
      credential_fingerprint: record.credentialFingerprint,
      expires_at: record.expiresAt,
    }); },
    async findByTokenHash(hash) { return records.get(hash) ?? null; },
    async revokeByTokenHash(hash) { records.delete(hash); },
  };
  const service = createRememberedDeviceService({ gateway, secret: "test-secret", now: () => currentTime });
  const user = { id: 1, username: "archer", password: "stored-password-hash", active_member: 1 };
  return { records, service, user, setTime: (value) => { currentTime = new Date(value); } };
}

test("remembered device tokens are distinct, hashed at rest, and expire absolutely", async () => {
  const { records, service, user, setTime } = harness();
  const first = await service.issue(user);
  const second = await service.issue(user);
  assert.notEqual(first.token, second.token);
  assert.equal(records.size, 2);
  assert.doesNotMatch(JSON.stringify([...records]), new RegExp(first.token));
  assert.equal(first.expiresAt.toISOString(), "2026-10-29T12:00:00.000Z");
  setTime("2026-10-28T12:00:00Z");
  const authenticated = await service.authenticate(first.token, async () => user);
  assert.equal(authenticated.user.username, "archer");
  assert.equal(authenticated.remainingSeconds, 24 * 60 * 60);
  assert.equal(first.expiresAt.getTime() - new Date("2026-10-22T12:00:00Z").getTime(),
    REMEMBERED_DEVICE_MAX_AGE_SECONDS * 1000);
  setTime("2026-10-29T12:00:00Z");
  assert.equal(await service.authenticate(first.token, async () => user), null);
  assert.equal(records.size, 1);
});

test("explicit device revocation preserves other devices and rejects invalid tokens", async () => {
  const { records, service, user } = harness();
  const first = await service.issue(user);
  const second = await service.issue(user);
  await service.revoke(first.token);
  assert.equal(await service.authenticate(first.token, async () => user), null);
  assert.equal((await service.authenticate(second.token, async () => user)).user.id, 1);
  assert.equal(await service.authenticate("invalid", async () => user), null);
  assert.equal(records.size, 1);
});

test("changed credentials and inactive membership invalidate remembered access", async () => {
  const { records, service, user } = harness();
  const changed = await service.issue(user);
  assert.equal(await service.authenticate(changed.token,
    async () => ({ ...user, password: "new-stored-hash" })), null);
  const inactive = await service.issue(user);
  assert.equal(await service.authenticate(inactive.token,
    async () => ({ ...user, active_member: 0 })), null);
  assert.equal(records.size, 0);
});
