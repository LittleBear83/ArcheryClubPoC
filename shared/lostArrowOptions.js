export const LOST_ARROW_ARROW_MATERIAL_OPTIONS = ["aluminium", "carbon"];

export const LOST_ARROW_TARGET_DISTANCE_OPTIONS = [
  "10yrds",
  "15yrds",
  "20yrds",
  "30yrds",
  "40yrds",
  "50yrds",
  "60yrds",
  "70mtr",
  "80yrds",
  "90yrds",
  "100yrds",
];

export const LOST_ARROW_ARROW_COLOUR_OPTIONS = [
  { value: "Black", swatch: "#111111" },
  { value: "White", swatch: "#ffffff", borderColor: "rgba(15, 23, 42, 0.24)" },
  { value: "Silver", swatch: "#c0c0c0", borderColor: "rgba(15, 23, 42, 0.18)" },
  { value: "Grey", swatch: "#7a7a7a" },
  { value: "Blue", swatch: "#2b6cb0" },
  { value: "Red", swatch: "#d62828" },
  { value: "Green", swatch: "#2a9d8f" },
  { value: "Yellow", swatch: "#f4d35e" },
  { value: "Orange", swatch: "#f77f00" },
  { value: "Purple", swatch: "#7b2cbf" },
  { value: "Pink", swatch: "#f15bb5" },
  { value: "Brown", swatch: "#8d5524" },
  { value: "Tan", swatch: "#d2b48c" },
  {
    value: "Camo",
    swatch: "linear-gradient(135deg, #6b8e23 0%, #8b4513 50%, #2f4f2f 100%)",
  },
  {
    value: "Carbon Weave",
    swatch:
      "repeating-linear-gradient(45deg, #1a1a1a 0 4px, #323232 4px 8px)",
  },
  { value: "Wood", swatch: "linear-gradient(135deg, #9c6b30 0%, #6f4e37 100%)" },
  { value: "Other", swatch: "linear-gradient(135deg, #3f3f46 0%, #71717a 100%)" },
];

export const LOST_ARROW_FLETCHING_COLOUR_OPTIONS = [
  { value: "White", swatch: "#ffffff", borderColor: "rgba(15, 23, 42, 0.24)" },
  { value: "Black", swatch: "#111111" },
  { value: "Red", swatch: "#d62828" },
  { value: "Orange", swatch: "#f77f00" },
  { value: "Yellow", swatch: "#f4d35e" },
  { value: "Green", swatch: "#2a9d8f" },
  { value: "Blue", swatch: "#2b6cb0" },
  { value: "Purple", swatch: "#7b2cbf" },
  { value: "Pink", swatch: "#f15bb5" },
  { value: "Brown", swatch: "#8d5524" },
  { value: "Silver", swatch: "#c0c0c0", borderColor: "rgba(15, 23, 42, 0.18)" },
  { value: "Gold", swatch: "#d4af37" },
  { value: "Teal", swatch: "#1f8a70" },
  { value: "Flo Yellow", swatch: "#d9ff00" },
  { value: "Flo Orange", swatch: "#ff7b00" },
  { value: "Flo Green", swatch: "#39ff14" },
  { value: "Flo Pink", swatch: "#ff4fd8" },
  { value: "Flo Red", swatch: "#ff1744" },
  { value: "Flo Purple", swatch: "#c724ff" },
  { value: "Clear", swatch: "transparent", borderColor: "rgba(255, 255, 255, 0.65)" },
  { value: "Smoke", swatch: "rgba(99, 99, 99, 0.55)", borderColor: "rgba(255, 255, 255, 0.45)" },
];

export const LOST_ARROW_NOCK_COLOUR_OPTIONS = [
  { value: "Clear", swatch: "transparent", borderColor: "rgba(255, 255, 255, 0.65)" },
  { value: "White", swatch: "#ffffff", borderColor: "rgba(15, 23, 42, 0.24)" },
  { value: "Black", swatch: "#111111" },
  { value: "Yellow", swatch: "#f4d35e" },
  { value: "Orange", swatch: "#f77f00" },
  { value: "Red", swatch: "#d62828" },
  { value: "Green", swatch: "#2a9d8f" },
  { value: "Blue", swatch: "#2b6cb0" },
  { value: "Purple", swatch: "#7b2cbf" },
  { value: "Pink", swatch: "#f15bb5" },
  { value: "Flo Yellow", swatch: "#d9ff00" },
  { value: "Flo Orange", swatch: "#ff7b00" },
  { value: "Flo Green", swatch: "#39ff14" },
  { value: "Flo Pink", swatch: "#ff4fd8" },
  { value: "Flo Red", swatch: "#ff1744" },
  { value: "Smoke", swatch: "rgba(99, 99, 99, 0.55)", borderColor: "rgba(255, 255, 255, 0.45)" },
  { value: "Amber", swatch: "#ffbf00" },
  { value: "Other", swatch: "linear-gradient(135deg, #3f3f46 0%, #71717a 100%)" },
];

export const LOST_ARROW_ARROW_MATERIAL_OPTION_SET = new Set(
  LOST_ARROW_ARROW_MATERIAL_OPTIONS,
);
export const LOST_ARROW_TARGET_DISTANCE_OPTION_SET = new Set(
  LOST_ARROW_TARGET_DISTANCE_OPTIONS,
);
export const LOST_ARROW_ARROW_COLOUR_VALUE_SET = new Set(
  LOST_ARROW_ARROW_COLOUR_OPTIONS.map((option) => option.value),
);
export const LOST_ARROW_FLETCHING_COLOUR_VALUE_SET = new Set(
  LOST_ARROW_FLETCHING_COLOUR_OPTIONS.map((option) => option.value),
);
export const LOST_ARROW_NOCK_COLOUR_VALUE_SET = new Set(
  LOST_ARROW_NOCK_COLOUR_OPTIONS.map((option) => option.value),
);
