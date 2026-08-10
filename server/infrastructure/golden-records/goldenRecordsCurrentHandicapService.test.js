import assert from "node:assert/strict";
import test from "node:test";
import { createGoldenRecordsCurrentHandicapService } from "./goldenRecordsCurrentHandicapService.js";

test("Golden Records achievements pagination continues until a partial page is returned", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;

  try {
    const fetchCalls = [];
    globalThis.setTimeout = (callback) => {
      callback();
      return 0;
    };
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      fetchCalls.push(url.toString());

      if (url.pathname === "/api/currenthandicaps") {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () =>
            JSON.stringify([
              {
                bow_class: "Recurve",
                handicap: 42,
                member_id: "gr-123",
                name: "Robin Archer",
                type: "Outdoor",
              },
            ]),
        };
      }

      if (url.pathname === "/api/currentclassifications") {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () => JSON.stringify([]),
        };
      }

      if (url.pathname === "/api/achievements") {
        const pageNumber = Number.parseInt(url.searchParams.get("pageNumber"), 10);
        const pageSize = Number.parseInt(url.searchParams.get("pageSize"), 10);

        const rows =
          pageNumber <= 40
            ? Array.from({ length: pageSize }, (_, index) => ({
                achieved: `2026-06-${String(((pageNumber - 1) * pageSize + index) % 28).padStart(2, "0")}T09:00:00Z`,
                achievement: "Sight mark 20 yds",
                achievement_id: `ach-${pageNumber}-${index}`,
                age_group: "Senior",
                bow_class: "Recurve",
                member_id: "gr-123",
                name: "Robin Archer",
                round: "",
              }))
            : [
                {
                  achieved: "2026-08-01T09:00:00Z",
                  achievement: "Sight mark 20 yds",
                  achievement_id: "ach-41-0",
                  age_group: "Senior",
                  bow_class: "Recurve",
                  member_id: "gr-123",
                  name: "Robin Archer",
                  round: "",
                },
              ];

        return {
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () => JSON.stringify(rows),
        };
      }

      throw new Error(`Unexpected fetch URL: ${url.toString()}`);
    };

    const service = createGoldenRecordsCurrentHandicapService({
      apiKey: "test-key",
      authMode: "api-key",
      baseUrl: "https://api2.archery-records.net",
      timeoutMs: 50,
      userAgent: "ArcheryClubPoC/Test",
    });

    const snapshot = await service.getSnapshotForMember({
      archeryGbMembershipNumber: "",
      firstName: "Robin",
      goldenRecordsId: "gr-123",
      surname: "Archer",
      username: "robin",
    });

    assert.equal(snapshot.achievements.length, 4001);
    assert.equal(
      fetchCalls.filter((entry) => entry.includes("/api/achievements")).length,
      41,
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});
