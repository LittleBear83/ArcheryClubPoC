import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import test from "node:test";

import {
  createRfidAgentDistribution,
  RfidAgentDistributionError,
} from "./rfidAgentDistribution.js";

const validManifest = {
  latestVersion: "1.0.0",
  minimumVersion: "1.0.0",
  sha256: "a".repeat(64),
  publishedAt: "2026-09-19T12:00:00Z",
  releaseNotes: "Initial Windows RFID agent release.",
  objectPath:
    "windows/releases/1.0.0/Selby-RFID-Agent-Setup-1.0.0.exe",
};

function createStorage({ manifest = validManifest, installer = Buffer.from("installer") } = {}) {
  const requestedFiles = [];
  const stableContents =
    typeof manifest === "string"
      ? Buffer.from(manifest)
      : Buffer.from(JSON.stringify(manifest));

  return {
    requestedFiles,
    storage: {
      bucket(bucketName) {
        assert.equal(bucketName, "private-agent-bucket");

        return {
          file(objectPath) {
            requestedFiles.push(objectPath);

            if (objectPath === "windows/stable.json") {
              return {
                async download() {
                  return [stableContents];
                },
                async getMetadata() {
                  return [{ size: String(stableContents.length) }];
                },
              };
            }

            return {
              createReadStream() {
                return Readable.from([installer]);
              },
              async getMetadata() {
                return [{ size: String(installer.length) }];
              },
            };
          },
        };
      },
    },
  };
}

test("version metadata excludes the private bucket and installer object path", async () => {
  const fake = createStorage();
  const distribution = createRfidAgentDistribution({
    bucketName: "private-agent-bucket",
    storage: fake.storage,
  });

  assert.deepEqual(await distribution.getLatestVersion(), {
    latestVersion: "1.0.0",
    minimumVersion: "1.0.0",
    sha256: "a".repeat(64),
    publishedAt: "2026-09-19T12:00:00Z",
    releaseNotes: "Initial Windows RFID agent release.",
  });
  assert.deepEqual(fake.requestedFiles, ["windows/stable.json"]);
});

test("latest installer streams only a validated windows release object", async () => {
  const fake = createStorage();
  const distribution = createRfidAgentDistribution({
    bucketName: "private-agent-bucket",
    storage: fake.storage,
  });

  const installer = await distribution.openLatestInstaller();
  const chunks = [];
  for await (const chunk of installer.stream) {
    chunks.push(chunk);
  }

  assert.equal(installer.filename, "Selby-RFID-Agent-Setup-1.0.0.exe");
  assert.equal(installer.contentLength, 9);
  assert.equal(Buffer.concat(chunks).toString(), "installer");
  assert.deepEqual(fake.requestedFiles, [
    "windows/stable.json",
    "windows/releases/1.0.0/Selby-RFID-Agent-Setup-1.0.0.exe",
  ]);
});

test("malformed or missing stable manifests fail without opening a release", async () => {
  const malformed = createStorage({ manifest: "{not-json" });
  const malformedDistribution = createRfidAgentDistribution({
    bucketName: "private-agent-bucket",
    storage: malformed.storage,
  });

  await assert.rejects(
    malformedDistribution.getLatestVersion(),
    RfidAgentDistributionError,
  );

  const missingBucketDistribution = createRfidAgentDistribution({
    bucketName: "",
    storage: malformed.storage,
  });
  await assert.rejects(
    missingBucketDistribution.getLatestVersion(),
    RfidAgentDistributionError,
  );
});

test("installer paths outside windows releases are rejected", async () => {
  const fake = createStorage({
    manifest: {
      ...validManifest,
      objectPath: "windows/../../credentials.json",
    },
  });
  const distribution = createRfidAgentDistribution({
    bucketName: "private-agent-bucket",
    storage: fake.storage,
  });

  await assert.rejects(
    distribution.openLatestInstaller(),
    RfidAgentDistributionError,
  );
  assert.deepEqual(fake.requestedFiles, ["windows/stable.json"]);
});
