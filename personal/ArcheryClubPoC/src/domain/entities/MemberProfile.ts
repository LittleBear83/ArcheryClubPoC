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
  userProfile?: unknown;
};

export type MemberProfileSaveResult = {
  editableProfile: EditableMemberProfile;
  userProfile?: unknown;
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
