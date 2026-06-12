import { useState } from "react";
import { Button } from "../components/Button";

export function FeedbackFormPage() {
  const [form, setForm] = useState({
    submittedBy: "",
    submissionType: "feedback",
    feedbackText: "",
    ideaTitle: "",
    improvementText: "",
    ideaDetails: "",
  });
  const [submitted, setSubmitted] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();

    const author = form.submittedBy.trim() || "Anonymous";
    if (form.submissionType === "idea") {
      setSubmitted(`Idea by ${author} saved: ${form.ideaTitle}`);
    } else {
      setSubmitted(`Feedback saved by ${author}: ${form.feedbackText}`);
    }
    setForm({
      submittedBy: "",
      submissionType: form.submissionType,
      feedbackText: "",
      ideaTitle: "",
      improvementText: "",
      ideaDetails: "",
    });
  };

  return (
    <div className="profile-page utility-form-page">
      <p>Submit feedback or share a new idea for the club.</p>
      <form onSubmit={handleSubmit} className="left-align-form profile-form utility-form-card">
        <label>
          What would you like to send?
          <select
            value={form.submissionType}
            onChange={(e) =>
              setForm((s) => ({ ...s, submissionType: e.target.value }))
            }
          >
            <option value="feedback">Feedback</option>
            <option value="idea">Idea</option>
          </select>
        </label>

        <label>
          Who is submitting (leave blank to be anonymous)
          <input
            value={form.submittedBy}
            onChange={(e) => setForm((s) => ({ ...s, submittedBy: e.target.value }))}
          />
        </label>

        {form.submissionType === "idea" ? (
          <>
            <label>
              Idea title
              <input
                value={form.ideaTitle}
                onChange={(e) => setForm((s) => ({ ...s, ideaTitle: e.target.value }))}
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
                value={form.ideaDetails}
                onChange={(e) => setForm((s) => ({ ...s, ideaDetails: e.target.value }))}
                rows={4}
              />
            </label>
          </>
        ) : (
          <label>
            What is your feedback?
            <textarea
              value={form.feedbackText}
              onChange={(e) => setForm((s) => ({ ...s, feedbackText: e.target.value }))}
              rows={4}
              required
            />
          </label>
        )}

        <Button type="submit">
          {form.submissionType === "idea" ? "Submit idea" : "Submit feedback"}
        </Button>
      </form>
      {submitted ? <p className="profile-success">{submitted}</p> : null}
    </div>
  );
}
