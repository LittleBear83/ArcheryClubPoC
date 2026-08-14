import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { MemberProfileApi } from "./memberProfileApi.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("MemberProfileApi combines profile and equipment loan data", async () => {
  const requests: Array<{
    url: string;
    credentials?: RequestCredentials;
    headers: Headers;
  }> = [];

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({
      url,
      credentials: init?.credentials,
      headers: new Headers(init?.headers),
    });

    if (url.includes("/member-equipment-loans/")) {
      return new Response(JSON.stringify({ success: true, loans: [{ id: 7 }] }), {
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        editableProfile: { username: "member-one" },
        userProfile: { auth: { username: "member-one" } },
      }),
      {
        headers: { "content-type": "application/json" },
      },
    );
  };

  const result = await new MemberProfileApi().getProfilePageData(
    "admin-user",
    "member-one",
  );

  assert.deepEqual(result, {
    editableProfile: { username: "member-one" },
    userProfile: { auth: { username: "member-one" } },
    equipmentLoans: [{ id: 7 }],
    disciplines: [],
    userTypes: [],
    membershipStatuses: [],
    programmeTypes: [],
  });
  assert.deepEqual(
    requests.map((request) => request.url).sort(),
    [
      "/api/member-equipment-loans/member-one",
      "/api/user-profiles/member-one",
    ],
  );
  assert.deepEqual(
    requests.map((request) => request.credentials),
    ["same-origin", "same-origin"],
  );
  assert.equal(requests[0].headers.get("x-actor-username"), null);
  assert.equal(requests[1].headers.get("x-actor-username"), null);
});

test("MemberProfileApi still returns profile data when equipment loans are forbidden", async () => {
  globalThis.fetch = async (input) => {
    const url = String(input);

    if (url.includes("/member-equipment-loans/")) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "You do not have permission to view this member's equipment loans.",
        }),
        {
          status: 403,
          headers: { "content-type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        editableProfile: { username: "member-one" },
        userProfile: { auth: { username: "member-one" } },
        membershipStatuses: ["member", "non-member", "guest"],
        programmeTypes: ["none", "beginners"],
      }),
      {
        headers: { "content-type": "application/json" },
      },
    );
  };

  const result = await new MemberProfileApi().getProfilePageData(
    "admin-user",
    "member-one",
  );

  assert.deepEqual(result, {
    editableProfile: { username: "member-one" },
    userProfile: { auth: { username: "member-one" } },
    equipmentLoans: [],
    disciplines: [],
    userTypes: [],
    membershipStatuses: ["member", "non-member", "guest"],
    programmeTypes: ["none", "beginners"],
  });
});
