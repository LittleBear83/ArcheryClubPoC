export const DEFAULT_HANDICAP_ALLOWANCE_PERCENT = 100;
export const MIN_HANDICAP_ALLOWANCE_PERCENT = 0;
export const MAX_HANDICAP_ALLOWANCE_PERCENT = 100;

export function applyHandicapAllowancePercent(allowance, percent) {
  if (!Number.isInteger(allowance) || allowance < 0 ||
      !Number.isFinite(percent) ||
      percent < MIN_HANDICAP_ALLOWANCE_PERCENT ||
      percent > MAX_HANDICAP_ALLOWANCE_PERCENT) {
    return null;
  }

  return Math.round(allowance * (percent / MAX_HANDICAP_ALLOWANCE_PERCENT));
}
