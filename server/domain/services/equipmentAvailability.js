export function getEquipmentAvailabilityStatus({ status, hasOpenLoan, locationType, reservation }) {
  if (status !== "active") return "decommissioned";
  if (hasOpenLoan || locationType === "member") return "on-loan";
  if (reservation) return "reserved-at-range";
  return "available-at-range";
}
