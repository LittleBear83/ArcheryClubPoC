import assert from "node:assert/strict";
import test from "node:test";
import { collectGoldenRecordsPages } from "./goldenRecordsPagination.js";

test("pagination returns empty and partial first pages without another request", async () => {
  for (const body of [[], [{ id: 1 }]]) {
    const pages = [];
    const rows = await collectGoldenRecordsPages({
      path: "/api/members",
      pageSize: 2,
      fetchPage: async ({ pageNumber, pageSize }) => {
        pages.push([pageNumber, pageSize]);
        return { ok: true, body };
      },
    });
    assert.deepEqual(rows, body);
    assert.deepEqual(pages, [[1, 2]]);
  }
});

test("pagination combines full pages and stops at an empty final page", async () => {
  const pages = [];
  const rows = await collectGoldenRecordsPages({
    path: "/api/members",
    pageSize: 2,
    fetchPage: async ({ pageNumber }) => {
      pages.push(pageNumber);
      return { ok: true, body: pageNumber === 1 ? [{ id: 1 }, { id: 2 }] : [] };
    },
  });
  assert.deepEqual(rows, [{ id: 1 }, { id: 2 }]);
  assert.deepEqual(pages, [1, 2]);
});

test("pagination fails on a later HTTP error without returning earlier rows", async () => {
  await assert.rejects(collectGoldenRecordsPages({
    path: "/api/members",
    pageSize: 2,
    fetchPage: async ({ pageNumber }) => pageNumber === 1
      ? { ok: true, body: [{ id: 1 }, { id: 2 }] }
      : { ok: false, status: 503 },
  }), /503 for \/api\/members/);
});

test("pagination rejects a full safety-limit page instead of silently truncating", async () => {
  const pages = [];
  await assert.rejects(collectGoldenRecordsPages({
    path: "/api/members",
    pageSize: 2,
    maxPages: 2,
    fetchPage: async ({ pageNumber }) => {
      pages.push(pageNumber);
      return { ok: true, body: [{ id: 1 }, { id: 2 }] };
    },
  }), /safety limit reached.*refusing partial results/);
  assert.deepEqual(pages, [1, 2]);
});

test("pagination accepts endpoint-specific JSON null but rejects malformed and oversized pages", async () => {
  const empty = await collectGoldenRecordsPages({
    path: "/api/currenthandicaps",
    allowNullEmpty: true,
    fetchPage: async () => ({ ok: true, body: null, bodyWasEmpty: false }),
  });
  assert.deepEqual(empty, []);
  for (const body of [null, { items: [] }, [{ id: 1 }, { id: 2 }, { id: 3 }]]) {
    await assert.rejects(collectGoldenRecordsPages({
      path: "/api/members",
      pageSize: 2,
      fetchPage: async () => ({ ok: true, body }),
    }), /Invalid Golden Records page response/);
  }
});
