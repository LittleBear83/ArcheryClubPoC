export function groupHandicapRounds(tables, familyKey) {
  const groups = new Map();
  for (const table of tables) {
    const label = familyKey === "indoor-allowances"
      ? table.title.replace(/\s+(?:Full size|Triple|5-spot)$/i, "").trim()
      : table.title.trim();
    const groupKey = label.toLowerCase();
    if (!groups.has(groupKey)) groups.set(groupKey, { groupKey, label, tables: [] });
    groups.get(groupKey).tables.push(table);
  }
  return Array.from(groups.values());
}
