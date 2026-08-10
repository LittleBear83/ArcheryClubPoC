import { useEffect, useMemo, useState } from "react";
import selbyLogo from "../../assets/selby_Archery_Logo.svg";
import { formatMemberDisplayName, hasPermission } from "../../utils/userProfile";
import { Button } from "./Button";

const pages = [
  { id: "home", label: "Home", path: "/" },
  { id: "profile", label: "Profile", path: "/profile" },
  {
    id: "range-usage",
    label: "Range Usage",
    path: "/range-usage",
    disabledForRoles: ["beginner"],
  },
  {
    id: "event-calendar",
    label: "Calendar",
    path: "/event-calendar",
    disabledForRoles: ["beginner"],
  },
  {
    id: "tournaments",
    label: "Tournaments",
    path: "/tournaments",
    disabledForRoles: ["beginner"],
  },
  {
    id: "records",
    label: "Records",
    path: "/records",
    disabledForRoles: ["beginner"],
  },
  {
    id: "outdoor-table",
    label: "Outdoor Table",
    path: "/outdoor-table",
    disabledForRoles: ["beginner"],
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
    disabledForRoles: ["beginner"],
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
    label: "Member Creation",
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
    label: "Beginners Courses",
    path: "/beginners-courses",
    permissionAny: ["manage_beginners_courses", "approve_beginners_courses"],
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
    pageIds: ["user-creation", "role-permissions", "approvals"],
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
  const currentRole = currentUserProfile?.membership?.role ?? "";

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
    const grouped = adminGroups
      .map((group) => ({
        ...group,
        pages: group.pageIds
          .map((pageId) => adminPages.find((page) => page.id === pageId))
          .filter(Boolean),
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
        pages: ungroupedPages,
      });
    }

    return grouped;
  }, [adminPages]);
  const [expandedAdminGroups, setExpandedAdminGroups] = useState(() =>
    getDefaultExpandedGroups(selectedPage, groupedAdminPages),
  );

  useEffect(() => {
    setExpandedAdminGroups((current) => {
      const next = { ...current };
      let hasChanges = false;

      groupedAdminPages.forEach((group) => {
        if (!(group.id in next)) {
          next[group.id] = false;
          hasChanges = true;
        }
      });

      Object.keys(next).forEach((groupId) => {
        if (!groupedAdminPages.some((group) => group.id === groupId)) {
          delete next[groupId];
          hasChanges = true;
        }
      });

      const selectedGroup = groupedAdminPages.find((group) =>
        group.pages.some((page) => page.id === selectedPage),
      );

      if (selectedGroup && !next[selectedGroup.id]) {
        next[selectedGroup.id] = true;
        hasChanges = true;
      }

      if (!hasChanges && Object.keys(next).length > 0) {
        return current;
      }

      if (Object.keys(next).length === 0) {
        return getDefaultExpandedGroups(selectedPage, groupedAdminPages);
      }

      return next;
    });
  }, [groupedAdminPages, selectedPage]);
  const isPageDisabled = (page) =>
    Array.isArray(page.disabledForRoles) && page.disabledForRoles.includes(currentRole);
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
        title={
          isPageDisabled(page)
            ? "This area is not available for beginners."
            : undefined
        }
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
                  const isExpanded = expandedAdminGroups[group.id];

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
