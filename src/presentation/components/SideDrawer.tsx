import { useMemo, useState } from "react";
import selbyLogo from "../../assets/selby_Archery_Logo.svg";
import {
  formatMemberDisplayName,
  hasPermission,
} from "../../utils/userProfile";
import { Button } from "./Button";
import {
  canAccessMemberPage,
  getRestrictedPageMessage,
} from "../navigation/memberPageAccess";

const pages = [
  { id: "home", label: "Home", path: "/" },
  { id: "profile", label: "Profile", path: "/profile" },
  {
    id: "range-usage",
    label: "Range Usage",
    path: "/range-usage",
    restrictedForProgrammeUsers: true,
  },
  {
    id: "event-calendar",
    label: "Calendar",
    path: "/event-calendar",
    restrictedForProgrammeUsers: true,
  },
  {
    id: "tournaments",
    label: "Tournaments",
    path: "/tournaments",
    restrictedForProgrammeUsers: true,
  },
  {
    id: "records",
    label: "Records",
    path: "/records",
    restrictedForProgrammeUsers: true,
  },
  {
    id: "outdoor-table",
    label: "Outdoor Table",
    path: "/outdoor-table",
    restrictedForProgrammeUsers: true,
  },
  { id: "range-rules", label: "Range Rules", path: "/range-rules" },
  { id: "ask-a-question", label: "Ask A Question", path: "/ask-a-question" },
  { id: "feedback-form", label: "Suggestion Box", path: "/feedback-form" },
  {
    id: "question-inbox",
    label: "Question Inbox",
    path: "/question-inbox",
    adminSection: true,
  },
  {
    id: "suggestions-admin",
    label: "Suggestion Inbox",
    path: "/suggestions-admin",
    permission: "manage_announcements",
  },
  {
    id: "lost-and-found",
    label: "Lost and Found",
    path: "/lost-and-found",
    restrictedForProgrammeUsers: true,
  },
  {
    id: "committee-org-chart",
    label: "The Committee",
    path: "/committee-org-chart",
  },
  {
    id: "committee-admin",
    label: "Committee Admin",
    path: "/committee-admin",
    permission: "manage_committee_roles",
  },
  {
    id: "range-rules-admin",
    label: "Range Rules Admin",
    path: "/range-rules-admin",
    permission: "manage_range_rules",
  },
  {
    id: "general-info-admin",
    label: "General Info Admin",
    path: "/general-info-admin",
    permission: "manage_range_rules",
  },
  { id: "general-info", label: "General Information", path: "/general-info" },
  {
    id: "user-creation",
    label: "People & Access",
    path: "/user-creation",
    permission: "manage_members",
  },
  {
    id: "role-permissions",
    label: "Roles & Permissions",
    path: "/role-permissions",
    permission: "manage_roles_permissions",
  },
  {
    id: "announcements",
    label: "Announcements",
    path: "/announcements",
    permission: "manage_announcements",
  },
  {
    id: "reporting",
    label: "Reporting",
    path: "/reporting",
    permission: "view_reports",
  },
  {
    id: "audit-log",
    label: "Audit Log",
    path: "/audit-log",
    permission: "view_reports",
  },
  {
    id: "approvals",
    label: "Approvals",
    path: "/approvals",
    permissionAny: [
      "approve_events",
      "approve_coaching_sessions",
      "approve_beginners_courses",
      "approve_have_a_go_sessions",
    ],
  },
  {
    id: "equipment",
    label: "Equipment",
    path: "/equipment",
    permissionAny: [
      "add_decommission_equipment",
      "assign_equipment",
      "return_equipment",
      "update_equipment_storage",
      "manage_equipment_storage_locations",
    ],
  },
  {
    id: "beginners-courses",
    label: "Beginners & Taster Sessions",
    path: "/beginners-courses",
    permissionAny: [
      "manage_beginners_courses",
      "approve_beginners_courses",
      "manage_have_a_go_sessions",
      "approve_have_a_go_sessions",
    ],
  },
  {
    id: "have-a-go-sessions",
    label: "Have a Go Sessions",
    path: "/have-a-go-sessions",
    permissionAny: ["manage_have_a_go_sessions", "approve_have_a_go_sessions"],
  },
  {
    id: "tournament-setup",
    label: "Tournament Setup",
    path: "/tournament-setup",
    permission: "manage_tournaments",
  },
];

const adminGroups = [
  {
    id: "communications",
    label: "Communications",
    pageIds: ["question-inbox", "suggestions-admin", "announcements"],
  },
  {
    id: "member-admin",
    label: "Member Admin",
    pageIds: ["user-creation", "role-permissions"],
  },
  {
    id: "club-setup",
    label: "Club Setup",
    pageIds: ["committee-admin", "range-rules-admin", "general-info-admin"],
  },
  {
    id: "operations",
    label: "Operations",
    pageIds: [
      "approvals",
      "equipment",
      "beginners-courses",
      "have-a-go-sessions",
      "tournament-setup",
    ],
  },
  {
    id: "reporting",
    label: "Reporting",
    pageIds: ["reporting", "audit-log"],
  },
];

type VisiblePage = (typeof pages)[number];
type AdminGroup = (typeof adminGroups)[number];
type GroupedAdminPageGroup = AdminGroup & { pages: VisiblePage[] };

function getDefaultExpandedGroups(selectedPage, groupedAdminPages) {
  const selectedGroup = groupedAdminPages.find((group) =>
    group.pages.some((page) => page.id === selectedPage),
  );

  if (selectedGroup) {
    return { [selectedGroup.id]: true };
  }

  if (groupedAdminPages.length === 0) {
    return {};
  }

  return { [groupedAdminPages[0].id]: true };
}

