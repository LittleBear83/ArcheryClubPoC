export type TournamentParticipant = {
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
    username: string;
    fullName: string;
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
        submissionDeadline?: string | null;
        workflow?: {
          resultSubmissionMode?: string;
          requiresOpponentConfirmation?: boolean;
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
      submissionDeadline?: string | null;
      workflow?: {
        resultSubmissionMode?: string;
        requiresOpponentConfirmation?: boolean;
      };
    }>;
  };
};
