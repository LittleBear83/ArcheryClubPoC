import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createRememberedDeviceGateway } from "./rememberedDeviceGateway.js";
import { createRememberedDeviceService } from "../../domain/services/rememberedDeviceService.js";

test("SQLite revokes every device on password reset or deactivation", async () => {
  const db = new Database(":memory:");
  try {
    db.pragma("foreign_keys = ON");
    db.exec(`CREATE TABLE users (
      id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT, active_member INTEGER
    ); INSERT INTO users (id, username, password, active_member)
      VALUES (1, 'archer', 'first-hash', 1);`);
    const gateway = createRememberedDeviceGateway({ databaseEngine: "sqlite", db });
    const service = createRememberedDeviceService({ gateway, secret: "test-secret" });
    const user = () => db.prepare("SELECT * FROM users WHERE id = 1").get();

    await service.issue(user());
    await service.issue(user());
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM remembered_devices").get().count, 2);
    db.prepare("UPDATE users SET password = ? WHERE id = 1").run("reset-hash");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM remembered_devices").get().count, 0);

    const remembered = await service.issue(user());
    db.prepare("UPDATE users SET active_member = 0 WHERE id = 1").run();
    db.prepare("UPDATE users SET active_member = 1 WHERE id = 1").run();
    assert.equal(await service.authenticate(remembered.token, async () => user()), null);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM remembered_devices").get().count, 0);
  } finally {
    db.close();
  }
});
