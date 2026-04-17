import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { MemberProfileApi } from "./memberProfileApi.js";
const originalFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = originalFetch;
});
test("MemberProfileApi combines profile and equipment loan data", async () => {
    const requests = [];
    globalThis.fetch = async (input, init) => {
        const url = String(input);
        requests.push({
            url,
            headers: new Headers(init?.headers),
        });
        if (url.includes("/member-equipment-loans/")) {
            return new Response(JSON.stringify({ success: true, loans: [{ id: 7 }] }), {
                headers: { "content-type": "application/json" },
            });
        }
        return new Response(JSON.stringify({
            success: true,
            editableProfile: { username: "member-one" },
            userProfile: { auth: { username: "member-one" } },
        }), {
            headers: { "content-type": "application/json" },
        });
    };
    const result = await new MemberProfileApi().getProfilePageData("admin-user", "member-one");
    assert.deepEqual(result, {
        editableProfile: { username: "member-one" },
        userProfile: { auth: { username: "member-one" } },
        equipmentLoans: [{ id: 7 }],
    });
    assert.deepEqual(requests.map((request) => request.url).sort(), [
        "/api/member-equipment-loans/member-one",
        "/api/user-profiles/member-one",
    ]);
    assert.equal(requests[0].headers.get("x-actor-username"), "admin-user");
    assert.equal(requests[1].headers.get("x-actor-username"), "admin-user");
});
