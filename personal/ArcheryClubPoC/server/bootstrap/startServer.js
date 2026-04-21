import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";

export function startServer({
  app,
  databasePath,
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
    app.use(express.static(distDirectory));

    app.get(/^\/(?!api).*/, (_req, res) => {
      res.sendFile(path.join(distDirectory, "index.html"));
    });
  }

  onBeforeListen?.();

  const server = app.listen(port, () => {
    console.log(`App and auth server listening on http://localhost:${port}`);
    console.log(`SQLite database: ${databasePath}`);
    if (existsSync(distDirectory)) {
      console.log(`Serving frontend from: ${distDirectory}`);
    }
  });

  server.headersTimeout = headersTimeoutMs;
  server.keepAliveTimeout = keepAliveTimeoutMs;
  server.requestTimeout = requestTimeoutMs;

  return server;
}
