export const migration = {
  version: "025_external_distance_signers",
  statements: [
    `ALTER TABLE member_distance_sign_offs ALTER COLUMN signed_off_by_username DROP NOT NULL`,
  ],
};
