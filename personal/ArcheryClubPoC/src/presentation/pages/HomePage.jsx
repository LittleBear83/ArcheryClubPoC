import { useMemo, useState } from "react";
import { useMembers } from "../state/useMembers";
import { SideDrawer } from "../components/SideDrawer";
import archeryBanner from "../../assets/archery_banner.svg";

const pageTitleMap = {
  home: "Home",
  "event-calendar": "Event/Competition Calendar",
  "range-usage": "Range Usage",
  "feedback-form": "Feedback Form",
  "ideas-form": "Ideas Form",
  "coaching-calendar": "Coaching Calendar",
  "committee-org-chart": "Committee Org Chart",
  "general-info": "General Info",
  "lost-and-found": "Lost and Found",
};

export function HomePage({ getMembersUseCase, addMemberUseCase }) {
  const { members } = useMembers({
    getMembersUseCase,
    addMemberUseCase,
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activePage, setActivePage] = useState("home");

  const [lostFoundType, setLostFoundType] = useState("found");
  const [lostFoundForm, setLostFoundForm] = useState({
    whoFound: "",
    foundItem: "",
    foundLocation: "",
    lostItem: "",
    lostPerson: "",
    lostLocation: "",
    notes: "",
  });
  const [lostFoundSubmitted, setLostFoundSubmitted] = useState("");

  const [feedbackForm, setFeedbackForm] = useState({
    submittedBy: "",
    feedbackText: "",
  });
  const [feedbackSubmitted, setFeedbackSubmitted] = useState("");

  const [ideasForm, setIdeasForm] = useState({
    submittedBy: "",
    improvementText: "",
    ideaTitle: "",
    ideaDetails: "",
  });
  const [ideasSubmitted, setIdeasSubmitted] = useState("");

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => a.name.localeCompare(b.name)),
    [members],
  );

  const handleLostFoundSubmit = (e) => {
    e.preventDefault();
    const summary =
      lostFoundType === "found"
        ? `Found: ${lostFoundForm.foundItem} at ${lostFoundForm.foundLocation}, found by ${lostFoundForm.whoFound}`
        : `Lost: ${lostFoundForm.lostItem} by ${lostFoundForm.lostPerson} at ${lostFoundForm.lostLocation}`;

    setLostFoundSubmitted(`Entry saved (${lostFoundType}). ${summary}`);
    setLostFoundForm({
      whoFound: "",
      foundItem: "",
      foundLocation: "",
      lostItem: "",
      lostPerson: "",
      lostLocation: "",
      notes: "",
    });
  };

  const handleFeedbackSubmit = (e) => {
    e.preventDefault();
    const author = feedbackForm.submittedBy.trim() || "Anonymous";
    setFeedbackSubmitted(
      `Feedback saved by ${author}: ${feedbackForm.feedbackText}`,
    );
    setFeedbackForm({ submittedBy: "", feedbackText: "" });
  };

  const handleIdeasSubmit = (e) => {
    e.preventDefault();
    const author = ideasForm.submittedBy.trim() || "Anonymous";
    setIdeasSubmitted(`Idea by ${author} saved: ${ideasForm.ideaTitle}`);
    setIdeasForm({
      submittedBy: "",
      improvementText: "",
      ideaTitle: "",
      ideaDetails: "",
    });
  };

  return (
    <>
      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        selectedPage={activePage}
        onSelectPage={setActivePage}
      />

      <section className="target-arch-banner">
        <img
          src={archeryBanner}
          alt="Archery banner"
          className="archery-banner-img"
        />
        <button className="menu-button" onClick={() => setDrawerOpen(true)}>
          ☰ Menu
        </button>
        <div className="heading-wrap">
          <h1>{pageTitleMap[activePage] || "Archery Club"}</h1>
        </div>
      </section>

      <main
        style={{
          maxWidth: 900,
          margin: "0 auto",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <section style={{ marginBottom: 24 }}>
          <h2>{pageTitleMap[activePage]}</h2>

          {activePage === "home" ? (
            <>
              <p>On site today</p>
              <ul>
                {sortedMembers.length > 0 ? (
                  sortedMembers.map((member) => (
                    <li key={member.id}>
                      {member.name} — {member.role}
                    </li>
                  ))
                ) : (
                  <li>No members on site today</li>
                )}
              </ul>
            </>
          ) : activePage === "feedback-form" ? (
            <>
              <p>Submit your feedback.</p>
              <form onSubmit={handleFeedbackSubmit} className="left-align-form">
                <label style={{ width: "100%" }}>
                  Who is submitting (leave blank to be anonymous)
                  <input
                    value={feedbackForm.submittedBy}
                    onChange={(e) =>
                      setFeedbackForm((s) => ({
                        ...s,
                        submittedBy: e.target.value,
                      }))
                    }
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>

                <label style={{ width: "100%" }}>
                  What is your feedback?
                  <textarea
                    value={feedbackForm.feedbackText}
                    onChange={(e) =>
                      setFeedbackForm((s) => ({
                        ...s,
                        feedbackText: e.target.value,
                      }))
                    }
                    rows={4}
                    style={{ width: "100%", marginTop: 4 }}
                    required
                  />
                </label>

                <button type="submit">Submit feedback</button>
              </form>

              {feedbackSubmitted && (
                <p style={{ color: "#8bc34a" }}>{feedbackSubmitted}</p>
              )}
            </>
          ) : activePage === "lost-and-found" ? (
            <>
              <p>Register lost or found items.</p>
              <form
                onSubmit={handleLostFoundSubmit}
                className="left-align-form"
              >
                <div className="radio-group">
                  <strong>Type</strong>
                  <div className="radio-options">
                    <label>
                      <input
                        type="radio"
                        name="lostFoundType"
                        value="found"
                        checked={lostFoundType === "found"}
                        onChange={() => setLostFoundType("found")}
                      />
                      Found
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="lostFoundType"
                        value="lost"
                        checked={lostFoundType === "lost"}
                        onChange={() => setLostFoundType("lost")}
                      />
                      Lost
                    </label>
                  </div>
                </div>

                {lostFoundType === "found" ? (
                  <>
                    <label style={{ width: "100%" }}>
                      Who found it
                      <input
                        value={lostFoundForm.whoFound}
                        onChange={(e) =>
                          setLostFoundForm((s) => ({
                            ...s,
                            whoFound: e.target.value,
                          }))
                        }
                        style={{ width: "100%", marginTop: 4 }}
                        required
                      />
                    </label>

                    <label style={{ width: "100%" }}>
                      What was found
                      <input
                        value={lostFoundForm.foundItem}
                        onChange={(e) =>
                          setLostFoundForm((s) => ({
                            ...s,
                            foundItem: e.target.value,
                          }))
                        }
                        style={{ width: "100%", marginTop: 4 }}
                        required
                      />
                    </label>

                    <label style={{ width: "100%" }}>
                      Where at the range was it found
                      <input
                        value={lostFoundForm.foundLocation}
                        onChange={(e) =>
                          setLostFoundForm((s) => ({
                            ...s,
                            foundLocation: e.target.value,
                          }))
                        }
                        style={{ width: "100%", marginTop: 4 }}
                        required
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label style={{ width: "100%" }}>
                      What has been lost
                      <input
                        value={lostFoundForm.lostItem}
                        onChange={(e) =>
                          setLostFoundForm((s) => ({
                            ...s,
                            lostItem: e.target.value,
                          }))
                        }
                        style={{ width: "100%", marginTop: 4 }}
                        required
                      />
                    </label>

                    <label style={{ width: "100%" }}>
                      Who has lost it
                      <input
                        value={lostFoundForm.lostPerson}
                        onChange={(e) =>
                          setLostFoundForm((s) => ({
                            ...s,
                            lostPerson: e.target.value,
                          }))
                        }
                        style={{ width: "100%", marginTop: 4 }}
                        required
                      />
                    </label>

                    <label style={{ width: "100%" }}>
                      Where it was lost
                      <input
                        value={lostFoundForm.lostLocation}
                        onChange={(e) =>
                          setLostFoundForm((s) => ({
                            ...s,
                            lostLocation: e.target.value,
                          }))
                        }
                        style={{ width: "100%", marginTop: 4 }}
                        required
                      />
                    </label>
                  </>
                )}

                <label style={{ width: "100%" }}>
                  Additional notes
                  <textarea
                    value={lostFoundForm.notes}
                    onChange={(e) =>
                      setLostFoundForm((s) => ({
                        ...s,
                        notes: e.target.value,
                      }))
                    }
                    rows={3}
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>

                <button type="submit">Submit</button>
              </form>

              {lostFoundSubmitted && (
                <p style={{ color: "#8bc34a" }}>{lostFoundSubmitted}</p>
              )}
            </>
          ) : activePage === "ideas-form" ? (
            <>
              <p>Share your ideas for the club.</p>
              <form onSubmit={handleIdeasSubmit} className="left-align-form">
                <label style={{ width: "100%" }}>
                  Who is submitting (leave blank to be anonymous)
                  <input
                    value={ideasForm.submittedBy}
                    onChange={(e) =>
                      setIdeasForm((s) => ({
                        ...s,
                        submittedBy: e.target.value,
                      }))
                    }
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>

                <label style={{ width: "100%" }}>
                  Idea title
                  <input
                    value={ideasForm.ideaTitle}
                    onChange={(e) =>
                      setIdeasForm((s) => ({ ...s, ideaTitle: e.target.value }))
                    }
                    style={{ width: "100%", marginTop: 4 }}
                    required
                  />
                </label>

                <label style={{ width: "100%" }}>
                  How will this improve our club?
                  <textarea
                    value={ideasForm.improvementText}
                    onChange={(e) =>
                      setIdeasForm((s) => ({
                        ...s,
                        improvementText: e.target.value,
                      }))
                    }
                    rows={4}
                    style={{ width: "100%", marginTop: 4 }}
                    required
                  />
                </label>

                <label style={{ width: "100%" }}>
                  Additional details
                  <br />
                  <textarea
                    value={ideasForm.ideaDetails}
                    onChange={(e) =>
                      setIdeasForm((s) => ({
                        ...s,
                        ideaDetails: e.target.value,
                      }))
                    }
                    rows={4}
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>

                <button type="submit">Submit idea</button>
              </form>

              {ideasSubmitted && (
                <p style={{ color: "#8bc34a" }}>{ideasSubmitted}</p>
              )}
            </>
          ) : (
            <p>
              This section is a placeholder for the{" "}
              <strong>{pageTitleMap[activePage]}</strong> page.
            </p>
          )}
        </section>
      </main>
    </>
  );
}
