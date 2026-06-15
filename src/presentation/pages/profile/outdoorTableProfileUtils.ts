import type { OutdoorTableEntryPayload } from "../../../api/outdoorTableApi";
import type { OutdoorTableEntry } from "../../../types/app";

export type OutdoorBooleanFieldKey = keyof Pick<
  OutdoorTableEntryPayload,
  | "archer3rd"
  | "archer2nd"
  | "archer1st"
  | "bowman3rd"
  | "bowman2nd"
  | "bowman1st"
  | "masterBowman"
  | "grandMasterBowman"
  | "eliteMasterBowman"
>;
export type OutdoorAchievementDateFieldKey = keyof Pick<
  OutdoorTableEntryPayload,
  | "archer3rdDate"
  | "archer2ndDate"
  | "archer1stDate"
  | "bowman3rdDate"
  | "bowman2ndDate"
  | "bowman1stDate"
  | "masterBowmanDate"
  | "grandMasterBowmanDate"
  | "eliteMasterBowmanDate"
>;
export type Outdoor252FieldKey = keyof Pick<
  OutdoorTableEntryPayload,
  | "award25220"
  | "award25230"
  | "award25240"
  | "award25250"
  | "award25260"
  | "award25280"
  | "award252100"
>;
export type Outdoor252SignOffFieldKey = keyof Pick<
  OutdoorTableEntryPayload,
  | "award25220SignOffDates"
  | "award25230SignOffDates"
  | "award25240SignOffDates"
  | "award25250SignOffDates"
  | "award25260SignOffDates"
  | "award25280SignOffDates"
  | "award252100SignOffDates"
>;

export type ProfileOutdoorTableDraft = OutdoorTableEntryPayload & {
  bowType: string;
  discipline: string;
  handicapText: string;
  id: number | null;
  isExistingEntry: boolean;
};

export const CURRENT_OUTDOOR_SEASON_YEAR = new Date().getFullYear();
export const EMPTY_SIGN_OFF_DATES = ["", "", ""];
export const BOW_TYPE_DISCIPLINE_MAPPINGS = [
  { bowType: "Rec", discipline: "Recurve Bow", label: "Recurve" },
  { bowType: "Comp", discipline: "Compound Bow", label: "Compound" },
  { bowType: "B/bow", discipline: "Bare Bow", label: "Barebow" },
  { bowType: "L/bow", discipline: "Long Bow", label: "Longbow" },
] as const;
export const OUTDOOR_ACHIEVEMENT_COLUMNS: Array<{
  key: OutdoorBooleanFieldKey;
  dateKey: OutdoorAchievementDateFieldKey;
  label: string;
}> = [
  { key: "archer3rd", dateKey: "archer3rdDate", label: "Archer 3rd" },
  { key: "archer2nd", dateKey: "archer2ndDate", label: "Archer 2nd" },
  { key: "archer1st", dateKey: "archer1stDate", label: "Archer 1st" },
  { key: "bowman3rd", dateKey: "bowman3rdDate", label: "Bowman 3rd" },
  { key: "bowman2nd", dateKey: "bowman2ndDate", label: "Bowman 2nd" },
  { key: "bowman1st", dateKey: "bowman1stDate", label: "Bowman 1st" },
  { key: "masterBowman", dateKey: "masterBowmanDate", label: "Master Bowman" },
  {
    key: "grandMasterBowman",
    dateKey: "grandMasterBowmanDate",
    label: "Grand Master Bowman",
  },
  {
    key: "eliteMasterBowman",
    dateKey: "eliteMasterBowmanDate",
    label: "Elite Master Bowman",
  },
];
export const OUTDOOR_252_COLUMNS: Array<{
  awardKey: Outdoor252FieldKey;
  label: string;
  signOffKey: Outdoor252SignOffFieldKey;
}> = [
  { awardKey: "award25220", label: "20y", signOffKey: "award25220SignOffDates" },
  { awardKey: "award25230", label: "30y", signOffKey: "award25230SignOffDates" },
  { awardKey: "award25240", label: "40y", signOffKey: "award25240SignOffDates" },
  { awardKey: "award25250", label: "50y", signOffKey: "award25250SignOffDates" },
  { awardKey: "award25260", label: "60y", signOffKey: "award25260SignOffDates" },
  { awardKey: "award25280", label: "80y", signOffKey: "award25280SignOffDates" },
  { awardKey: "award252100", label: "100y", signOffKey: "award252100SignOffDates" },
];

export function normalizeAwardSignOffDates(value: string[] | null | undefined) {
  const normalizedDates = Array.isArray(value)
    ? value.slice(0, 3).map((entry) => (typeof entry === "string" ? entry : ""))
    : [];

  while (normalizedDates.length < 3) {
    normalizedDates.push("");
  }

  return normalizedDates;
}

export function countCompletedSignOffs(signOffDates: string[]) {
  return normalizeAwardSignOffDates(signOffDates).filter(Boolean).length;
}

export function isAward252Complete(
  entry: Pick<OutdoorTableEntryPayload, Outdoor252FieldKey | Outdoor252SignOffFieldKey>,
  awardKey: Outdoor252FieldKey,
  signOffKey: Outdoor252SignOffFieldKey,
) {
  return entry[awardKey] || countCompletedSignOffs(entry[signOffKey]) >= 3;
}

