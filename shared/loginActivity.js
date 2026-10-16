// Persisted login_events methods. Keep access reporting and audit presentation
// aligned without changing historical rows or the separate range-visit rules.
export const LOGIN_METHOD_GROUPS = [
  { method: "rfid", label: "RFID", values: ["rfid"] },
  { method: "mobile", label: "Mobile", values: ["mobile-app", "password-mobile"] },
  { method: "website", label: "Website", values: ["password"] },
];

export function loginMethodGroup(method) {
  return LOGIN_METHOD_GROUPS.find((group) => group.values.includes(method))?.method ?? "other";
}

