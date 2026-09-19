import assert from "node:assert/strict";
import { test } from "node:test";
import { getPermissionGroup, PERMISSION_GROUP_METADATA } from "./rolePermissionsUtils";

test("storage location management belongs to Equipment in the shared permission grouping", () => {
  const group = getPermissionGroup("manage_equipment_storage_locations");
  assert.equal(PERMISSION_GROUP_METADATA[group].title, "Equipment");
  assert.equal(group, getPermissionGroup("update_equipment_storage"));
  assert.equal(getPermissionGroup("manage_roles_permissions"), "system-admin");
});
