import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRootDirectory = path.resolve(__dirname, "..");
const dataDirectory = path.join(serverRootDirectory, "data");
const exportsDirectory = path.join(dataDirectory, "exports");
const appMode = process.env.ARCHERY_APP_MODE ?? process.env.APP_ENV ?? "development";
const isLive = ["live", "production"].includes(appMode.toLowerCase());
const databasePath =
  process.env.DATABASE_PATH ??
  path.join(dataDirectory, isLive ? "auth.live.sqlite" : "auth.sqlite");
const distDirectory = path.join(serverRootDirectory, "..", "dist");
const port = Number(process.env.PORT ?? 3001);
const rfidReaderNames = [
  process.env.RFID_READER_NAME,
  "ACS ACR122U PICC Interface 0",
  "ACS ACR122 0",
  "ACR122 Smart Card Reader",
].filter(Boolean);

export const serverRuntime = {
  dataDirectory,
  databasePath,
  distDirectory,
  exportsDirectory,
  appMode,
  isLive,
  port,
  rfidReaderNames,
};
