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
  password: string;
  rfidTag: string;
  activeMember: boolean;
  membershipFeesDue: string;
  coachingVolunteer: boolean;
  userType: string;
  disciplines: string[];
  loanBow: LoanBow;
  distanceSignOffs?: DistanceSignOffDiscipline[];
};

export type MemberProfileFormInput = {
  username?: string;
  firstName: string;
  surname: string;
  password?: string;
  rfidTag?: string;
  activeMember?: boolean;
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
  userTypes: string[];
  userProfile?: unknown;
};

export type MemberProfileSaveResult = {
  editableProfile: EditableMemberProfile;
  userProfile?: unknown;
};

export type MemberProfileApiProfileResult = MemberProfileSaveResult & {
  disciplines: string[];
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
  memberUsernameConfirmation: string;
};

export type DistanceSignOffResult = {
  message?: string;
  signOff: DistanceSignOff | null;
  editableProfile: EditableMemberProfile;
};
