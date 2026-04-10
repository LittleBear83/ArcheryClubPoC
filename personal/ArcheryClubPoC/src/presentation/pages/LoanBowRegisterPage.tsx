import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoanBowSection } from "../components/LoanBowSection";
import { LoanBowReturnModal } from "../components/LoanBowReturnModal";
import { hasPermission } from "../../utils/userProfile";
import { fetchApi } from "../../lib/api";

function buildHeaders(currentUserProfile) {
  return {
    "Content-Type": "application/json",
    "x-actor-username": currentUserProfile?.auth?.username ?? "",
  };
}

export function LoanBowRegisterPage({ currentUserProfile }) {
  const [selectedUsername, setSelectedUsername] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [isSavingReturn, setIsSavingReturn] = useState(false);
  const [returnError, setReturnError] = useState("");

  const canManageLoanBow = hasPermission(
    currentUserProfile,
    "manage_loan_bows",
  );
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const queryClient = useQueryClient();

  const memberOptionsQuery = useQuery({
    queryKey: ["loan-bow-options", actorUsername],
    queryFn: () =>
      fetchApi<{ success: true; members?: Array<{ username: string; fullName: string }> }>(
        "/api/loan-bow-options",
        {
          headers: buildHeaders(currentUserProfile),
        },
      ),
    enabled: canManageLoanBow,
  });

  const memberOptions = memberOptionsQuery.data?.members ?? [];
  const effectiveSelectedUsername =
    selectedUsername || memberOptions[0]?.username || "";

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["loan-bow-options", actorUsername] });
      void queryClient.invalidateQueries({ queryKey: ["loan-bow-profile", effectiveSelectedUsername, actorUsername] });
    };

    window.addEventListener("profile-data-updated", refresh);
    window.addEventListener("loan-bow-data-updated", refresh);

    return () => {
      window.removeEventListener("profile-data-updated", refresh);
      window.removeEventListener("loan-bow-data-updated", refresh);
    };
  }, [actorUsername, effectiveSelectedUsername, queryClient]);

  const loanBowQuery = useQuery({
    queryKey: ["loan-bow-profile", effectiveSelectedUsername, actorUsername],
    queryFn: () =>
      fetchApi<{ success: true; loanBow: Record<string, unknown> | null }>(
        `/api/loan-bow-profiles/${effectiveSelectedUsername}`,
        {
          headers: buildHeaders(currentUserProfile),
        },
      ),
    enabled: canManageLoanBow && Boolean(effectiveSelectedUsername),
  });

  const loanBow = loanBowQuery.data?.loanBow ?? null;
  const isLoading = memberOptionsQuery.isLoading || loanBowQuery.isLoading;

  const handleLoanBowFieldChange = (field) => (event) => {
    const value = event.target.value;
    queryClient.setQueryData(
      ["loan-bow-profile", effectiveSelectedUsername, actorUsername],
      (current: { success: true; loanBow: Record<string, unknown> | null } | undefined) => ({
        success: true,
        loanBow: {
          ...(current?.loanBow ?? {}),
          [field]: field === "arrowCount" ? Number.parseInt(value, 10) || value : value,
        },
      }),
    );
  };

  const toggleLoanBowField = (field) => {
    queryClient.setQueryData(
      ["loan-bow-profile", effectiveSelectedUsername, actorUsername],
      (current: { success: true; loanBow: Record<string, unknown> | null } | undefined) => ({
        success: true,
        loanBow: {
          ...(current?.loanBow ?? {}),
          [field]: !current?.loanBow?.[field],
        },
      }),
    );
  };

  const saveLoanBowMutation = useMutation({
    mutationFn: async () =>
      fetchApi<{ success: true; loanBow: Record<string, unknown> | null; member: { fullName: string } }>(
        `/api/loan-bow-profiles/${effectiveSelectedUsername}`,
        {
          method: "PUT",
          headers: buildHeaders(currentUserProfile),
          body: JSON.stringify({ loanBow }),
        },
      ),
    onMutate: () => {
      setIsSaving(true);
      setError("");
      setMessage("");
    },
    onSuccess: async (result) => {
      queryClient.setQueryData(
        ["loan-bow-profile", effectiveSelectedUsername, actorUsername],
        { success: true, loanBow: result.loanBow },
      );
      await queryClient.invalidateQueries({ queryKey: ["loan-bow-options", actorUsername] });
      setMessage(`Loan bow details saved for ${result.member.fullName}.`);
      window.dispatchEvent(new Event("loan-bow-data-updated"));
    },
    onError: (saveError: Error) => {
      setError(saveError.message);
    },
    onSettled: () => {
      setIsSaving(false);
    },
  });

  const handleSave = async (event) => {
    event.preventDefault();
    await saveLoanBowMutation.mutateAsync();
  };

  const returnLoanBowMutation = useMutation({
    mutationFn: async (loanBowReturn: Record<string, unknown>) =>
      fetchApi<{ success: true; loanBow: Record<string, unknown> | null; member: { fullName: string } }>(
        `/api/loan-bow-profiles/${effectiveSelectedUsername}/return`,
        {
          method: "POST",
          headers: buildHeaders(currentUserProfile),
          body: JSON.stringify({ loanBowReturn }),
        },
      ),
    onMutate: () => {
      setIsSavingReturn(true);
      setReturnError("");
      setError("");
      setMessage("");
    },
    onSuccess: (result) => {
      queryClient.setQueryData(
        ["loan-bow-profile", effectiveSelectedUsername, actorUsername],
        { success: true, loanBow: result.loanBow },
      );
      setMessage(`Loan bow return saved for ${result.member.fullName}.`);
      setIsReturnModalOpen(false);
      window.dispatchEvent(new Event("loan-bow-data-updated"));
    },
    onError: (saveError: Error) => {
      setReturnError(saveError.message);
    },
    onSettled: () => {
      setIsSavingReturn(false);
    },
  });

  const handleReturnSave = async (loanBowReturn) => {
    await returnLoanBowMutation.mutateAsync(loanBowReturn);
  };

  if (!canManageLoanBow) {
    return <p>You do not have permission to manage loan bow records.</p>;
  }

  return (
    <div className="profile-page">
      <p>Register or update loan bow equipment against a member.</p>

      <section className="profile-admin-panel">
        <h3 className="profile-section-title">Member Loan Bow Register</h3>
        <label className="profile-member-select">
          Select member
          <select
            value={effectiveSelectedUsername}
            onChange={(event) => setSelectedUsername(event.target.value)}
            disabled={isSaving || memberOptions.length === 0}
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

      {loanBow ? (
        <form onSubmit={handleSave} className="left-align-form profile-form">
          <LoanBowSection
            loanBow={loanBow}
            onLoanBowFieldChange={handleLoanBowFieldChange}
            onLoanBowToggle={toggleLoanBowField}
            disabled={isSaving || isLoading}
            showReturnButton={Boolean(loanBow.hasLoanBow)}
            onReturnClick={() => {
              setReturnError("");
              setIsReturnModalOpen(true);
            }}
          />

          <button type="submit" disabled={isSaving || isLoading}>
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
