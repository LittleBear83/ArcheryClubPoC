export function findHandicapReferenceScores(input, selectedTable, comparisonTables) {
  const value = String(input ?? "").trim();
  if (!value) return { status: "empty" };
  const handicap = Number(value);
  if (!Number.isInteger(handicap) || handicap < 0) return { status: "invalid" };
  if (!selectedTable.rows.some((row) => row.handicapValue === handicap)) return { status: "missing" };
  return { status: "found", handicap,
    scores: comparisonTables.map((table) => ({ tableKey: table.tableKey, title: table.title,
      score: table.rows.find((row) => row.handicapValue === handicap)?.referenceScore ?? null })) };
}
