import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";

export function startServer({
  app,
  bindHost,
  databaseEngine,
  databasePath,
  databaseUrl,
  distDirectory,
  headersTimeoutMs,
  keepAliveTimeoutMs,
  onBeforeListen,
  port,
  requestTimeoutMs,
}) {
  if (existsSync(distDirectory)) {
    // In preview/live mode the same Express process serves the built frontend
    // and falls back to index.html for client-side routes.
    app.use(express.static(distDirectory, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
          return;
        }

        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }));

    app.get(/^\/(?!api).*/, (_req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(path.join(distDirectory, "index.html"));
    });
  }

  onBeforeListen?.();

  const server = app.listen({ port, ...(bindHost ? { host: bindHost } : {}) }, () => {
    console.log(`Backend/API server listening on http://localhost:${port}`);
    if (databaseEngine === "postgres") {
      console.log(
        `PostgreSQL database: ${databaseUrl ? "DATABASE_URL" : "configured connection settings"}`,
      );
    } else {
      console.log(`SQLite database: ${databasePath}`);
    }
    if (existsSync(distDirectory)) {
      console.log(`Serving frontend from: ${distDirectory}`);
    } else {
      console.log("Frontend dev app: http://localhost:5173");
    }
  });

  server.headersTimeout = headersTimeoutMs;
  server.keepAliveTimeout = keepAliveTimeoutMs;
  server.requestTimeout = requestTimeoutMs;

  return server;
}
