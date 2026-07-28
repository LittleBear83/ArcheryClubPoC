import assert from "node:assert/strict";
import test from "node:test";
import { createGoldenRecordsMemberSyncService } from "./goldenRecordsMemberSyncService.js";

test("Golden Records sync still returns outdoor updates when distance sign-off refresh fails", async () => {
  const createdEntries = [];
  const service = createGoldenRecordsMemberSyncService({
    distanceSignOffYards: [20, 30, 40, 50, 60, 80, 100],
    getUtcTimestampParts: () => ["2026-07-28", "12:00:00"],
    goldenRecordsCurrentHandicapService: {
      isEnabled: true,
      getSnapshotForMember: async () => ({
        achievements: [
          {
            achievement: "Archer 3rd",
            achieved: "2026-06-12T09:00:00Z",
            bowClass: "Recurve",
            memberId: "gr-123",
            round: "",
          },
          {
            achievement: "Sight mark 20 yds",
            achieved: "2026-06-01T09:00:00Z",
            bowClass: "Recurve",
            memberId: "gr-123",
            round: "",
          },
        ],
        candidateMatches: [],
        classifications: [],
        enabled: true,
        fetchedAt: "2026-07-28T12:00:00Z",
        handicaps: [
          {
            bowClass: "Recurve",
            handicap: 41,
            type: "Outdoor",
          },
        ],
        matchedMemberId: "gr-123",
        matchedMemberName: "Robin Archer",
        matchSource: "matched-id",
      }),
    },
    goldenRecordsSyncGateway: {
      findByUsername: async () => null,
      upsertSnapshot: async () => {},
    },
    memberDirectoryGateway: {
      findDisciplinesByUsername: async () => [{ discipline: "Recurve Bow" }],
      listAllUsers: async () => [],
      updateGoldenRecordsId: async () => {},
    },
    memberDistanceSignOffRepository: {
      replaceForDiscipline: async () => {
        throw new Error("sign-off replace failed");
      },
    },
    outdoorTableGateway: {
      createEntry: async (entry) => {
        createdEntries.push(entry);
        return {
          id: 1,
          ...entry,
        };
      },
      listEntriesByYear: async () => [],
      updateEntry: async (entry) => entry,
    },
  });

  const result = await service.syncMember({
    archery_gb_membership_number: "123456",
    first_name: "Robin",
    gr_id: "gr-123",
    surname: "Archer",
    username: "robin",
  });

  assert.equal(result.createdCount, 1);
  assert.equal(result.syncedCount, 1);
  assert.equal(result.signOffCount, 0);
  assert.equal(result.signOffError, "sign-off replace failed");
  assert.equal(createdEntries.length, 1);
});
