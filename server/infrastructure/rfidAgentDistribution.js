import { Storage } from "@google-cloud/storage";
import { Buffer } from "node:buffer";
import process from "node:process";

const STABLE_MANIFEST_OBJECT = "windows/stable.json";
const RELEASE_OBJECT_PREFIX = "windows/releases/";
const MAX_MANIFEST_BYTES = 64 * 1024;
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.-]{0,63}$/u;
const SHA256_PATTERN = /^[a-fA-F0-9]{64}$/u;

export class RfidAgentDistributionError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "RfidAgentDistributionError";
  }
}

function requireString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new RfidAgentDistributionError(
      `RFID agent manifest field ${fieldName} is invalid.`,
    );
  }

  return value.trim();
}

function validateReleaseNotes(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((note) => typeof note === "string" && note.trim())
  ) {
    return value.map((note) => note.trim());
  }

  throw new RfidAgentDistributionError(
    "RFID agent manifest field releaseNotes is invalid.",
  );
}

function resolveInstallerObjectPath(value) {
  const candidates = [
    value.objectPath,
    value.installerObject,
    value.installerObjectPath,
    value.installerPath,
  ].filter((candidate) => candidate !== undefined);

  if (candidates.length === 0) {
    throw new RfidAgentDistributionError(
      "RFID agent manifest installer object path is missing.",
    );
  }

  const objectPath = requireString(candidates[0], "objectPath");
  if (
    candidates.some(
      (candidate) => requireString(candidate, "objectPath") !== objectPath,
    )
  ) {
    throw new RfidAgentDistributionError(
      "RFID agent manifest installer object paths conflict.",
    );
  }

  return objectPath;
}

export function validateRfidAgentManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RfidAgentDistributionError("RFID agent manifest must be an object.");
  }

  const latestVersion = requireString(value.latestVersion, "latestVersion");
  const minimumVersion = requireString(value.minimumVersion, "minimumVersion");
  const sha256 = requireString(value.sha256, "sha256").toLowerCase();
  const publishedAt = requireString(value.publishedAt, "publishedAt");
  const releaseNotes = validateReleaseNotes(value.releaseNotes);
  const objectPath = resolveInstallerObjectPath(value);

  if (
    !VERSION_PATTERN.test(latestVersion) ||
    !VERSION_PATTERN.test(minimumVersion)
  ) {
    throw new RfidAgentDistributionError("RFID agent manifest version is invalid.");
  }

  if (!SHA256_PATTERN.test(sha256)) {
    throw new RfidAgentDistributionError("RFID agent manifest SHA-256 is invalid.");
  }

  if (!Number.isFinite(Date.parse(publishedAt))) {
    throw new RfidAgentDistributionError(
      "RFID agent manifest publication date is invalid.",
    );
  }

  const pathSegments = objectPath.split("/");
  if (
    !objectPath.startsWith(RELEASE_OBJECT_PREFIX) ||
    objectPath.includes("\\") ||
    pathSegments.includes("..") ||
    pathSegments.some((segment) => !segment) ||
    !objectPath.toLowerCase().endsWith(".exe")
  ) {
    throw new RfidAgentDistributionError(
      "RFID agent installer object path is invalid.",
    );
  }

  return {
    latestVersion,
    minimumVersion,
    sha256,
    publishedAt,
    releaseNotes,
    objectPath,
  };
}

function publicReleaseMetadata(manifest) {
  return {
    latestVersion: manifest.latestVersion,
    minimumVersion: manifest.minimumVersion,
    sha256: manifest.sha256,
    publishedAt: manifest.publishedAt,
    releaseNotes: manifest.releaseNotes,
  };
}

export function createRfidAgentDistribution({
  bucketName = process.env.RFID_AGENT_BUCKET,
  storage = new Storage(),
} = {}) {
  const configuredBucketName = String(bucketName ?? "").trim();

  const getBucket = () => {
    if (!configuredBucketName) {
      throw new RfidAgentDistributionError(
        "RFID agent distribution bucket is not configured.",
      );
    }

    return storage.bucket(configuredBucketName);
  };

  const readStableManifest = async () => {
    try {
      const file = getBucket().file(STABLE_MANIFEST_OBJECT);
      const [metadata] = await file.getMetadata();
      const size = Number(metadata?.size ?? 0);

      if (!Number.isSafeInteger(size) || size < 1 || size > MAX_MANIFEST_BYTES) {
        throw new RfidAgentDistributionError(
          "RFID agent manifest size is invalid.",
        );
      }

      const [contents] = await file.download();
      if (!Buffer.isBuffer(contents) || contents.length > MAX_MANIFEST_BYTES) {
        throw new RfidAgentDistributionError(
          "RFID agent manifest content is invalid.",
        );
      }

      let parsed;
      try {
        parsed = JSON.parse(contents.toString("utf8"));
      } catch (error) {
        throw new RfidAgentDistributionError(
          "RFID agent manifest JSON is invalid.",
          { cause: error },
        );
      }

      return validateRfidAgentManifest(parsed);
    } catch (error) {
      if (error instanceof RfidAgentDistributionError) {
        throw error;
      }

      throw new RfidAgentDistributionError(
        "RFID agent manifest could not be read.",
        { cause: error },
      );
    }
  };

  return {
    async getLatestVersion() {
      return publicReleaseMetadata(await readStableManifest());
    },

    async openLatestInstaller() {
      const manifest = await readStableManifest();

      try {
        const file = getBucket().file(manifest.objectPath);
        const [metadata] = await file.getMetadata();

        return {
          contentLength: Number(metadata?.size ?? 0),
          filename: `Selby-RFID-Agent-Setup-${manifest.latestVersion}.exe`,
          stream: file.createReadStream(),
        };
      } catch (error) {
        throw new RfidAgentDistributionError(
          "RFID agent installer could not be opened.",
          { cause: error },
        );
      }
    },
  };
}
