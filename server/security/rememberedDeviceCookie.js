import { REMEMBERED_DEVICE_MAX_AGE_SECONDS } from "../../shared/rememberedDevicePolicy.js";

export const REMEMBERED_DEVICE_COOKIE_NAME = "archeryclubpoc_remembered_device";
const COOKIE_PATH = "/api/auth";

export function createRememberedDeviceCookie(token, { isLive }) {
  const secure = isLive ? "; Secure" : "";
  return `${REMEMBERED_DEVICE_COOKIE_NAME}=${token}; HttpOnly; Path=${COOKIE_PATH}; SameSite=Lax; Max-Age=${REMEMBERED_DEVICE_MAX_AGE_SECONDS}${secure}`;
}

export function clearRememberedDeviceCookie({ isLive }) {
  const secure = isLive ? "; Secure" : "";
  return `${REMEMBERED_DEVICE_COOKIE_NAME}=; HttpOnly; Path=${COOKIE_PATH}; SameSite=Lax; Max-Age=0${secure}`;
}
