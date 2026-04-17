import assert from "node:assert/strict";
import { test } from "node:test";
import { RoleRepositoryImpl } from "./RoleRepositoryImpl.js";
test("RoleRepositoryImpl normalizes missing role snapshot arrays", async () => {
    const repository = new RoleRepositoryImpl({
        dataSource: {
            async getRolesSnapshot() {
                return {};
            },
            async createRole() {
                return { role: null };
            },
            async updateRole() {
                return { role: null };
            },
            async deleteRole() {
                return undefined;
            },
        },
    });
    const snapshot = await repository.getRolesSnapshot("admin-user");
    assert.deepEqual(snapshot, {
        roles: [],
        permissions: [],
    });
});
