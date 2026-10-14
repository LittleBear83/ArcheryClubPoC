// Golden Records indoor seasons in /api/seasons run from 1 July to 30 June.
// The portal stores the starting calendar year as seasonYear.
export function indoorSeasonYear(date) {
  const value = String(date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) return null;
  const year = Number(value.slice(0, 4));
  return Number(value.slice(5, 7)) >= 7 ? year : year - 1;
}

const classifications = new Map([
  ["indoor archer 3rd class", "archer3rd"],
  ["indoor archer 2nd class", "archer2nd"],
  ["indoor archer 1st class", "archer1st"],
  ["indoor bowman 3rd class", "bowman3rd"],
  ["indoor bowman 2nd class", "bowman2nd"],
  ["indoor bowman 1st class", "bowman1st"],
  ["indoor mb", "indoorMasterBowman"],
]);
const scores = new Set([300, 325, 350, 375, 400, 425, 450, 475, 500, 525, 550, 575, 580, 585, 590, 595, 600]);

export function mapIndoorEvidence(snapshot, memberId, mapBowClass, allowedBowTypes) {
  const bySeason = new Map();
  const unmapped = new Map();
  function recordUnmapped(kind, label, reason) {
    const key = `${kind}:${label}:${reason}`;
    unmapped.set(key, { kind, label, reason, count: (unmapped.get(key)?.count ?? 0) + 1 });
  }
  function add(row, kind, key) {
    const date = String(row.achieved ?? "").slice(0, 10);
    const seasonYear = indoorSeasonYear(date);
    const bowType = mapBowClass(row.bowClass);
    if (!seasonYear || seasonYear < 2020 || seasonYear > 2100 || !bowType || !allowedBowTypes.has(bowType)) {
      recordUnmapped(kind, kind === "classification" ? row.classification : row.achievement,
        "Missing or unsupported season date, or ineligible bow style");
      return;
    }
    const groupKey = `${seasonYear}:${bowType}`;
    const group = bySeason.get(groupKey) ?? { seasonYear, bowType, classifications: {}, scores: {} };
    const fields = kind === "classification" ? group.classifications : group.scores;
    // An award can recur: retain the first verified achievement date.
    if (!fields[key] || date < fields[key]) fields[key] = date;
    bySeason.set(groupKey, group);
  }
  for (const row of snapshot?.indoorClassifications ?? snapshot?.classifications ?? []) {
    if (String(row.memberId ?? "") !== String(memberId) || String(row.type ?? "").toLowerCase() !== "indoor") continue;
    const label = String(row.classification ?? "").trim();
    const key = classifications.get(label.toLowerCase());
    if (key) add(row, "classification", key);
    else recordUnmapped("classification", label, "No verified portal mapping");
  }
  for (const row of snapshot?.achievements ?? []) {
    if (String(row.memberId ?? "") !== String(memberId)) continue;
    const label = String(row.achievement ?? "").trim();
    const round = String(row.round ?? "").trim().toLowerCase();
    if (!/^(?:portsmouth|indoor)\b/i.test(label) && round !== "portsmouth") continue;
    if (!/^portsmouth\s+\d{3}$/i.test(label)) {
      recordUnmapped("score", `${label} [${row.round ?? ""}]`, "No verified portal score mapping");
      continue;
    }
    const score = Number(label.match(/\d{3}$/)?.[0]);
    if (!scores.has(score) || round !== "portsmouth") {
      recordUnmapped("score", `${label} [${row.round ?? ""}]`, "Not a verified Portsmouth award");
      continue;
    }
    add(row, "score", String(score));
  }
  return { bySeason, unmapped: [...unmapped.values()] };
}
