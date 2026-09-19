import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import http from "node:http";
import { Readable } from "node:stream";
import test from "node:test";

import express from "express";
import { registerRfidAgentDistributionRoutes } from "./registerRfidAgentDistributionRoutes.js";

const PERMISSIONS = { MANAGE_MEMBERS: "manage_members" };

async function startServer(distribution) {
  const app = express();
  const errors = [];

  registerRfidAgentDistributionRoutes({
    actorHasPermission: (actor, permission) =>
      actor.permissions.includes(permission),
    app,
    distribution,
    getActorUser: (req) => {
      const permissionHeader = req.headers["x-test-permissions"];
      if (!permissionHeader) {
        return null;
      }

      return {
        permissions: String(permissionHeader).split(","),
        username: "test-user",
      };
    },
    logger: {
      error(message) {
        errors.push(message);
      },
    },
    PERMISSIONS,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    errors,
    server,
    url: `http://127.0.0.1:${server.address().port}`,
  };
}

async function closeServer(server) {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

async function request(url, { headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          body: Buffer.concat(chunks),
          headers: response.headers,
          status: response.statusCode,
        });
      });
    });
    request.on("error", reject);
  });
}

test("ordinary and unauthenticated members receive 403", async () => {
  let calls = 0;
  const fixture = await startServer({
    async getLatestVersion() {
      calls += 1;
    },
    async openLatestInstaller() {
      calls += 1;
    },
  });

  try {
    for (const path of [
      "/api/admin/rfid-agent/version",
      "/api/admin/rfid-agent/download/latest",
    ]) {
      const unauthenticated = await request(`${fixture.url}${path}`);
      assert.equal(unauthenticated.status, 403);

      const ordinaryMember = await request(`${fixture.url}${path}`, {
        headers: { "x-test-permissions": "view_profile" },
      });
      assert.equal(ordinaryMember.status, 403);
    }

    assert.equal(calls, 0);
  } finally {
    await closeServer(fixture.server);
  }
});

test("manage members permission can read public release metadata", async () => {
  const release = {
    latestVersion: "1.0.0",
    minimumVersion: "1.0.0",
    sha256: "a".repeat(64),
    publishedAt: "2026-09-19T12:00:00Z",
    releaseNotes: "Initial release.",
  };
  const fixture = await startServer({
    async getLatestVersion() {
      return release;
    },
  });

  try {
    const response = await request(
      `${fixture.url}/api/admin/rfid-agent/version`,
      { headers: { "x-test-permissions": "manage_members" } },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body.toString("utf8")), release);
    assert.equal(response.headers.location, undefined);
    assert.equal(response.headers["cache-control"], "private, no-store");
  } finally {
    await closeServer(fixture.server);
  }
});

test("manage members permission receives a versioned installer attachment", async () => {
  const bytes = Buffer.from("private-installer");
  const fixture = await startServer({
    async openLatestInstaller() {
      return {
        contentLength: bytes.length,
        filename: "Selby-RFID-Agent-Setup-1.0.0.exe",
        stream: Readable.from([bytes]),
      };
    },
  });

  try {
    const response = await request(
      `${fixture.url}/api/admin/rfid-agent/download/latest`,
      { headers: { "x-test-permissions": "manage_members" } },
    );

    assert.equal(response.status, 200);
    assert.equal(
      response.headers["content-type"],
      "application/octet-stream",
    );
    assert.equal(
      response.headers["content-disposition"],
      'attachment; filename="Selby-RFID-Agent-Setup-1.0.0.exe"',
    );
    assert.equal(response.headers["cache-control"], "private, no-store");
    assert.deepEqual(response.body, bytes);
  } finally {
    await closeServer(fixture.server);
  }
});

test("manifest failures return generic safe responses", async () => {
  const fixture = await startServer({
    async getLatestVersion() {
      throw new Error("private bucket details");
    },
    async openLatestInstaller() {
      throw new Error("private object details");
    },
  });

  try {
    for (const path of [
      "/api/admin/rfid-agent/version",
      "/api/admin/rfid-agent/download/latest",
    ]) {
      const response = await request(`${fixture.url}${path}`, {
        headers: { "x-test-permissions": "manage_members" },
      });
      const body = JSON.parse(response.body.toString("utf8"));

      assert.equal(response.status, 503);
      assert.deepEqual(body, {
        success: false,
        message: "RFID agent release information is unavailable.",
      });
      assert.equal(JSON.stringify(body).includes("bucket"), false);
      assert.equal(JSON.stringify(body).includes("object"), false);
    }
    assert.deepEqual(fixture.errors, [
      "RFID agent version lookup failed",
      "RFID agent download failed",
    ]);
  } finally {
    await closeServer(fixture.server);
  }
});
