import "./SideDrawer.css";
import selbyLogo from "../../assets/selby_Archery_Logo.svg";

const pages = [
  { id: "home", label: "Home", path: "/" },
  { id: "profile", label: "Profile", path: "/profile" },
  {
    id: "user-creation",
    label: "User Creation",
    path: "/user-creation",
    adminOnly: true,
  },
  {
    id: "loan-bow-register",
    label: "Loan Bow Register",
    path: "/loan-bow-register",
    roles: ["admin", "coach"],
  },
  {
    id: "event-calendar",
    label: "Event/Competition Calendar",
    path: "/event-calendar",
  },
  { id: "range-usage", label: "Range Usage", path: "/range-usage" },
  { id: "feedback-form", label: "Feedback Form", path: "/feedback-form" },
  { id: "ideas-form", label: "Ideas Form", path: "/ideas-form" },
  {
    id: "coaching-calendar",
    label: "Coaching Calendar",
    path: "/coaching-calendar",
  },
  {
    id: "tournaments",
    label: "Tournaments",
    path: "/tournaments",
  },
  {
    id: "tournament-setup",
    label: "Tournament Setup",
    path: "/tournament-setup",
    adminOnly: true,
  },
  {
    id: "committee-org-chart",
    label: "Committee Org Chart",
    path: "/committee-org-chart",
  },
  { id: "general-info", label: "General Info", path: "/general-info" },
  { id: "lost-and-found", label: "Lost and Found", path: "/lost-and-found" },
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

  const visiblePages = pages.filter(
    (page) =>
      (!page.adminOnly || currentUserProfile?.membership?.role === "admin") &&
      (!page.roles || page.roles.includes(currentUserProfile?.membership?.role)),
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
          <ul>
            {visiblePages.map((page) => (
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
