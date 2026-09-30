import assert from "node:assert/strict";
import test from "node:test";
import { createGoldenRecordsCurrentHandicapService } from "./goldenRecordsCurrentHandicapService.js";

test("manual member fetch accepts member-specific JSON null as no classifications", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const paths = [];
  try {
    globalThis.setTimeout = (callback) => { callback(); return 0; };
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      paths.push(url.pathname);
      const body = {
        "/api/members": [{ member_id: "gr-j", name: "J Geldeart", member_archived: false }],
        "/api/currenthandicaps": [
          { member_id: "gr-j", bow_class: "Recurve", handicap: 42, type: "Outdoor" },
          { member_id: "other", bow_class: "Recurve", handicap: 20, type: "Outdoor" },
        ],
        "/api/achievements": [{ member_id: "gr-j", achievement: "Archer 3rd", bow_class: "Recurve" }],
        "/api/currentclassifications": null,
      }[url.pathname];
      return { ok: true, status: 200, text: async () => JSON.stringify(body) };
    };
    const service = createGoldenRecordsCurrentHandicapService({ apiKey: "test-key", baseUrl: "https://api2.archery-records.net" });
    const snapshot = await service.getSnapshotForMemberById("gr-j");
    assert.equal(snapshot.matchSource, "manual");
    assert.equal(snapshot.matchedMemberId, "gr-j");
    assert.equal(snapshot.handicaps.length, 1);
    assert.equal(snapshot.achievements.length, 1);
    assert.deepEqual(snapshot.classifications, []);
    assert.deepEqual(paths, ["/api/members", "/api/currenthandicaps", "/api/achievements", "/api/currentclassifications"]);
  } finally { globalThis.fetch = originalFetch; globalThis.setTimeout = originalSetTimeout; }
});

test("manual member fetch loads classifications when the API returns an array", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  try {
    globalThis.setTimeout = (callback) => { callback(); return 0; };
    globalThis.fetch = async (input) => {
      const path = new URL(String(input)).pathname;
      const rows = path === "/api/members"
        ? [{ member_id: "gr-j", name: "J Geldeart" }]
        : path === "/api/currentclassifications"
          ? [{ member_id: "gr-j", classification: "Bowman 3rd", type: "Outdoor", bow_class: "Recurve" }]
          : [];
      return { ok: true, status: 200, text: async () => JSON.stringify(rows) };
    };
    const service = createGoldenRecordsCurrentHandicapService({ apiKey: "test-key", baseUrl: "https://api2.archery-records.net" });
    const snapshot = await service.getSnapshotForMemberById("gr-j");
    assert.equal(snapshot.classifications[0].classification, "Bowman 3rd");
  } finally { globalThis.fetch = originalFetch; globalThis.setTimeout = originalSetTimeout; }
});

test("manual member fetch rejects nonexistent, archived and malformed remote responses", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const memberRows = [{ member_id: "archived", member_archived: true }];
    globalThis.fetch = async (input) => ({ ok: true, status: 200,
      text: async () => new URL(String(input)).pathname === "/api/members" ? JSON.stringify(memberRows) : "{}" });
    const service = createGoldenRecordsCurrentHandicapService({ apiKey: "test-key", baseUrl: "https://api2.archery-records.net" });
    await assert.rejects(service.getSnapshotForMemberById("absent"), /not found or is archived/);
    await assert.rejects(service.getSnapshotForMemberById("archived"), /not found or is archived/);
    memberRows.splice(0, memberRows.length, { member_id: "present", name: "Present Member" });
    await assert.rejects(service.getSnapshotForMemberById("present"), /Invalid Golden Records page response from \/api\/currenthandicaps/);
    globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => "" });
    const fresh = createGoldenRecordsCurrentHandicapService({ apiKey: "test-key", baseUrl: "https://api2.archery-records.net" });
    await assert.rejects(fresh.getSnapshotForMemberById("present"), /Invalid Golden Records page response/);
  } finally { globalThis.fetch = originalFetch; }
});

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

test("stale Golden Records id falls back to a unique AGB match without linking ambiguous members", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => "[]" });
    const service = createGoldenRecordsCurrentHandicapService({ apiKey: "test-key", baseUrl: "https://api2.archery-records.net" });
    const clubData = {
      members: [
        { memberId: "new-id", membershipId: "123456", memberArchived: false, name: "Robin Archer", email: "" },
        { memberId: "other-a", membershipId: "duplicate", memberArchived: false, name: "Other A", email: "" },
        { memberId: "other-b", membershipId: "duplicate", memberArchived: false, name: "Other B", email: "" },
      ],
      achievementsByMember: new Map(),
    };
    const matched = await service.getSnapshotForMember({ goldenRecordsId: "stale-id", archeryGbMembershipNumber: "123456", username: "robin", clubData });
    assert.equal(matched.matchedMemberId, "new-id");
    assert.equal(matched.matchSource, "membership-id");
    const ambiguous = await service.getSnapshotForMember({ goldenRecordsId: "stale-id", archeryGbMembershipNumber: "duplicate", username: "other", clubData });
    assert.equal(ambiguous.matchSource, "ambiguous");
    assert.equal(ambiguous.matchedMemberId, "");
  } finally {
    globalThis.fetch = originalFetch;
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
