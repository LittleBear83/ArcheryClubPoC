import assert from "node:assert/strict";
import test from "node:test";
import { createGoldenRecordsOutdoorSync } from "./goldenRecordsOutdoorSync.js";

test("outdoor sync ignores awards for another Golden Records member or an unowned bow", async () => {
  const created = [];
  const sync = createGoldenRecordsOutdoorSync({
    getUtcTimestampParts: () => ["2026-10-21", "10:00:00"],
    outdoorTableGateway: {
      listEntriesByYear: async () => [],
      createEntry: async (entry) => { created.push(entry); return entry; },
    },
  });
  const result = await sync({
    disciplines: ["Recurve Bow"],
    goldenRecordsSnapshot: {
      matchedMemberId: "matched",
      achievements: [
        { achievement: "Archer 3rd", achieved: "2026-01-01", bowClass: "Recurve", memberId: "other" },
        { achievement: "Archer 3rd", achieved: "2026-01-02", bowClass: "Compound", memberId: "matched" },
        { achievement: "Archer 3rd", achieved: "2026-01-03", bowClass: "Recurve", memberId: "matched" },
      ],
    },
    user: { username: "archer" },
  });
  assert.deepEqual(result, { createdCount: 1, syncedCount: 1, updatedCount: 0 });
  assert.equal(created.length, 1);
  assert.equal(created[0].bowType, "Rec");
  assert.equal(created[0].archer3rdDate, "2026-01-03");
});
