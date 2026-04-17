import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/Button";
import { LabeledSelect } from "../components/LabeledSelect";
import { LoanBowSection } from "../components/LoanBowSection";
import { LoanBowReturnModal } from "../components/LoanBowReturnModal";
import { SectionPanel } from "../components/SectionPanel";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import {
  formatMemberDisplayName,
  formatMemberDisplayUsername,
  hasPermission,
} from "../../utils/userProfile";
import {
  getLoanBowProfile,
  listLoanBowOptions,
  returnLoanBowProfile,
  updateLoanBowProfile,
} from "../../api/loanBowApi";

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
      listLoanBowOptions<{ username: string; fullName: string }>(currentUserProfile),
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
      getLoanBowProfile(currentUserProfile, effectiveSelectedUsername),
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
      updateLoanBowProfile(currentUserProfile, effectiveSelectedUsername, loanBow),
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
      returnLoanBowProfile(currentUserProfile, effectiveSelectedUsername, loanBowReturn),
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

      <SectionPanel className="profile-admin-panel" title="Member Loan Bow Register">
        <LabeledSelect
          label="Select member"
          value={effectiveSelectedUsername}
          onChange={(event) => setSelectedUsername(event.target.value)}
          disabled={isSaving || memberOptions.length === 0}
        >
          {memberOptions.map((member) => (
            <option key={member.username} value={member.username}>
              {formatMemberDisplayName(member)} ({formatMemberDisplayUsername(member)})
            </option>
          ))}
        </LabeledSelect>
      </SectionPanel>

      <StatusMessagePanel
        error={error}
        loading={isLoading}
        loadingLabel="Loading loan bow details..."
        success={message}
      />

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

          <Button type="submit" disabled={isSaving || isLoading}>
            {isSaving ? "Saving loan bow details..." : "Save loan bow details"}
          </Button>
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
