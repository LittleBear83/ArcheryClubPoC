export const migration = {
  version: "026_bow_discipline_names",
  statements: [
    `SELECT set_config('archery.sync.apply_mode', 'maintenance', true)`,
    `UPDATE user_disciplines SET discipline = CASE discipline
      WHEN 'Bare Bow' THEN 'Barebow' WHEN 'Long Bow' THEN 'Longbow' END
      WHERE discipline IN ('Bare Bow', 'Long Bow')`,
    `UPDATE member_distance_sign_offs SET discipline = CASE discipline
      WHEN 'Bare Bow' THEN 'Barebow' WHEN 'Long Bow' THEN 'Longbow' END
      WHERE discipline IN ('Bare Bow', 'Long Bow')`,
    `UPDATE tournament_matches SET
      left_handicap_discipline = CASE left_handicap_discipline
        WHEN 'Bare Bow' THEN 'Barebow' WHEN 'Long Bow' THEN 'Longbow'
        ELSE left_handicap_discipline END,
      right_handicap_discipline = CASE right_handicap_discipline
        WHEN 'Bare Bow' THEN 'Barebow' WHEN 'Long Bow' THEN 'Longbow'
        ELSE right_handicap_discipline END
      WHERE left_handicap_discipline IN ('Bare Bow', 'Long Bow')
        OR right_handicap_discipline IN ('Bare Bow', 'Long Bow')`,
  ],
};
