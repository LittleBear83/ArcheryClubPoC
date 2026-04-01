import { useEffect, useEffectEvent, useState } from "react";
import { LoanBowSection } from "../components/LoanBowSection";
import { LoanBowReturnModal } from "../components/LoanBowReturnModal";

function buildHeaders(currentUserProfile) {
  return {
    "Content-Type": "application/json",
    "x-actor-username": currentUserProfile?.auth?.username ?? "",
  };
}

export function LoanBowRegisterPage({ currentUserProfile }) {
  const [memberOptions, setMemberOptions] = useState([]);
  const [selectedUsername, setSelectedUsername] = useState("");
  const [loanBow, setLoanBow] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [isSavingReturn, setIsSavingReturn] = useState(false);
  const [returnError, setReturnError] = useState("");

  const canManageLoanBow = ["admin", "coach"].includes(
    currentUserProfile?.membership?.role,
  );

  const loadMembers = useEffectEvent(async (signal) => {
    if (!canManageLoanBow) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/loan-bow-options", {
        headers: buildHeaders(currentUserProfile),
        signal,
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to load members.");
      }

      if (signal?.aborted) {
        return;
      }

      setMemberOptions(result.members ?? []);
      setSelectedUsername(
        (current) => current || (result.members?.[0]?.username ?? ""),
      );
    } catch (loadError) {
      if (!signal?.aborted) {
        setError(loadError.message);
        setIsLoading(false);
      }
    }
  });

  useEffect(() => {
    const abortController = new AbortController();
    const refresh = () => loadMembers(abortController.signal);

    refresh();
    window.addEventListener("profile-data-updated", refresh);
    window.addEventListener("loan-bow-data-updated", refresh);

    return () => {
      abortController.abort();
      window.removeEventListener("profile-data-updated", refresh);
      window.removeEventListener("loan-bow-data-updated", refresh);
    };
  }, [canManageLoanBow, currentUserProfile, loadMembers]);

  const loadLoanBow = useEffectEvent(async (signal) => {
    if (!canManageLoanBow || !selectedUsername) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/loan-bow-profiles/${selectedUsername}`, {
        headers: buildHeaders(currentUserProfile),
        signal,
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to load loan bow details.");
      }

      if (signal?.aborted) {
        return;
      }

      setLoanBow(result.loanBow);
      setMessage("");
    } catch (loadError) {
      if (!signal?.aborted) {
        setError(loadError.message);
      }
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  });

  useEffect(() => {
    const abortController = new AbortController();
    loadLoanBow(abortController.signal);

    return () => {
      abortController.abort();
    };
  }, [canManageLoanBow, currentUserProfile, selectedUsername, loadLoanBow]);

  const handleLoanBowFieldChange = (field) => (event) => {
    const value = event.target.value;
    setLoanBow((current) => ({
      ...current,
      [field]: field === "arrowCount" ? Number.parseInt(value, 10) || value : value,
    }));
  };

  const toggleLoanBowField = (field) => {
    setLoanBow((current) => ({
      ...current,
      [field]: !current[field],
    }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/loan-bow-profiles/${selectedUsername}`, {
        method: "PUT",
        headers: buildHeaders(currentUserProfile),
        body: JSON.stringify({ loanBow }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to save loan bow details.");
      }

      setLoanBow(result.loanBow);
      setMessage(`Loan bow details saved for ${result.member.fullName}.`);
      window.dispatchEvent(new Event("loan-bow-data-updated"));
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReturnSave = async (loanBowReturn) => {
    setIsSavingReturn(true);
    setReturnError("");
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/loan-bow-profiles/${selectedUsername}/return`,
        {
          method: "POST",
          headers: buildHeaders(currentUserProfile),
          body: JSON.stringify({ loanBowReturn }),
        },
      );
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to save loan bow return.");
      }

      setLoanBow(result.loanBow);
      setMessage(`Loan bow return saved for ${result.member.fullName}.`);
      setIsReturnModalOpen(false);
      window.dispatchEvent(new Event("loan-bow-data-updated"));
    } catch (saveError) {
      setReturnError(saveError.message);
    } finally {
      setIsSavingReturn(false);
    }
  };

  if (!canManageLoanBow) {
    return <p>Only admin and coach users can manage loan bow records.</p>;
  }

  return (
    <div className="profile-page">
      <p>Register or update loan bow equipment against a member.</p>

      <section className="profile-admin-panel">
        <h3 className="profile-section-title">Member Loan Bow Register</h3>
        <label className="profile-member-select">
          Select member
          <select
            value={selectedUsername}
            onChange={(event) => setSelectedUsername(event.target.value)}
            disabled={isLoading || isSaving}
          >
            {memberOptions.map((member) => (
              <option key={member.username} value={member.username}>
                {member.fullName} ({member.username})
              </option>
            ))}
          </select>
        </label>
      </section>

      {isLoading ? <p>Loading loan bow details...</p> : null}
      {error ? <p className="profile-error">{error}</p> : null}
      {message ? <p className="profile-success">{message}</p> : null}

      {!isLoading && loanBow ? (
        <form onSubmit={handleSave} className="left-align-form profile-form">
          <LoanBowSection
            loanBow={loanBow}
            onLoanBowFieldChange={handleLoanBowFieldChange}
            onLoanBowToggle={toggleLoanBowField}
            disabled={isSaving}
            showReturnButton={loanBow.hasLoanBow}
            onReturnClick={() => {
              setReturnError("");
              setIsReturnModalOpen(true);
            }}
          />

          <button type="submit" disabled={isSaving}>
            {isSaving ? "Saving loan bow details..." : "Save loan bow details"}
          </button>
        </form>
      ) : null}

      {loanBow ? (
        <LoanBowReturnModal
          open={isReturnModalOpen}
          loanBow={loanBow}
          isSaving={isSavingReturn}
          error={returnError}
          onClose={() => {
            if (!isSavingReturn) {
              setIsReturnModalOpen(false);
              setReturnError("");
            }
          }}
          onSubmit={handleReturnSave}
        />
      ) : null}
    </div>
  );
}
