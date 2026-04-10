import { useState } from "react";
import { Button } from "../components/Button";

export function FeedbackFormPage() {
  const [form, setForm] = useState({ submittedBy: "", feedbackText: "" });
  const [submitted, setSubmitted] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();

    const author = form.submittedBy.trim() || "Anonymous";
    setSubmitted(`Feedback saved by ${author}: ${form.feedbackText}`);
    setForm({ submittedBy: "", feedbackText: "" });
  };

  return (
    <>
      <p>Submit your feedback.</p>
      <form onSubmit={handleSubmit} className="left-align-form">
        <label>
          Who is submitting (leave blank to be anonymous)
          <input
            value={form.submittedBy}
            onChange={(e) => setForm((s) => ({ ...s, submittedBy: e.target.value }))}
          />
        </label>

        <label>
          What is your feedback?
          <textarea
            value={form.feedbackText}
            onChange={(e) => setForm((s) => ({ ...s, feedbackText: e.target.value }))}
            rows={4}
            required
          />
        </label>

        <Button type="submit">Submit feedback</Button>
      </form>
      {submitted ? <p className="profile-success">{submitted}</p> : null}
    </>
  );
}
