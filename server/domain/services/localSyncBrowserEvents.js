// These are the existing authenticated browser invalidation events. Never
// forward sync records, record keys, machine credentials, or upstream payloads.
export const LOCAL_SYNC_EVENT_GROUPS = {
  users: ["members.updated", "range-members.updated"],
  user_types: ["members.updated", "roles.updated", "range-members.updated"],
  user_disciplines: ["members.updated", "range-members.updated"],
  roles: ["roles.updated"],
  permissions: ["roles.updated"],
  role_permissions: ["roles.updated"],
  club_events: ["calendar.updated", "approvals.updated"],
  coaching_sessions: ["calendar.updated", "approvals.updated"],
  event_bookings: ["calendar.updated"],
  coaching_session_bookings: ["calendar.updated"],
  announcements: ["announcements.updated"],
  equipment_storage_locations: ["equipment.updated"],
  equipment_items: ["equipment.updated", "members.updated"],
  login_events: ["range-members.updated"],
  guest_login_events: ["range-members.updated"],
  range_presence_extensions: ["range-members.updated"],
  beginners_courses: ["beginners.updated", "calendar.updated", "approvals.updated"],
  beginners_course_participants: ["beginners.updated", "members.updated"],
  beginners_course_lessons: ["beginners.updated", "calendar.updated"],
  beginners_course_lesson_coaches: ["beginners.updated", "calendar.updated"],
  golden_records_member_sync: ["golden-records.updated", "outdoor-table.updated"],
  golden_records_integration_status: ["golden-records.updated"],
  golden_records_lookup_cache: ["golden-records.updated"],
  outdoor_table_entries: ["outdoor-table.updated"],
  committee_meeting_minutes: ["committee-minutes.updated"],
};

export function localSyncBrowserEventNames(domains) {
  return [...new Set(domains.flatMap((domain) =>
    Object.hasOwn(LOCAL_SYNC_EVENT_GROUPS, domain) ? LOCAL_SYNC_EVENT_GROUPS[domain] : [],
  ))];
}

export function publishLocalSyncBrowserEvents(serverEventBus, domains) {
  for (const eventName of localSyncBrowserEventNames(domains)) {
    try { serverEventBus.broadcastToAll(eventName, {}); } catch { /* Keep other groups independent. */ }
  }
}
