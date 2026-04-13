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
    archeryGbMembershipNumber?: string | null;
  };
  membership?: {
    role?: string;
    permissions?: string[];
    disciplines?: string[];
  };
  meta?: {
    activeMember?: boolean;
    membershipFeesDue?: string;
    [key: string]: unknown;
  };
};

export type HomeMember = UserProfile;

export type CoachingBooking = {
  username: string;
  fullName: string;
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
  isApproved?: boolean;
  canApprove?: boolean;
  approvalStatus?: string;
  rejectionReason?: string;
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
  venue: string;
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
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  lessonNumber: number;
  coordinatorName: string;
  coachNames: string[];
  beginnerCount: number;
  beginnerCapacity: number;
  placesRemaining: number;
};
