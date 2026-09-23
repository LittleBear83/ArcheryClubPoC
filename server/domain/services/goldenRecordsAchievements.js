const progressionPattern = /^(252@\s*[^/]+)\/([1-9]\d*)$/i;

function statusKey(row) {
  return JSON.stringify([
    String(row.memberId ?? row.member_id ?? ""),
    String(row.bowClass ?? row.bow_class ?? "").toLowerCase(),
    row.ageGroup ?? row.age_group ?? "",
    String(row.achievement ?? "").replace(/\s+/g, "").toLowerCase(),
    progressionPattern.test(String(row.achievement ?? "").trim()) ? "" : row.achieved ?? "",
  ]);
}

// Explicit awards always win over inferred lower levels, regardless of API order.
export function deriveGoldenRecordsAchievements(rows = []) {
  const statuses = new Map();
  for (const row of rows) {
    const key = statusKey(row);
    if (!statuses.has(key)) statuses.set(key, { ...row, derived: false, derived_from: null });
  }
  for (const row of rows) {
    const match = String(row.achievement ?? "").trim().match(progressionPattern);
    if (!match) continue;
    const level = Number(match[2]);
    if (!Number.isSafeInteger(level)) throw new Error("Invalid Golden Records achievement level.");
    for (let step = 1; step < level; step += 1) {
      const derived = {
        ...row,
        achievement: `${match[1]}/${step}`,
        achievementId: "",
        derived: true,
        derived_from: row.achievementId || row.achievement_id || row.achievement,
      };
      const key = statusKey(derived);
      if (!statuses.has(key)) statuses.set(key, derived);
    }
  }
  return [...statuses.values()];
}
