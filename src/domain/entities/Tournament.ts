export type TournamentForm = {
  name: string;
  tournamentType: string;
  registrationStartDate: string;
  registrationEndDate: string;
  scoreSubmissionStartDate: string;
  scoreSubmissionEndDate: string;
};

export type TournamentScoreSubmission = {
  score: string | number;
};
