export const homeQueryKeys = {
  rangeMembers: () => ["range-members"] as const,
  activity: (username: string) => ["home-activity", username] as const,
  adminWarnings: (username: string) =>
    ["admin-tournament-warnings", username] as const,
  activeAnnouncements: (username: string) =>
    ["active-announcements", username] as const,
  lostArrowNotices: (username: string) =>
    ["my-lost-arrow-notices", username] as const,
  openLostArrows: (username: string) => ["lost-arrows", username] as const,
  memberQuestions: (username: string) =>
    ["member-questions", "mine", username] as const,
  committeeRoles: (username: string) => ["committee-roles", username] as const,
  committeeApprovalSummary: (username: string) =>
    ["committee-approval-summary", username] as const,
};
