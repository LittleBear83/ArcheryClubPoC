export const DEFAULT_INDOOR_RANGE_RULES = [
  "Range access is available 24 hours a day.",
  "Shoot 3 arrows at a time unless agreed with the other archers on the range to shoot more.",
  "Used target faces are kept on the left and new target faces are kept on the right. Please use new faces sparingly.",
  "If a pile is lost in the boss, mark the boss with the yellow chalk.",
];

export const DEFAULT_OUTDOOR_RANGE_RULES = [
  "Range usage is only permitted during daylight hours.",
  "Archers are restricted to the target and maximum distances permitted for their bow style.",
  "Bosses are to be stored in the boss store at the end of each archer's shooting session.",
  "The Special X target may only be used at the Club Captains' discretion during club shoots.",
];

export const DEFAULT_OUTDOOR_LANE_RULES = [
  { target: "1", recurve: "30m", compound: "N/a", longbow: "30m", barebow: "30m" },
  { target: "2", recurve: "30m", compound: "N/a", longbow: "30m", barebow: "30m" },
  { target: "3", recurve: "50m", compound: "N/a", longbow: "50m", barebow: "50m" },
  { target: "4", recurve: "60m", compound: "N/a", longbow: "60m", barebow: "60m" },
  { target: "5", recurve: "60m", compound: "N/a", longbow: "60m", barebow: "60m" },
  { target: "6", recurve: "60m", compound: "N/a", longbow: "60m", barebow: "60m" },
  { target: "7", recurve: "60m", compound: "N/a", longbow: "60m", barebow: "60m" },
  { target: "8", recurve: "80y", compound: "N/a", longbow: "80y", barebow: "80y" },
  { target: "9", recurve: "100y", compound: "100y", longbow: "80y", barebow: "80y" },
  { target: "10", recurve: "100y", compound: "100y", longbow: "80y", barebow: "100y" },
  { target: "11", recurve: "100y", compound: "100y", longbow: "80y", barebow: "100y" },
  { target: "Special X*", recurve: "20y", compound: "N/a", longbow: "20y", barebow: "20y" },
];

export function getDefaultRangeRulesContent() {
  return {
    indoorRules: [...DEFAULT_INDOOR_RANGE_RULES],
    outdoorRules: [...DEFAULT_OUTDOOR_RANGE_RULES],
    outdoorLaneRules: DEFAULT_OUTDOOR_LANE_RULES.map((entry) => ({ ...entry })),
  };
}
