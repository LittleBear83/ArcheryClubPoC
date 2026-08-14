import { isProgrammeUser } from "../../utils/userProfile.js";

export const PROGRAMME_RESTRICTED_PAGE_IDS = new Set([
  "range-usage",
  "event-calendar",
  "tournaments",
  "records",
  "outdoor-table",
  "lost-and-found",
]);

export function isPageRestrictedForProgrammeUsers(pageId) {
  return PROGRAMME_RESTRICTED_PAGE_IDS.has(pageId);
}

export function canAccessMemberPage(pageId, profile) {
  if (!pageId) {
    return true;
  }

  if (isPageRestrictedForProgrammeUsers(pageId) && isProgrammeUser(profile)) {
    return false;
  }

  return true;
}

export function getRestrictedPageMessage(pageId, profile) {
  if (!canAccessMemberPage(pageId, profile)) {
    return "This area is not available for programme participants yet.";
  }

  return "";
}
