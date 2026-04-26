import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import http from "node:http";
import { createCsrfProtection } from "./csrf.js";

async function startTestServer() {
  const app = express();
  const csrf = createCsrfProtection({
    excludedPaths: new Set(["/api/auth/login"]),
    secret: "test-csrf-secret",
  });

  app.use(express.json());
  app.use(csrf.middleware);
  app.get("/api/auth/csrf", (req, res) => {
    const csrfToken = csrf.getToken(req);

    res.setHeader("Set-Cookie", csrf.createCookie(csrfToken));
    res.json({ success: true, csrfToken });
  });
  app.post("/api/auth/login", (_req, res) => {
    res.json({ success: true });
  });
  app.post("/api/protected", (_req, res) => {
    res.json({ success: true });
  });

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return { baseUrl, server };
}

function requestJson(baseUrl, path, { headers = {}, method = "GET" } = {}) {
  const url = new URL(path, baseUrl);

  return new Promise((resolve, reject) => {
    const request = http.request(
      url,
      {
        headers,
        method,
      },
      (response) => {
        let body = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({
            body: body ? JSON.parse(body) : null,
            headers: response.headers,
            status: response.statusCode,
          });
        });
      },
    );

    request.on("error", reject);
    request.end();
  });
}

test("CSRF middleware rejects mutating API requests without a token", async () => {
  const { baseUrl, server } = await startTestServer();

  try {
    const response = await requestJson(baseUrl, "/api/protected", {
      method: "POST",
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.success, false);
  } finally {
    server.close();
  }
});

test("CSRF middleware rejects mismatched cookie and header tokens", async () => {
  const { baseUrl, server } = await startTestServer();

  try {
    const csrfResponse = await requestJson(baseUrl, "/api/auth/csrf");
    const { csrfToken } = csrfResponse.body;

    const response = await requestJson(baseUrl, "/api/protected", {
      method: "POST",
      headers: {
        cookie: `archeryclubpoc_csrf=${encodeURIComponent(csrfToken)}`,
        "x-csrf-token": "invalid-token",
      },
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.success, false);
  } finally {
    server.close();
  }
});

test("CSRF middleware allows matching signed cookie and header tokens", async () => {
  const { baseUrl, server } = await startTestServer();

  try {
    const csrfResponse = await requestJson(baseUrl, "/api/auth/csrf");
    const { csrfToken } = csrfResponse.body;

    const response = await requestJson(baseUrl, "/api/protected", {
      method: "POST",
      headers: {
        cookie: `archeryclubpoc_csrf=${encodeURIComponent(csrfToken)}`,
        "x-csrf-token": csrfToken,
      },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { success: true });
  } finally {
    server.close();
  }
});

test("CSRF middleware allows explicitly excluded session creation routes", async () => {
  const { baseUrl, server } = await startTestServer();

  try {
    const response = await requestJson(baseUrl, "/api/auth/login", {
      method: "POST",
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { success: true });
  } finally {
    server.close();
  }
});
