import { Buffer } from "node:buffer";

const METADATA_TOKEN_URL = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

export function createGoldenRecordsManualTaskQueue({
  queueName,
  workerUrl,
  invokerServiceAccount,
  fetchImpl = fetch,
}) {
  if (!/^projects\/[^/]+\/locations\/[^/]+\/queues\/[^/]+$/.test(queueName ?? "") ||
      !workerUrl?.startsWith("https://") || !invokerServiceAccount) {
    throw new Error("Golden Records manual task queue configuration is incomplete.");
  }
  const audience = workerUrl.replace(/\/$/, "");
  return {
    async enqueue({ id, actorUsername }) {
      const tokenResponse = await fetchImpl(METADATA_TOKEN_URL, {
        headers: { "Metadata-Flavor": "Google" },
        signal: AbortSignal.timeout(5000),
      });
      if (!tokenResponse.ok) throw new Error("Could not obtain Cloud Run task credentials.");
      const { access_token: accessToken } = await tokenResponse.json();
      if (!accessToken) throw new Error("Cloud Run task credentials were empty.");
      const task = {
        task: {
          name: `${queueName}/tasks/gr-${id}`,
          dispatchDeadline: "1800s",
          httpRequest: {
            url: `${audience}/api/internal/golden-records/manual-sync`,
            httpMethod: "POST",
            headers: { "Content-Type": "application/json" },
            body: Buffer.from(JSON.stringify({ id, actorUsername })).toString("base64"),
            oidcToken: { serviceAccountEmail: invokerServiceAccount, audience },
          },
        },
      };
      const response = await fetchImpl(`https://cloudtasks.googleapis.com/v2/${queueName}/tasks`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(task),
        signal: AbortSignal.timeout(15000),
      });
      // A timed-out create may already have succeeded. Its stable task name
      // makes ALREADY_EXISTS a successful retry rather than a duplicate run.
      if (response.status === 409) return;
      if (!response.ok) throw new Error(`Cloud Tasks rejected Golden Records sync (${response.status}).`);
    },
  };
}
