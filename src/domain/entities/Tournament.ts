export type TournamentForm = {
  name: string;
  randomiseEveryRound?: boolean;
  templateKey?: string;
  tournamentType: string;
  roundOneStartDate: string;
  roundWindowDays: number;
  roundRestDays: number;
  registrationStartDate: string;
  registrationEndDate: string;
};

export type TournamentScoreSubmission = {
  score: string | number;
};
