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
  registrationCount: number;
  currentRoundNumber?: number;
  actorScore?: number | null;
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
};
