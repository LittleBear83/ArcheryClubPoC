export type TournamentParticipant = {
  bowCode?: string | null;
  username?: string;
  fullName: string;
  seed?: number | null;
};

export type TournamentMatch = {
  id: string | number;
  status: string;
  leftParticipant?: TournamentParticipant | null;
  rightParticipant?: TournamentParticipant | null;
  leftScore?: number | null;
  rightScore?: number | null;
  winner?: TournamentParticipant | null;
  retirement?: {
    competitorA?: boolean;
    competitorB?: boolean;
  } | null;
  handicap?: {
    allowancePercent?: number | null;
    competitorA?: {
      allowancePoints?: number | null;
      adjustedScore?: number | null;
      bowClass?: string | null;
      discipline?: string | null;
      handicapType?: string | null;
      handicapValue?: number | null;
      referenceScore?: number | null;
      tableKey?: string | null;
      tableTitle?: string | null;
    } | null;
    competitorB?: {
      allowancePoints?: number | null;
      adjustedScore?: number | null;
      bowClass?: string | null;
      discipline?: string | null;
      handicapType?: string | null;
      handicapValue?: number | null;
      referenceScore?: number | null;
      tableKey?: string | null;
      tableTitle?: string | null;
    } | null;
  } | null;
  workflow?: {
    resultSubmissionMode?: string;
    requiresOpponentConfirmation?: boolean;
    submittedByUsername?: string | null;
    submittedAt?: string | null;
    confirmedByUsername?: string | null;
    confirmedAt?: string | null;
    disputedByUsername?: string | null;
    disputedAt?: string | null;
    disputeReason?: string | null;
    actorRole?: "competitorA" | "competitorB" | null;
    ineligibilityReason?: string | null;
    canSubmitResult?: boolean;
    canConfirmResult?: boolean;
    canDisputeResult?: boolean;
  };
};

export type TournamentRound = {
  roundNumber: number;
  title: string;
  matches: TournamentMatch[];
};

export type TournamentRecord = {
  id: string | number;
  name: string;
  type: string;
  typeLabel: string;
  templateKey?: string | null;
  templateLabel?: string | null;
  roundOneStartDate?: string | null;
  roundWindowDays?: number | null;
  roundRestDays?: number | null;
  roundSchedule?: Array<{
    roundNumber: number;
    title: string;
    publishDate?: string | null;
    submissionDeadline?: string | null;
  }>;
  registrationCount: number;
  currentRoundNumber?: number;
  actorScore?: number | null;
  draw?: {
    canRedraw?: boolean;
    generatedAt?: string | null;
    isRandomized?: boolean;
  } | null;
  eligibility?: {
    actor?: {
      currentRound?: {
        isEligible?: boolean;
        reason?: string | null;
      } | null;
      registration?: {
        isEligible?: boolean;
        reason?: string | null;
      } | null;
      hasCurrentHandicap?: boolean | null;
      qualifyingRoundCount?: number;
    } | null;
  } | null;
  currentMatch?: {
    id: string | number;
    roundNumber: number;
    roundTitle: string;
    status: string;
    competitorA?: TournamentParticipant | null;
    competitorB?: TournamentParticipant | null;
    score?: {
      competitorA?: number | null;
      competitorB?: number | null;
    };
    winner?: TournamentParticipant | null;
    retirement?: TournamentMatch["retirement"];
    handicap?: TournamentMatch["handicap"];
    submissionDeadline?: string | null;
    workflow?: {
      resultSubmissionMode?: string;
      requiresOpponentConfirmation?: boolean;
      submittedByUsername?: string | null;
      submittedAt?: string | null;
      confirmedByUsername?: string | null;
      confirmedAt?: string | null;
      disputedByUsername?: string | null;
      disputedAt?: string | null;
      disputeReason?: string | null;
      actorRole?: "competitorA" | "competitorB" | null;
      ineligibilityReason?: string | null;
      canSubmitResult?: boolean;
      canConfirmResult?: boolean;
      canDisputeResult?: boolean;
    };
  } | null;
  isRegistered: boolean;
  canRegister: boolean;
  canWithdraw: boolean;
  canSubmitScore: boolean;
  needsScoreReminder?: boolean;
  bracketReady: boolean;
  registrationWindow: {
    startDate: string;
    endDate: string;
    isOpen?: boolean;
    isClosed?: boolean;
  };
  scoreWindow: {
    startDate: string;
    endDate: string;
  };
  registrations: Array<{
    bowCode?: string | null;
    username: string;
    fullName: string;
    eligibility?: {
      hasCurrentHandicap?: boolean | null;
      qualifyingRoundCount?: number;
      registration?: {
        isEligible?: boolean;
        reason?: string | null;
      } | null;
    } | null;
  }>;
  bracket: {
    rounds: TournamentRound[];
    winner?: TournamentParticipant | null;
  };
  engine?: {
    format: string;
    template?: {
      key: string;
      label: string;
      description?: string;
      roundType?: string;
      capabilities?: Record<string, boolean>;
      defaults?: {
        registrationMode?: string;
        resultWorkflow?: string;
        handicapAllowancePercent?: number | null;
      };
      eligibilityRules?: {
        handicapQualificationRoundsRequired?: number;
        qualifyingRoundsRequiredPerKnockoutRound?: number;
        qualifyingRoundDiscipline?: string;
      } | null;
    } | null;
    lifecycle?: {
      registrationWindow?: {
        startDate: string;
        endDate: string;
        isOpen?: boolean;
        isClosed?: boolean;
      };
      drawDate?: string | null;
      activeRoundNumber?: number | null;
      scoreWindow?: {
        startDate: string;
        endDate: string;
        isOpen?: boolean;
      };
    };
    rounds?: Array<{
      roundNumber: number;
      title: string;
      status: string;
      submissionDeadline?: string | null;
      matches: Array<{
        id: string | number;
        roundNumber: number;
        roundTitle: string;
        status: string;
        competitorA?: TournamentParticipant | null;
        competitorB?: TournamentParticipant | null;
        score?: {
          competitorA?: number | null;
          competitorB?: number | null;
        };
        winner?: TournamentParticipant | null;
        retirement?: TournamentMatch["retirement"];
        handicap?: TournamentMatch["handicap"];
        submissionDeadline?: string | null;
        workflow?: {
          resultSubmissionMode?: string;
          requiresOpponentConfirmation?: boolean;
          disputeReason?: string | null;
          ineligibilityReason?: string | null;
        };
      }>;
    }>;
    matches?: Array<{
      id: string | number;
      roundNumber: number;
      roundTitle: string;
      status: string;
      competitorA?: TournamentParticipant | null;
      competitorB?: TournamentParticipant | null;
      score?: {
        competitorA?: number | null;
        competitorB?: number | null;
      };
      winner?: TournamentParticipant | null;
      retirement?: TournamentMatch["retirement"];
      handicap?: TournamentMatch["handicap"];
      submissionDeadline?: string | null;
      workflow?: {
        resultSubmissionMode?: string;
        requiresOpponentConfirmation?: boolean;
        disputeReason?: string | null;
        ineligibilityReason?: string | null;
      };
    }>;
  };
};
