export const DEFAULT_INDOOR_RANGE_RULES = [
  "Range access is available 24 hours a day.",
  "Shoot 3 arrows at a time unless agreed with the other archers on the range to shoot more.",
  "Used target faces are kept on the left and new target faces are kept on the right. Please use new faces sparingly.",
  "If a pile is lost in the boss, mark the boss with the yellow chalk.",
];

export const DEFAULT_OUTDOOR_RANGE_RULES = [
  "Range usage is only permitted during daylight hours.",
  "Compound archers are to use lanes 9 to 11.",
  "Bosses are to be stored in the boss store at the end of each archer's shooting session.",
];

export const DEFAULT_OUTDOOR_LANE_RULES = [
  { lanes: "1 - 2", distance: "Up to 30 yards" },
  { lanes: "3 - 4", distance: "Up to 40 yards" },
  { lanes: "5 - 11", distance: "Up to 100 yards" },
];

export function getDefaultRangeRulesContent() {
  return {
    indoorRules: [...DEFAULT_INDOOR_RANGE_RULES],
    outdoorRules: [...DEFAULT_OUTDOOR_RANGE_RULES],
    outdoorLaneRules: DEFAULT_OUTDOOR_LANE_RULES.map((entry) => ({ ...entry })),
  };
}
