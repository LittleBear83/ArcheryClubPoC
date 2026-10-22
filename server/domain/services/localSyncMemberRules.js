import { normalizeMemberStatusWithFees } from "./memberPersistenceService.js";

export function normalizeIncomingUser(user, deactivatedRfidSuffix) {
  const normalized = normalizeMemberStatusWithFees(
    {
      ...user,
      active_member: Number(user.active_member ?? 0),
      affiliate_member: Number(user.affiliate_member ?? 0),
      coaching_volunteer: Number(user.coaching_volunteer ?? 0),
      junior_member: Number(user.junior_member ?? 0),
    },
    { deactivatedRfidSuffix },
  );
  const { requiresMembershipStatusSync: _ignored, ...nextUser } = normalized;
  return nextUser;
}
