export function validateBeginnerConversionDate(assignedCaseId, expectedReturnDate, todayUtc = new Date().toISOString().slice(0, 10)) {
  if (!assignedCaseId) return null;
  const parsed = typeof expectedReturnDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(expectedReturnDate)
    ? new Date(`${expectedReturnDate}T00:00:00Z`)
    : null;
  if (!parsed || Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== expectedReturnDate ||
      expectedReturnDate < todayUtc) {
    return "Expected return date is required for the assigned case and must be today or later (YYYY-MM-DD, UTC).";
  }
  return null;
}
