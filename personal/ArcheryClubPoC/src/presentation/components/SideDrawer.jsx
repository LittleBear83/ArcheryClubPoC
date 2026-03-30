import "./SideDrawer.css";

const pages = [
  { id: "home", label: "Home" },
  { id: "event-calendar", label: "Event/Competition Calendar" },
  { id: "range-usage", label: "Range Usage" },
  { id: "feedback-form", label: "Feedback Form" },
  { id: "ideas-form", label: "Ideas Form" },
  { id: "coaching-calendar", label: "Coaching Calendar" },
  { id: "committee-org-chart", label: "Committee Org Chart" },
  { id: "general-info", label: "General Info" },
  { id: "lost-and-found", label: "Lost and Found" },
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
