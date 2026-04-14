import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";

export function startServer({
  app,
  databasePath,
  distDirectory,
  onBeforeListen,
  port,
}) {
  if (existsSync(distDirectory)) {
    app.use(express.static(distDirectory));

    app.get(/^\/(?!api).*/, (_req, res) => {
      res.sendFile(path.join(distDirectory, "index.html"));
    });
  }

  onBeforeListen?.();

  app.listen(port, () => {
    console.log(`App and auth server listening on http://localhost:${port}`);
    console.log(`SQLite database: ${databasePath}`);
    if (existsSync(distDirectory)) {
      console.log(`Serving frontend from: ${distDirectory}`);
    }
  });
}
