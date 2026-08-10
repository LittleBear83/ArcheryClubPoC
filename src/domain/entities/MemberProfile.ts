export type LoanBow = {
  hasLoanBow: boolean;
  dateLoaned: string;
  riserNumber: string;
  limbsNumber: string;
  arrowCount: number | string;
  quiver: boolean;
  fingerTab: boolean;
  string: boolean;
  armGuard: boolean;
  chestGuard: boolean;
  sight: boolean;
  longRod: boolean;
  pressureButton: boolean;
};

export type DistanceSignOff = {
  username: string;
  discipline: string;
  distanceYards: number;
  source?: string;
  signedOffByUsername: string;
  signedOffByName: string;
  signedOffAt: string;
};

export type DistanceSignOffDistance = {
  distanceYards: number;
  signOff: DistanceSignOff | null;
};

export type DistanceSignOffDiscipline = {
  discipline: string;
  distances: DistanceSignOffDistance[];
};

export type EditableMemberProfile = {
  username: string;
  firstName: string;
  surname: string;
  goldenRecordsId?: string;
  archeryGbMembershipNumber: string;
  emailAddress: string;
  password: string;
  rfidTag: string;
  activeMember: boolean;
  affiliateMember: boolean;
  juniorMember: boolean;
  membershipFeesDue: string;
  coachingVolunteer: boolean;
  userType: string;
  disciplines: string[];
  loanBow: LoanBow;
  distanceSignOffs?: DistanceSignOffDiscipline[];
};

export type GoldenRecordsHandicap = {
  achieved: string;
  bowClass: string;
  discipline: string;
  handicap: number | null;
  memberId: string;
  name: string;
  type: string;
  updated: string;
};

export type GoldenRecordsAchievement = {
  achieved: string;
  achievement: string;
  achievementId: string;
  ageGroup: string;
  bowClass: string;
  discipline: string;
  memberId: string;
  name: string;
  round: string;
};

export type GoldenRecordsClassification = {
  achieved: string;
  ageGroup: string;
  bowClass: string;
  classification: string;
  classificationId: string;
  discipline: string;
  memberId: string;
  name: string;
  type: string;
  updated: string;
};

export type GoldenRecordsCandidateMatch = {
  memberArchived: boolean;
  memberId: string;
  membershipId: string;
  name: string;
};

export type GoldenRecordsSnapshot = {
  achievements: GoldenRecordsAchievement[];
  candidateMatches?: GoldenRecordsCandidateMatch[];
  classifications: GoldenRecordsClassification[];
  enabled: boolean;
  error?: string;
  fetchedAt?: string;
  handicaps: GoldenRecordsHandicap[];
  matchedMemberId: string;
  matchedMemberName: string;
  matchSource: string;
};

export type MemberProfileFormInput = {
  username?: string;
  firstName: string;
  surname: string;
  goldenRecordsId?: string;
  archeryGbMembershipNumber?: string;
  emailAddress?: string;
  password?: string;
  rfidTag?: string;
  activeMember?: boolean;
  affiliateMember?: boolean;
  juniorMember?: boolean;
  membershipFeesDue?: string;
  coachingVolunteer?: boolean;
  userType?: string;
  disciplines?: string[];
  loanBow?: LoanBow;
};

export type MemberOption = {
  username: string;
  fullName: string;
  userType: string;
};

export type EquipmentLoan = {
  id: string | number;
  type: string;
  typeLabel: string;
  reference: string;
  loanDate: string;
};

export type ProfileOptions = {
  members: MemberOption[];
  userTypes: string[];
  disciplines: string[];
};

export type MemberProfilePageData = {
  editableProfile: EditableMemberProfile;
  equipmentLoans: EquipmentLoan[];
  disciplines: string[];
  goldenRecords?: GoldenRecordsSnapshot;
  userTypes: string[];
  userProfile?: unknown;
};

export type MemberProfileSaveResult = {
  editableProfile: EditableMemberProfile;
  userProfile?: unknown;
};

export type MemberProfileDeleteResult = {
  deletedUsername: string;
  message?: string;
};

export type MemberProfileApiProfileResult = MemberProfileSaveResult & {
  disciplines: string[];
  goldenRecords?: GoldenRecordsSnapshot;
  userTypes: string[];
};

export type LoanBowReturnPayload = {
  returnDate: string;
  bowCondition: string;
  arrowsReturned: number;
  returnNotes: string;
};

export type LoanBowReturnResult = {
  member: {
    username: string;
    fullName: string;
    userType: string;
  };
  loanBow: LoanBow;
};

export type DistanceSignOffInput = {
  discipline: string;
  distanceYards: number;
  memberPasswordConfirmation: string;
};

export type DistanceSignOffResult = {
  message?: string;
  signOff: DistanceSignOff | null;
  editableProfile: EditableMemberProfile;
};

export type GoldenRecordsHandicapRefreshResult = {
  createdHandicapCount: number;
  goldenRecords?: GoldenRecordsSnapshot;
  message?: string;
  syncedHandicapCount: number;
  updatedHandicapCount: number;
};

export type GoldenRecordsMatchAssignResult = GoldenRecordsHandicapRefreshResult;
