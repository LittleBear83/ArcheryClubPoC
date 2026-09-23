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

      if (url.pathname === "/api/members") return { ok: true, text: async () => JSON.stringify([{ member_id: "gr-123" }]) };
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

    assert.equal(snapshot.achievements.length, 40001);
    assert.equal(
      fetchCalls.filter((entry) => entry.includes("/api/achievements")).length,
      41,
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("club pagination, safe matching, grouping and archived members", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const calls = [];
  try {
    globalThis.setTimeout = (callback) => { callback(); return 0; };
    globalThis.fetch = async (input, options) => {
      const url = new URL(input);
      calls.push(url);
      assert.equal(options.headers.Authorization, "Basic test-key");
      const page = Number(url.searchParams.get("pageNumber"));
      assert.equal(url.searchParams.get("pageSize"), "1000");
      let rows = [];
      if (url.pathname === "/api/members") rows = page === 1
        ? Array.from({length: 1000}, (_, index) => ({member_id: `filler-${index}`}))
        : [
          { member_id: "id", membership_id: "agb", email: "MEMBER@example.com", name: "Robin Archer" },
          { member_id: "archived", membership_id: "old", member_archived: true },
          { member_id: "duplicate-a", membership_id: "duplicate" },
          { member_id: "duplicate-b", membership_id: "duplicate" },
        ];
      if (url.pathname === "/api/Achievements") rows = page === 1
        ? Array.from({length: 1000}, (_, index) => ({member_id: "other", achievement_id: index}))
        : [{member_id: "id", achievement_id: "last", achievement: "252@50YDS/3"}];
      return { ok: true, status: 200, text: async () => JSON.stringify(rows) };
    };
    const service = createGoldenRecordsCurrentHandicapService({ apiKey: "test-key", baseUrl: "https://api2.archery-records.net", logger: {info() {}} });
    const clubData = await service.fetchClubData();
    assert.equal(clubData.members.length, 1004);
    assert.equal(clubData.achievementsByMember.get("other").length, 1000);
    assert.equal(calls.filter((url) => url.pathname === "/api/members").length, 2);
    assert.equal(calls.filter((url) => url.pathname === "/api/Achievements").length, 2);
    for (const [criteria, expected] of [
      [{goldenRecordsId: "id", archeryGbMembershipNumber: "duplicate"}, "gr-id"],
      [{archeryGbMembershipNumber: "agb"}, "membership-id"],
      [{email: " member@EXAMPLE.com "}, "email"],
      [{firstName: "Robin", surname: "Archer"}, "name"],
      [{goldenRecordsId: "archived", archeryGbMembershipNumber: "old"}, "not-found"],
      [{archeryGbMembershipNumber: "duplicate"}, "ambiguous"],
    ]) {
      const snapshot = await service.getSnapshotForMember({...criteria, clubData});
      assert.equal(snapshot.matchSource, expected);
      if (snapshot.matchedMemberId) {
        assert.equal(snapshot.achievements.length, 1);
        assert.equal(snapshot.rawAchievements[0].achievement_id, "last");
        assert.equal(snapshot.achievements[0].derived, false);
      }
    }
    clubData.portalMembers = [{username: "owner", gr_id: "id"}, {username: "other", email_address: "member@example.com"}];
    const conflict = await service.getSnapshotForMember({username: "other", email: "member@example.com", clubData});
    assert.equal(conflict.matchSource, "ambiguous");
    const owner = await service.getSnapshotForMember({username: "owner", goldenRecordsId: "id", clubData});
    assert.equal(owner.matchSource, "gr-id");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("club API errors and malformed pages fail instead of returning partial success", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const service = createGoldenRecordsCurrentHandicapService({apiKey: "test-key", baseUrl: "https://api2.archery-records.net", logger: {error() {}}});
    globalThis.fetch = async () => ({ok: false, status: 503, text: async () => "unavailable"});
    await assert.rejects(service.fetchClubData(), /503/);
    globalThis.fetch = async () => ({ok: true, text: async () => '{}'});
    await assert.rejects(service.fetchClubData(), /Invalid Golden Records page/);
  } finally { globalThis.fetch = originalFetch; }
});

test("unique exact name fallback restores Cfleetham mapping without guessing ambiguous or archived names", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ok: true, status: 200, text: async () => "[]"});
    const service = createGoldenRecordsCurrentHandicapService({
      apiKey: "test-key",
      baseUrl: "https://api2.archery-records.net",
    });
    const clubData = {
      members: [
        {memberId: "gr-craig", name: "Fleetham, Craig", memberArchived: false},
        {memberId: "gr-jane-1", name: "Jane Doe", memberArchived: false},
        {memberId: "gr-jane-2", name: "Doe Jane", memberArchived: false},
        {memberId: "gr-old", name: "Old Member", memberArchived: true},
      ],
      achievementsByMember: new Map(),
      portalMembers: [
        {username: "Cfleetham", first_name: "Craig", surname: "Fleetham"},
      ],
    };
    const matched = await service.getSnapshotForMember({
      clubData, username: "Cfleetham", firstName: "Craig", surname: "Fleetham",
    });
    assert.equal(matched.matchSource, "name");
    assert.equal(matched.matchedMemberId, "gr-craig");
    const ambiguous = await service.getSnapshotForMember({
      clubData, firstName: "Jane", surname: "Doe",
    });
    assert.equal(ambiguous.matchSource, "ambiguous");
    const archived = await service.getSnapshotForMember({
      clubData, firstName: "Old", surname: "Member",
    });
    assert.equal(archived.matchSource, "not-found");
    clubData.portalMembers.push({username: "duplicate", first_name: "Craig", surname: "Fleetham"});
    const contested = await service.getSnapshotForMember({
      clubData, username: "Cfleetham", firstName: "Craig", surname: "Fleetham",
    });
    assert.equal(contested.matchSource, "ambiguous");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
