// Keep the newest row's identity and handicap while showing every dated award.
export function aggregateIndoorTableRows(rows) {
  const grouped = new Map();
  const ordered = [...rows].sort((a, b) => b.seasonYear - a.seasonYear || b.id - a.id);
  for (const row of ordered) {
    const key = `${row.archerUsername.toLowerCase()}:${row.bowType}`;
    let combined = grouped.get(key);
    if (!combined) {
      combined = { ...row, classifications: {}, scores: {}, classificationDates: {}, scoreDates: {} };
      grouped.set(key, combined);
    }
    for (const [field, dates, values] of [
      ["classifications", combined.classificationDates, row.classifications],
      ["scores", combined.scoreDates, row.scores],
    ]) {
      for (const [award, date] of Object.entries(values ?? {})) {
        if (!date) continue;
        const allDates = dates[award] ?? [];
        if (!allDates.includes(date)) allDates.push(date);
        allDates.sort();
        dates[award] = allDates;
        combined[field][award] = allDates[0];
      }
    }
  }
  return [...grouped.values()];
}
