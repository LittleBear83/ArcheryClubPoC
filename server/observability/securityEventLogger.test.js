import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import http from "node:http";
import { test } from "node:test";
import express from "express";
import {
  createSecurityEventLogger,
  logServerError,
} from "./securityEventLogger.js";

async function startTestServer(logger, securityEventLoggerOptions = {}) {
  const app = express();

  app.use(
    createSecurityEventLogger({
      alertThreshold: 3,
      alertWindowMs: 60000,
      getActorUsername: () => "auditor",
      getClientIp: () => "203.0.113.10",
      logger,
      ...securityEventLoggerOptions,
    }),
  );
  app.get("/ok", (_req, res) => {
    res.json({ success: true });
  });
  app.get("/private", (_req, res) => {
    res.status(401).json({ success: false });
  });
  app.get("/forbidden", (_req, res) => {
    res.status(403).json({ success: false });
  });
  app.get("/limited", (_req, res) => {
    res.status(429).json({ success: false });
  });
  app.get("/boom", () => {
    throw new Error("database offline");
  });
  app.use((error, req, res, next) => {
    void next;

    logServerError({
      error,
      getActorUsername: () => "auditor",
      getClientIp: () => "203.0.113.10",
      logger,
      req,
      statusCode: 500,
    });
    res.status(500).json({ success: false });
  });

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return { baseUrl, server };
}

function requestJson(baseUrl, path) {
  const url = new URL(path, baseUrl);

  return new Promise((resolve, reject) => {
    const request = http.request(
      url,
      {
        headers: {
          "content-length": 0,
          "user-agent": "security-test",
        },
      },
      (response) => {
        let responseBody = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          resolve({
            body: responseBody ? JSON.parse(responseBody) : null,
            headers: response.headers,
            status: response.statusCode,
          });
        });
      },
    );

    request.on("error", reject);
    request.end(Buffer.alloc(0));
  });
}

test("security event logger records denied, rate-limited, and server-error responses", async () => {
  const warnEvents = [];
  const errorEvents = [];
  const logger = {
    error: (event) => errorEvents.push(event),
    warn: (event) => warnEvents.push(event),
  };
  const { baseUrl, server } = await startTestServer(logger);

  try {
    assert.equal((await requestJson(baseUrl, "/ok")).status, 200);
    assert.equal((await requestJson(baseUrl, "/private")).status, 401);
    assert.equal((await requestJson(baseUrl, "/forbidden")).status, 403);
    assert.equal((await requestJson(baseUrl, "/limited")).status, 429);
    assert.equal((await requestJson(baseUrl, "/boom")).status, 500);

    assert.deepEqual(
      warnEvents
        .filter((event) => event.event === "security.http_response")
        .map((event) => event.statusCode),
      [401, 403, 429],
    );
    assert.ok(
      warnEvents
        .filter((event) => event.event === "security.http_response")
        .every(
        (event) =>
          event.event === "security.http_response" &&
          event.ipAddress === "203.0.113.10" &&
          event.userAgent === "security-test" &&
          event.actorUsername === "auditor",
        ),
    );
    assert.ok(
      errorEvents.some(
        (event) =>
          event.event === "security.server_error" &&
          event.statusCode === 500 &&
          event.errorName === "Error" &&
          event.errorMessage === "database offline",
      ),
    );
    assert.ok(
      errorEvents.some(
        (event) =>
          event.event === "security.http_response" &&
          event.statusCode === 500,
      ),
    );
    assert.ok(
      warnEvents.some(
        (event) =>
          event.event === "security.alert.threshold" &&
          event.ipAddress === "203.0.113.10" &&
          event.count === 3 &&
          event.threshold === 3 &&
          event.statuses["401"] === 1 &&
          event.statuses["403"] === 1 &&
          event.statuses["429"] === 1,
      ),
    );
  } finally {
    server.close();
  }
});
