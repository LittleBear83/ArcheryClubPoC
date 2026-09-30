export const migration = {
  version: "016_equipment_expected_return",
  statements: [
    "ALTER TABLE equipment_loans ADD COLUMN IF NOT EXISTS expected_return_date TEXT",
  ],
};
