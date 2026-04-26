process.env.ARCHERY_APP_MODE = process.env.ARCHERY_APP_MODE ?? "live";

await import("../server/index.js");
