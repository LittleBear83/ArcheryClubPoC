import assert from "node:assert/strict";
import { test } from "node:test";
import { Buffer } from "node:buffer";
import express from "express";
import http from "node:http";
import { createRateLimiter } from "./rateLimit.js";

async function startTestServer() {
  const app = express();
  const limiter = createRateLimiter({
    isLimitedPath: (req) => req.path.startsWith("/api/"),
    maxAttempts: 2,
    windowMs: 60000,
  });

  app.use(limiter.middleware);
  app.use(express.json({ limit: "32b" }));
  app.get("/api/ping", (_req, res) => {
    res.json({ success: true });
  });
  app.post("/api/body", (_req, res) => {
    res.json({ success: true });
  });
  app.use((error, _req, res, next) => {
    if (error?.type === "entity.too.large") {
      res.status(413).json({
        success: false,
        message: "Request body is too large.",
      });
      return;
    }

    next(error);
  });

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return { baseUrl, server };
}

function requestJson(baseUrl, path, { body = null, method = "GET" } = {}) {
  const url = new URL(path, baseUrl);
  const payload = body == null ? "" : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const request = http.request(
      url,
      {
        headers: payload
          ? {
              "content-length": Buffer.byteLength(payload),
              "content-type": "application/json",
            }
          : {},
        method,
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
    request.end(payload);
  });
}

test("global API rate limiter rejects requests after the configured limit", async () => {
  const { baseUrl, server } = await startTestServer();

  try {
    assert.equal((await requestJson(baseUrl, "/api/ping")).status, 200);
    assert.equal((await requestJson(baseUrl, "/api/ping")).status, 200);

    const response = await requestJson(baseUrl, "/api/ping");

    assert.equal(response.status, 429);
    assert.equal(response.body.success, false);
    assert.equal(response.headers["retry-after"], "60");
  } finally {
    server.close();
  }
});

test("JSON body parser rejects oversized requests", async () => {
  const { baseUrl, server } = await startTestServer();

  try {
    const response = await requestJson(baseUrl, "/api/body", {
      body: {
        value: "this payload is intentionally longer than thirty two bytes",
      },
      method: "POST",
    });

    assert.equal(response.status, 413);
    assert.equal(response.body.success, false);
  } finally {
    server.close();
  }
});
