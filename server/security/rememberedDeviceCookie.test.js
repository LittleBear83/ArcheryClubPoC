import assert from "node:assert/strict";
import test from "node:test";
import { clearRememberedDeviceCookie, createRememberedDeviceCookie } from "./rememberedDeviceCookie.js";
import { REMEMBERED_DEVICE_MAX_AGE_SECONDS } from "../../shared/rememberedDevicePolicy.js";

test("live remembered-device cookies are HttpOnly, Secure, scoped and absolute", () => {
  const issued = createRememberedDeviceCookie("opaque-token", { isLive: true });
  assert.match(issued, /HttpOnly; Path=\/api\/auth; SameSite=Lax/);
  assert.match(issued, /; Secure$/);
  assert.match(issued, new RegExp(`Max-Age=${REMEMBERED_DEVICE_MAX_AGE_SECONDS}`));
  const cleared = clearRememberedDeviceCookie({ isLive: true });
  assert.match(cleared, /Max-Age=0; Secure$/);
});
