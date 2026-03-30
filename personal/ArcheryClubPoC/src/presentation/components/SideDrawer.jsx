import "./SideDrawer.css";

const pages = [
  { id: "home", label: "Home", path: "/" },
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
    id: "committee-org-chart",
    label: "Committee Org Chart",
    path: "/committee-org-chart",
  },
  { id: "general-info", label: "General Info", path: "/general-info" },
  { id: "lost-and-found", label: "Lost and Found", path: "/lost-and-found" },
];

export function SideDrawer({ open, onClose, selectedPage, onSelectPage }) {
  return (
    <>
      <div
        className={`drawer-backdrop ${open ? "open" : ""}`}
        onClick={onClose}
      />
      <aside className={`side-drawer ${open ? "open" : ""}`}>
        <div className="drawer-header">
          <div className="drawer-logo">LOGO</div>
          <button
            className="drawer-close"
            onClick={onClose}
            aria-label="Close menu"
          >
            ×
          </button>
        </div>
        <nav>
          <ul>
            {pages.map((page) => (
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
      </aside>
    </>
  );
}
