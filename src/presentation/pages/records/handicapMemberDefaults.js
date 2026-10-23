const MEMBER_BOWS = [
  { value: "recurve", label: "Recurve", profileDiscipline: "Recurve Bow", bowType: "Rec", bowClass: "Recurve" },
  { value: "compound", label: "Compound", profileDiscipline: "Compound Bow", bowType: "Comp", bowClass: "Compound" },
  { value: "barebow", label: "Barebow", profileDiscipline: "Bare Bow", bowType: "B/bow", bowClass: "Barebow" },
  { value: "longbow", label: "Longbow", profileDiscipline: "Long Bow", bowType: "L/bow", bowClass: "Longbow" },
];

export function getMemberBowOptions(disciplines) {
  const selected = new Set((disciplines ?? []).map((value) => String(value).trim().toLowerCase()));
  return MEMBER_BOWS.filter((bow) => selected.has(bow.profileDiscipline.toLowerCase()))
    .map(({ value, label }) => ({ value, label }));
}

export function tableMatchesMemberBow(title, bow) {
  const name = String(title).toLowerCase();
  if (name.includes("non-compound")) return bow !== "compound";
  if (name.includes("all bows")) return true;
  if (name.includes("compound")) return bow === "compound";
  if (name.includes("barebow")) return bow === "barebow";
  return true;
}

export function findKnownHandicap({ bow, familyKey, handicaps = [], indoorRows = [], outdoorRows = [], username = "" }) {
  const memberBow = MEMBER_BOWS.find((entry) => entry.value === bow);
  if (!memberBow) return null;
  const type = familyKey === "indoor-allowances" ? "indoor" : "outdoor";
  const saved = handicaps.find((entry) =>
    String(entry.bowClass).trim().toLowerCase() === memberBow.bowClass.toLowerCase() &&
    String(entry.type).toLowerCase().includes(type) &&
    Number.isInteger(entry.handicap) && entry.handicap >= 0,
  );
  if (saved) return saved.handicap;
  const rows = type === "indoor" ? indoorRows : outdoorRows;
  const row = rows.find((entry) =>
    String(entry.archerUsername).toLowerCase() === username.toLowerCase() &&
    entry.bowType === memberBow.bowType && Number.isInteger(entry.handicap) && entry.handicap >= 0,
  );
  return row?.handicap ?? null;
}
