export const migration = {
  version: "025_external_distance_signers",
  statements: [
    `ALTER TABLE member_distance_sign_offs ALTER COLUMN signed_off_by_username DROP NOT NULL`,
    `ALTER TABLE member_distance_sign_offs ADD CONSTRAINT member_distance_sign_offs_manual_signer_check
      CHECK (source <> 'manual' OR signed_off_by_username IS NOT NULL)`,
  ],
};
