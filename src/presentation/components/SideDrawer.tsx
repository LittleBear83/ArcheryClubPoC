import { useMemo } from "react";
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
  { id: "feedback-form", label: "Feedback Form", path: "/feedback-form" },
  { id: "ideas-form", label: "Ideas Form", path: "/ideas-form" },
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
  { id: "general-info", label: "General Information", path: "/general-info" },
  {
    id: "user-creation",
    label: "User Creation",
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
    id: "reporting",
    label: "Reporting",
    path: "/reporting",
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
      visiblePages.filter((page) => !page.permission && !page.permissionAny),
    [visiblePages],
  );
  const adminPages = useMemo(
    () => visiblePages.filter((page) => page.permission || page.permissionAny),
    [visiblePages],
  );
  const isPageDisabled = (page) =>
    Array.isArray(page.disabledForRoles) && page.disabledForRoles.includes(currentRole);

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
            {memberPages.map((page) => (
              <li key={page.id}>
                <Button
                  className={page.id === selectedPage ? "active" : ""}
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
            ))}
          </ul>
          {adminPages.length > 0 ? (
            <>
              <p className="drawer-section-label">Admin Tools</p>
              <ul>
                {adminPages.map((page) => (
                  <li key={page.id}>
                    <Button
                      className={page.id === selectedPage ? "active" : ""}
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
                ))}
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
