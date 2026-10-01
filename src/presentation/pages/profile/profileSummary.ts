const BOW_LABELS: Record<string, string> = {
  Rec: "Recurve",
  Comp: "Compound",
  "B/bow": "Barebow",
  "L/bow": "Longbow",
};

export function formatAchievementSummary(
  handicaps: Record<string, { handicap: number | null }>,
  bowCount: number,
) {
  const values = Object.entries(handicaps)
    .filter(([, entry]) => entry.handicap !== null)
    .map(([bowType, entry]) => `${BOW_LABELS[bowType] ?? bowType} handicap ${entry.handicap}`);

  return values.length > 0
    ? values.join(" · ")
    : `${bowCount} ${bowCount === 1 ? "bowstyle" : "bowstyles"}`;
}
