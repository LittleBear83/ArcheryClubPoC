import { useState } from "react";
import { Button } from "../components/Button";

export function FeedbackFormPage() {
  const [form, setForm] = useState({
    submittedBy: "",
    suggestionTitle: "",
    improvementText: "",
    suggestionDetails: "",
  });
  const [submitted, setSubmitted] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();

    const author = form.submittedBy.trim() || "Anonymous";
    setSubmitted(`Suggestion by ${author} saved: ${form.suggestionTitle}`);
    setForm({
      submittedBy: "",
      suggestionTitle: "",
      improvementText: "",
      suggestionDetails: "",
    });
  };

  return (
    <div className="profile-page utility-form-page">
      <p>Use the suggestion box to share ideas or improvements for the club.</p>
      <form onSubmit={handleSubmit} className="left-align-form profile-form utility-form-card">
        <label>
          Who is submitting (leave blank to be anonymous)
          <input
            value={form.submittedBy}
            onChange={(e) => setForm((s) => ({ ...s, submittedBy: e.target.value }))}
          />
        </label>

        <label>
          Suggestion title
          <input
            value={form.suggestionTitle}
            onChange={(e) => setForm((s) => ({ ...s, suggestionTitle: e.target.value }))}
            required
          />
        </label>

        <label>
          How will this improve our club?
          <textarea
            value={form.improvementText}
            onChange={(e) =>
              setForm((s) => ({ ...s, improvementText: e.target.value }))
            }
            rows={4}
            required
          />
        </label>

        <label>
          Additional details
          <textarea
            value={form.suggestionDetails}
            onChange={(e) =>
              setForm((s) => ({ ...s, suggestionDetails: e.target.value }))
            }
            rows={4}
          />
        </label>

        <Button type="submit">Submit suggestion</Button>
      </form>
      {submitted ? <p className="profile-success">{submitted}</p> : null}
    </div>
  );
}
