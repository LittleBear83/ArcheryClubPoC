import { useState } from "react";

export function IdeasFormPage() {
  const [form, setForm] = useState({
    submittedBy: "",
    ideaTitle: "",
    improvementText: "",
    ideaDetails: "",
  });
  const [submitted, setSubmitted] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const author = form.submittedBy.trim() || "Anonymous";
    setSubmitted(`Idea by ${author} saved: ${form.ideaTitle}`);
    setForm({
      submittedBy: "",
      ideaTitle: "",
      improvementText: "",
      ideaDetails: "",
    });
  };

  return (
    <>
      <p>Share your ideas for the club.</p>
      <form onSubmit={handleSubmit} className="left-align-form">
        <label>
          Who is submitting (leave blank to be anonymous)
          <input
            value={form.submittedBy}
            onChange={(e) =>
              setForm((s) => ({ ...s, submittedBy: e.target.value }))
            }
          />
        </label>

        <label>
          Idea title
          <input
            value={form.ideaTitle}
            onChange={(e) =>
              setForm((s) => ({ ...s, ideaTitle: e.target.value }))
            }
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
            onChange={(e) =>
              setForm((s) => ({ ...s, ideaDetails: e.target.value }))
            }
            rows={4}
          />
        </label>

        <button type="submit">Submit idea</button>
      </form>
      {submitted && <p style={{ color: "#8bc34a" }}>{submitted}</p>}
    </>
  );
}
