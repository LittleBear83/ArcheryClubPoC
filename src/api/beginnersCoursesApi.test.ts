import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { convertBeginnerToMember } from "./beginnersCoursesApi.ts";

const originalFetch = globalThis.fetch;

afterEach(() => { globalThis.fetch = originalFetch; });

function captureConvertRequest(response = { success: true, message: "" }, status = 200) {
  const requests: Array<{ path: string; body: unknown }> = [];
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    if (path === "/api/auth/csrf") {
      return new Response(JSON.stringify({ success: true, csrfToken: "test-token" }), {
        headers: { "content-type": "application/json" }, status: 200,
      });
    }
    requests.push({ path, body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify(response), {
      headers: { "content-type": "application/json" }, status,
    });
  };
  return requests;
}

test("case conversion sends the selected expected return date", async () => {
  const requests = captureConvertRequest();
  await convertBeginnerToMember("admin", 12, "2026-12-01");
  assert.deepEqual(requests, [{
    path: "/api/beginners-course-participants/12/convert",
    body: { expectedReturnDate: "2026-12-01" },
  }]);
});

test("conversion without a case keeps the existing empty request body", async () => {
  const requests = captureConvertRequest();
  await convertBeginnerToMember("admin", 13);
  assert.deepEqual(requests, [{
    path: "/api/beginners-course-participants/13/convert",
    body: {},
  }]);
});

test("conversion API exposes the server error message", async () => {
  captureConvertRequest({ success: false, message: "The assigned case is already on loan." }, 400);
  await assert.rejects(
    () => convertBeginnerToMember("admin", 14, "2026-12-01"),
    /The assigned case is already on loan\./,
  );
});
