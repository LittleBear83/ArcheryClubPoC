export type UserProfile = {
  id?: string | number | null;
  accountType?: string;
  auth?: {
    username?: string | null;
    rfidEnabled?: boolean;
  };
  personal?: {
    firstName?: string;
    surname?: string;
    fullName?: string;
    emailAddress?: string;
    archeryGbMembershipNumber?: string | null;
  };
  membership?: {
    role?: string;
    status?: string;
    programmeType?: string;
    permissions?: string[];
    disciplines?: string[];
  };
  meta?: {
    activeMember?: boolean;
    affiliateMember?: boolean;
    membershipFeesDue?: string;
    [key: string]: unknown;
  };
};

export type HomeMember = UserProfile;

export type CoachingBooking = {
  username: string;
  fullName: string;
};

export type EventBooking = {
  username: string;
  fullName: string;
  bookedAt?: string;
};

export type CoachingSession = {
  id: string | number;
  date: string;
  startTime: string;
  endTime: string;
  topic: string;
  summary: string;
  venue: string;
  availableSlots: number;
  bookingCount: number;
  remainingSlots: number;
  isBookedOn?: boolean;
  isPendingApproval?: boolean;
  isRejected?: boolean;
  isCancelled?: boolean;
  isApproved?: boolean;
  canApprove?: boolean;
  approvalStatus?: string;
  rejectionReason?: string;
  cancellationReason?: string;
  createdAt?: string;
  coach: {
    username: string;
    fullName: string;
  };
  bookings: CoachingBooking[];
};

export type ApprovalEvent = {
  id: string | number;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  type: string;
  types?: string[];
  venue: string;
  bookings?: EventBooking[];
  bookingCount?: number;
  canViewBookings?: boolean;
  submittedByUsername?: string;
  approvalStatus?: string;
  isPendingApproval?: boolean;
  isRejected?: boolean;
  rejectionReason?: string;
};

export type BeginnersCourseCalendarLesson = {
  id: string | number;
  courseId: string | number;
  lessonId: string | number;
  courseType?: "beginners" | "have-a-go" | "taster-session";
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  lessonNumber: number;
  coordinatorName: string;
  coachNames: string[];
  beginnerCount: number;
  participantCount?: number;
  beginnerCapacity: number;
  participantCapacity?: number;
  placesRemaining: number;
  isCancelled?: boolean;
  cancellationReason?: string;
};

export type LostArrowRecord = {
  id: number;
  archerUsername: string;
  archerName: string;
  dateLost: string;
  arrowMaterial: "aluminium" | "carbon" | "wood";
  arrowColour: string;
  arrowIdentifier: string;
  fletchingColour1: string;
  fletchingColour2: string;
  fletchingColour3: string;
  nockColour: string;
  targetDistance: string;
  laneNumber: number;
  otherDetails?: string;
  dateFound?: string;
  foundByUsername?: string;
  foundByName?: string;
  foundCollectionLocation?: string;
  createdAtDate: string;
  createdAtTime: string;
};

export type OutdoorTableEntry = {
  id: number;
  seasonYear: number;
  archerUsername: string;
  archerFirstName: string;
  archerSurname: string;
  archerName: string;
  bowType: string;
  handicap: number | null;
  archer3rd: boolean;
  archer2nd: boolean;
  archer1st: boolean;
  bowman3rd: boolean;
  bowman2nd: boolean;
  bowman1st: boolean;
  masterBowman: boolean;
  grandMasterBowman: boolean;
  eliteMasterBowman: boolean;
  archer3rdDate: string;
  archer2ndDate: string;
  archer1stDate: string;
  bowman3rdDate: string;
  bowman2ndDate: string;
  bowman1stDate: string;
  masterBowmanDate: string;
  grandMasterBowmanDate: string;
  eliteMasterBowmanDate: string;
  award25220: boolean;
  award25230: boolean;
  award25240: boolean;
  award25250: boolean;
  award25260: boolean;
  award25280: boolean;
  award252100: boolean;
  award25220SignOffDates: string[];
  award25230SignOffDates: string[];
  award25240SignOffDates: string[];
  award25250SignOffDates: string[];
  award25260SignOffDates: string[];
  award25280SignOffDates: string[];
  award252100SignOffDates: string[];
  cloutWhite20: boolean;
  cloutWhite30: boolean;
  cloutWhite40: boolean;
  cloutWhite50: boolean;
  cloutWhite60: boolean;
  cloutWhite7080: boolean;
  cloutWhite90100: boolean;
  createdAtDate: string;
  createdAtTime: string;
  updatedAtDate?: string;
  updatedAtTime?: string;
  updatedByUsername?: string;
};
