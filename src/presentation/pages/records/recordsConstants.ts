export const ROUND_OPTIONS = {
  indoor: [
    "Portsmouth",
    "Worcester",
    "Vegas",
    "WA 18",
    "WA 25",
    "Bray I",
    "Bray II",
  ],
  outdoor: [
    "WA 70m",
    "WA 60m",
    "WA 50m",
    "WA 1440",
    "York",
    "Hereford",
    "St George",
    "Albion",
    "Windsor",
    "National",
    "Western",
  ],
} as const;

export const DISCIPLINE_OPTIONS = [
  "Recurve",
  "Compound",
  "Barebow",
  "Longbow",
  "Traditional",
];

export const CLUB_RECORD_ROUNDS = [
  ...ROUND_OPTIONS.indoor,
  ...ROUND_OPTIONS.outdoor,
];

export const INITIAL_FORM = {
  where: "",
  round: "",
  discipline: "",
  hits: "",
  misses: "",
  score: "",
  golds: "",
  xs: "",
};

export type RecordsForm = typeof INITIAL_FORM;
export type FieldKey = keyof RecordsForm;