export function SideDrawer({
  currentUserProfile,
  open,
  onClose,
  selectedPage,
  onSelectPage,
  onLogout,
}) {
  const displayName =
    formatMemberDisplayName(currentUserProfile) ||
    currentUserProfile?.auth?.username ||
    "Member";

  const visiblePages = useMemo(() => {
    return pages.filter(
      (page) =>
        (!page.permission ||
          hasPermission(currentUserProfile, page.permission)) &&
        (!page.permissionAny ||
          page.permissionAny.some((permissionKey) =>
            hasPermission(currentUserProfile, permissionKey),
          )),
    );
  }, [currentUserProfile]);
  const memberPages = useMemo(
    () =>
      visiblePages.filter(
        (page) => !page.permission && !page.permissionAny && !page.adminSection,
      ),
    [visiblePages],
  );
  const adminPages = useMemo(
    () =>
      visiblePages.filter(
        (page) => page.permission || page.permissionAny || page.adminSection,
      ),
    [visiblePages],
  );
  const groupedAdminPages = useMemo(() => {
    const grouped: GroupedAdminPageGroup[] = adminGroups
      .map((group) => ({
        ...group,
        pages: group.pageIds
          .map((pageId) => adminPages.find((page) => page.id === pageId))
          .filter((page): page is VisiblePage => Boolean(page)),
      }))
      .filter((group) => group.pages.length > 0);

    const groupedPageIds = new Set(
      grouped.flatMap((group) => group.pages.map((page) => page.id)),
    );
    const ungroupedPages = adminPages.filter((page) => !groupedPageIds.has(page.id));

    if (ungroupedPages.length > 0) {
      grouped.push({
        id: "other-admin",
        label: "Other Admin",
        pageIds: [],
        pages: ungroupedPages,
      });
    }

    return grouped;
  }, [adminPages]);
  const [expandedAdminGroups, setExpandedAdminGroups] = useState<Record<string, boolean>>({});
  const resolvedExpandedAdminGroups = useMemo(() => {
    const availableGroupIds = new Set(groupedAdminPages.map((group) => group.id));
    const normalizedGroups = Object.fromEntries(
      Object.entries(expandedAdminGroups).filter(([groupId]) =>
        availableGroupIds.has(groupId),
      ),
    ) as Record<string, boolean>;

    for (const group of groupedAdminPages) {
      if (!(group.id in normalizedGroups)) {
        normalizedGroups[group.id] = false;
      }
    }

    const selectedGroup = groupedAdminPages.find((group) =>
      group.pages.some((page) => page.id === selectedPage),
    );

    if (selectedGroup) {
      normalizedGroups[selectedGroup.id] = true;
      return normalizedGroups;
    }

    if (Object.keys(normalizedGroups).length === 0) {
      return getDefaultExpandedGroups(selectedPage, groupedAdminPages);
    }

    return normalizedGroups;
  }, [expandedAdminGroups, groupedAdminPages, selectedPage]);
  const isPageDisabled = (page) =>
    Boolean(page.restrictedForProgrammeUsers) &&
    !canAccessMemberPage(page.id, currentUserProfile);
  const renderPageButton = (page, nested = false) => (
    <li key={page.id}>
      <Button
        className={[
          page.id === selectedPage ? "active" : "",
          nested ? "drawer-tree-link" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={isPageDisabled(page)}
        title={isPageDisabled(page) ? getRestrictedPageMessage(page.id, currentUserProfile) : undefined}
        onClick={() => {
          if (isPageDisabled(page)) {
            return;
          }
          onSelectPage(page.id);
          onClose();
        }}
        variant="unstyled"
      >
        {page.label}
      </Button>
    </li>
  );

  return (
    <>
      <div
        className={`drawer-backdrop ${open ? "open" : ""}`}
        onClick={onClose}
      />
      <aside className={`side-drawer ${open ? "open" : ""}`}>
        <div className="drawer-header">
          <div className="drawer-header-content">
            <Button
              className="drawer-logo-button"
              onClick={onClose}
              aria-label="Close menu"
              variant="unstyled"
            >
              <img
                src={selbyLogo}
                alt="Selby Archers Logo"
                className="drawer-logo"
              />
            </Button>
            <div className="drawer-user-meta">
              <p className="drawer-user-label">Signed in as</p>
              <p className="drawer-user-name">{displayName}</p>
            </div>
          </div>
        </div>
        <nav>
          <p className="drawer-section-label">General Members</p>
          <ul>
            {memberPages.map((page) => renderPageButton(page))}
          </ul>
          {groupedAdminPages.length > 0 ? (
            <>
              <p className="drawer-section-label">Admin Tools</p>
              <ul className="drawer-tree">
                {groupedAdminPages.map((group) => {
                  const isExpanded = resolvedExpandedAdminGroups[group.id];

                  return (
                    <li key={group.id} className="drawer-tree-group">
                      <Button
                        className={[
                          "drawer-tree-toggle",
                          isExpanded ? "drawer-tree-toggle-open" : "",
                          group.pages.some((page) => page.id === selectedPage)
                            ? "active"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => {
                          setExpandedAdminGroups((current) => ({
                            ...current,
                            [group.id]: !current[group.id],
                          }));
                        }}
                        aria-expanded={isExpanded}
                        variant="unstyled"
                      >
                        <span>{group.label}</span>
                        <span className="drawer-tree-toggle-icon" aria-hidden="true">
                          {isExpanded ? "−" : "+"}
                        </span>
                      </Button>
                      {isExpanded ? (
                        <ul className="drawer-tree-children">
                          {group.pages.map((page) => renderPageButton(page, true))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </nav>
        <div className="drawer-footer">
          <Button
            className="drawer-logout-button"
            onClick={() => {
              onClose();
              onLogout();
            }}
          >
            Log Out
          </Button>
        </div>
      </aside>
    </>
  );
}
