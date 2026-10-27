const RETENTION_MONTHS = 18;

export function isEquipmentWithinFrontendRetention(item, asOf = new Date()) {
  if (item.status !== "decommissioned") return true;

  const dateText = item.decommissioned_at_date ?? item.decommissionedAt?.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText ?? "")) return true;

  const [year, month, day] = dateText.split("-").map(Number);
  const retired = new Date(Date.UTC(year, month - 1, day));
  if (retired.toISOString().slice(0, 10) !== dateText) return true;

  const expiryMonth = month - 1 + RETENTION_MONTHS;
  const expiryYear = year + Math.floor(expiryMonth / 12);
  const expiryMonthIndex = expiryMonth % 12;
  const lastDay = new Date(Date.UTC(expiryYear, expiryMonthIndex + 1, 0)).getUTCDate();
  const expiry = new Date(Date.UTC(expiryYear, expiryMonthIndex, Math.min(day, lastDay)));
  const asOfDate = typeof asOf === "string" ? asOf.slice(0, 10) : asOf.toISOString().slice(0, 10);
  return asOfDate < expiry.toISOString().slice(0, 10);
}

export function partitionEquipmentRegisterItems(items, asOf = new Date()) {
  const current = [];
  const decommissioned = [];
  for (const item of items) {
    if (!isEquipmentWithinFrontendRetention(item, asOf)) continue;
    (item.status === "decommissioned" ? decommissioned : current).push(item);
  }
  decommissioned.sort((left, right) =>
    (right.decommissionedAt ?? "").localeCompare(left.decommissionedAt ?? "") ||
    String(left.id).localeCompare(String(right.id), undefined, { numeric: true }));
  return { current, decommissioned };
}
