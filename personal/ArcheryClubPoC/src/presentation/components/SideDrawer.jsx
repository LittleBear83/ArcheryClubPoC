import "./SideDrawer.css";
import { useMemo } from "react";
import selbyLogo from "../../assets/selby_Archery_Logo.svg";
import { hasPermission } from "../../utils/userProfile";

const pages = [
  { id: "home", label: "Home", path: "/" },
  { id: "profile", label: "Profile", path: "/profile" },
  { id: "range-usage", label: "Range Usage", path: "/range-usage" },
  {
    id: "event-calendar",
    label: "Event and Competition",
    path: "/event-calendar",
  },
  {
    id: "tournaments",
    label: "Tournaments",
    path: "/tournaments",
  },
  {
    id: "coaching-calendar",
    label: "Coaching",
    path: "/coaching-calendar",
  },
  { id: "feedback-form", label: "Feedback Form", path: "/feedback-form" },
  { id: "ideas-form", label: "Ideas Form", path: "/ideas-form" },
  { id: "lost-and-found", label: "Lost and Found", path: "/lost-and-found" },
  {
    id: "committee-org-chart",
    label: "The Committee",
    path: "/committee-org-chart",
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
    id: "approvals",
    label: "Approvals",
    path: "/approvals",
    permissionAny: ["approve_events", "approve_coaching_sessions"],
  },
  {
    id: "loan-bow-register",
    label: "Loan Bow Register",
    path: "/loan-bow-register",
    permission: "manage_loan_bows",
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
    currentUserProfile?.personal?.fullName ??
    currentUserProfile?.auth?.username ??
    "Member";

  const visiblePages = useMemo(() => {
    return pages.filter(
      (page) =>
        (!page.permission || hasPermission(currentUserProfile, page.permission)) &&
        (!page.permissionAny ||
          page.permissionAny.some((permissionKey) =>
            hasPermission(currentUserProfile, permissionKey),
          )),
    );
  }, [currentUserProfile]);
  const memberPages = useMemo(
    () => visiblePages.filter((page) => !page.permission),
    [visiblePages],
  );
  const adminPages = useMemo(
    () => visiblePages.filter((page) => page.permission || page.permissionAny),
    [visiblePages],
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
            <button
              className="drawer-logo-button"
              onClick={onClose}
              aria-label="Close menu"
            >
              <img
                src={selbyLogo}
                alt="Selby Archers Logo"
                className="drawer-logo"
              />
            </button>
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
                <button
                  className={page.id === selectedPage ? "active" : ""}
                  onClick={() => {
                    onSelectPage(page.id);
                    onClose();
                  }}
                >
                  {page.label}
                </button>
              </li>
            ))}
          </ul>
          {adminPages.length > 0 ? (
            <>
              <p className="drawer-section-label">Admin Tools</p>
              <ul>
                {adminPages.map((page) => (
                  <li key={page.id}>
                    <button
                      className={page.id === selectedPage ? "active" : ""}
                      onClick={() => {
                        onSelectPage(page.id);
                        onClose();
                      }}
                    >
                      {page.label}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </nav>
        <div className="drawer-footer">
          <button
            className="drawer-logout-button"
            type="button"
            onClick={() => {
              onClose();
              onLogout();
            }}
          >
            Log Out
          </button>
        </div>
      </aside>
    </>
  );
}