export function buildEmptyOutdoorTableDraft(
  archerUsername: string,
  bowType: string,
  discipline: string,
): ProfileOutdoorTableDraft {
  return {
    id: null,
    isExistingEntry: false,
    seasonYear: CURRENT_OUTDOOR_SEASON_YEAR,
    archerUsername,
    bowType,
    discipline,
    handicap: null,
    handicapText: "",
    archer3rd: false,
    archer2nd: false,
    archer1st: false,
    bowman3rd: false,
    bowman2nd: false,
    bowman1st: false,
    masterBowman: false,
    grandMasterBowman: false,
    eliteMasterBowman: false,
    archer3rdDate: "",
    archer2ndDate: "",
    archer1stDate: "",
    bowman3rdDate: "",
    bowman2ndDate: "",
    bowman1stDate: "",
    masterBowmanDate: "",
    grandMasterBowmanDate: "",
    eliteMasterBowmanDate: "",
    award25220: false,
    award25230: false,
    award25240: false,
    award25250: false,
    award25260: false,
    award25280: false,
    award252100: false,
    award25220SignOffDates: [...EMPTY_SIGN_OFF_DATES],
    award25230SignOffDates: [...EMPTY_SIGN_OFF_DATES],
    award25240SignOffDates: [...EMPTY_SIGN_OFF_DATES],
    award25250SignOffDates: [...EMPTY_SIGN_OFF_DATES],
    award25260SignOffDates: [...EMPTY_SIGN_OFF_DATES],
    award25280SignOffDates: [...EMPTY_SIGN_OFF_DATES],
    award252100SignOffDates: [...EMPTY_SIGN_OFF_DATES],
    cloutWhite20: false,
    cloutWhite30: false,
    cloutWhite40: false,
    cloutWhite50: false,
    cloutWhite60: false,
    cloutWhite7080: false,
    cloutWhite90100: false,
  };
}

export function buildOutdoorTableDraftFromEntry(
  entry: OutdoorTableEntry,
  discipline: string,
): ProfileOutdoorTableDraft {
  return {
    ...entry,
    discipline,
    isExistingEntry: true,
    handicapText: entry.handicap === null ? "" : String(entry.handicap),
    award25220SignOffDates: normalizeAwardSignOffDates(entry.award25220SignOffDates),
    award25230SignOffDates: normalizeAwardSignOffDates(entry.award25230SignOffDates),
    award25240SignOffDates: normalizeAwardSignOffDates(entry.award25240SignOffDates),
    award25250SignOffDates: normalizeAwardSignOffDates(entry.award25250SignOffDates),
    award25260SignOffDates: normalizeAwardSignOffDates(entry.award25260SignOffDates),
    award25280SignOffDates: normalizeAwardSignOffDates(entry.award25280SignOffDates),
    award252100SignOffDates: normalizeAwardSignOffDates(entry.award252100SignOffDates),
  };
}

export function toOutdoorTablePayload(
  draft: ProfileOutdoorTableDraft,
): OutdoorTableEntryPayload {
  const award25220SignOffDates = normalizeAwardSignOffDates(draft.award25220SignOffDates);
  const award25230SignOffDates = normalizeAwardSignOffDates(draft.award25230SignOffDates);
  const award25240SignOffDates = normalizeAwardSignOffDates(draft.award25240SignOffDates);
  const award25250SignOffDates = normalizeAwardSignOffDates(draft.award25250SignOffDates);
  const award25260SignOffDates = normalizeAwardSignOffDates(draft.award25260SignOffDates);
  const award25280SignOffDates = normalizeAwardSignOffDates(draft.award25280SignOffDates);
  const award252100SignOffDates = normalizeAwardSignOffDates(draft.award252100SignOffDates);

  return {
    seasonYear: draft.seasonYear,
    archerUsername: draft.archerUsername,
    bowType: draft.bowType,
    handicap: draft.handicap,
    archer3rd: draft.archer3rd,
    archer2nd: draft.archer2nd,
    archer1st: draft.archer1st,
    bowman3rd: draft.bowman3rd,
    bowman2nd: draft.bowman2nd,
    bowman1st: draft.bowman1st,
    masterBowman: draft.masterBowman,
    grandMasterBowman: draft.grandMasterBowman,
    eliteMasterBowman: draft.eliteMasterBowman,
    archer3rdDate: draft.archer3rdDate,
    archer2ndDate: draft.archer2ndDate,
    archer1stDate: draft.archer1stDate,
    bowman3rdDate: draft.bowman3rdDate,
    bowman2ndDate: draft.bowman2ndDate,
    bowman1stDate: draft.bowman1stDate,
    masterBowmanDate: draft.masterBowmanDate,
    grandMasterBowmanDate: draft.grandMasterBowmanDate,
    eliteMasterBowmanDate: draft.eliteMasterBowmanDate,
    award25220: countCompletedSignOffs(award25220SignOffDates) >= 3,
    award25230: countCompletedSignOffs(award25230SignOffDates) >= 3,
    award25240: countCompletedSignOffs(award25240SignOffDates) >= 3,
    award25250: countCompletedSignOffs(award25250SignOffDates) >= 3,
    award25260: countCompletedSignOffs(award25260SignOffDates) >= 3,
    award25280: countCompletedSignOffs(award25280SignOffDates) >= 3,
    award252100: countCompletedSignOffs(award252100SignOffDates) >= 3,
    award25220SignOffDates,
    award25230SignOffDates,
    award25240SignOffDates,
    award25250SignOffDates,
    award25260SignOffDates,
    award25280SignOffDates,
    award252100SignOffDates,
    cloutWhite20: draft.cloutWhite20,
    cloutWhite30: draft.cloutWhite30,
    cloutWhite40: draft.cloutWhite40,
    cloutWhite50: draft.cloutWhite50,
    cloutWhite60: draft.cloutWhite60,
    cloutWhite7080: draft.cloutWhite7080,
    cloutWhite90100: draft.cloutWhite90100,
  };
}
