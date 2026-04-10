import { useState } from "react";

export function LostAndFoundPage() {
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
  const [submitted, setSubmitted] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const summary =
      lostFoundType === "found"
        ? `Found: ${lostFoundForm.foundItem} at ${lostFoundForm.foundLocation}, found by ${lostFoundForm.whoFound}`
        : `Lost: ${lostFoundForm.lostItem} by ${lostFoundForm.lostPerson} at ${lostFoundForm.lostLocation}`;

    setSubmitted(`Entry saved (${lostFoundType}). ${summary}`);
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

  return (
    <>
      <p>Register lost or found items.</p>
      <form onSubmit={handleSubmit} className="left-align-form">
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
            <label>
              Who found it
              <input
                value={lostFoundForm.whoFound}
                onChange={(e) =>
                  setLostFoundForm((s) => ({ ...s, whoFound: e.target.value }))
                }
                required
              />
            </label>
            <label>
              What was found
              <input
                value={lostFoundForm.foundItem}
                onChange={(e) =>
                  setLostFoundForm((s) => ({ ...s, foundItem: e.target.value }))
                }
                required
              />
            </label>
            <label>
              Where at the range was it found
              <input
                value={lostFoundForm.foundLocation}
                onChange={(e) =>
                  setLostFoundForm((s) => ({
                    ...s,
                    foundLocation: e.target.value,
                  }))
                }
                required
              />
            </label>
          </>
        ) : (
          <>
            <label>
              What has been lost
              <input
                value={lostFoundForm.lostItem}
                onChange={(e) =>
                  setLostFoundForm((s) => ({ ...s, lostItem: e.target.value }))
                }
                required
              />
            </label>
            <label>
              Who has lost it
              <input
                value={lostFoundForm.lostPerson}
                onChange={(e) =>
                  setLostFoundForm((s) => ({
                    ...s,
                    lostPerson: e.target.value,
                  }))
                }
                required
              />
            </label>
            <label>
              Where it was lost
              <input
                value={lostFoundForm.lostLocation}
                onChange={(e) =>
                  setLostFoundForm((s) => ({
                    ...s,
                    lostLocation: e.target.value,
                  }))
                }
                required
              />
            </label>
          </>
        )}

        <label>
          Additional notes
          <textarea
            value={lostFoundForm.notes}
            onChange={(e) =>
              setLostFoundForm((s) => ({ ...s, notes: e.target.value }))
            }
            rows={3}
          />
        </label>

        <button type="submit">Submit</button>
      </form>
      {submitted && <p style={{ color: "#8bc34a" }}>{submitted}</p>}
    </>
  );
}
