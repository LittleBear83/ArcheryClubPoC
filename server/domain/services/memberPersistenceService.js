import { normalizeMembershipClassification } from "../../../shared/membershipClassificationRules.js";

export function getDeactivatedRfidTag(rfidTag, deactivatedRfidSuffix) {
  if (typeof rfidTag !== "string") {
    return null;
  }

  const trimmedTag = rfidTag.trim();

  if (!trimmedTag) {
    return null;
  }

  return trimmedTag.endsWith(deactivatedRfidSuffix)
    ? trimmedTag
    : `${trimmedTag}${deactivatedRfidSuffix}`;
}

export function normalizeMemberStatusWithFees(user, {
  deactivatedRfidSuffix,
  now = new Date(),
} = {}) {
  if (!user) {
    return null;
  }

  const membershipFeesDue = user.membership_fees_due ?? "";

  if (
    !membershipFeesDue ||
    Number.isNaN(new Date(`${membershipFeesDue}T23:59:59.999Z`).getTime()) ||
    new Date(`${membershipFeesDue}T23:59:59.999Z`).getTime() >= now.getTime()
  ) {
    return {
      ...user,
      requiresMembershipStatusSync: false,
    };
  }

  const nextRfidTag = getDeactivatedRfidTag(user.rfid_tag, deactivatedRfidSuffix);
  const requiresUpdate =
    Boolean(user.active_member) || (user.rfid_tag ?? null) !== nextRfidTag;

  return {
    ...user,
    active_member: 0,
    rfid_tag: nextRfidTag,
    requiresMembershipStatusSync: requiresUpdate,
  };
}

export function createMemberPersistenceService({
  buildEditableMemberProfile,
  buildMemberUserProfile,
  deactivatedRfidSuffix,
  hashPassword,
  membershipStatusOptions = ["member", "non-member", "guest"],
  memberAuthGateway,
  memberProfileGateway,
  programmeTypeOptions = ["none", "beginners", "have-a-go", "taster-session"],
  sanitizeDisciplines,
  sanitizeLoanBow,
}) {
  const inferMembershipStatus = (membershipStatus, userType) => {
    const normalizedStatus = String(membershipStatus ?? "").trim().toLowerCase();

    if (membershipStatusOptions.includes(normalizedStatus)) {
      return normalizedStatus;
    }

    const normalizedRole = String(userType ?? "").trim().toLowerCase();

    if (
      normalizedRole === "beginner" ||
      normalizedRole === "have-a-go" ||
      normalizedRole === "non-member" ||
      normalizedRole === "prospect"
    ) {
      return "non-member";
    }

    if (normalizedRole === "guest") {
      return "guest";
    }

    return "member";
  };

  const inferProgrammeType = (programmeType, userType) => {
    const normalizedProgrammeType = String(programmeType ?? "").trim().toLowerCase();

    if (programmeTypeOptions.includes(normalizedProgrammeType)) {
      return normalizedProgrammeType;
    }

    const normalizedRole = String(userType ?? "").trim().toLowerCase();

    if (normalizedRole === "beginner") {
      return "beginners";
    }

    if (normalizedRole === "have-a-go") {
      return "have-a-go";
    }

    return "none";
  };

  return {
    async saveMemberProfile({
      activeMember,
      archeryGbMembershipNumber,
      affiliateMember,
      juniorMember,
      coachingVolunteer,
      disciplines,
      emailAddress,
      existingUser,
      firstName,
      goldenRecordsId,
      loanBow,
      membershipStatus,
      membershipFeesDue,
      password,
      programmeType,
      rfidTag,
      surname,
      userType,
      username,
    }) {
      const trimmedUsername = username?.trim();
      const trimmedFirstName = firstName?.trim();
      const trimmedSurname = surname?.trim();
      const trimmedArcheryGbMembershipNumber = archeryGbMembershipNumber?.trim() || "";
      const trimmedEmailAddress = emailAddress?.trim() || "";
      const trimmedPassword = password?.trim();
      const trimmedRfidTag = rfidTag?.trim();
      const normalizedActiveMember = Boolean(activeMember);
      const normalizedAffiliateMember = Boolean(affiliateMember);
      const normalizedJuniorMember = Boolean(juniorMember);
      const normalizedMembershipFeesDue = membershipFeesDue?.trim() || null;
      const normalizedCoachingVolunteer = Boolean(coachingVolunteer);
      const normalizedDisciplines = sanitizeDisciplines(disciplines);
      const normalizedLoanBow = sanitizeLoanBow(loanBow);
      const normalizedGoldenRecordsId = String(goldenRecordsId ?? "").trim();
      const inferredMembershipStatus = inferMembershipStatus(
        membershipStatus ?? existingUser?.membership_status,
        userType ?? existingUser?.user_type,
      );
      const inferredProgrammeType = inferProgrammeType(
        programmeType ?? existingUser?.programme_type,
        userType ?? existingUser?.user_type,
      );
      const {
        membershipStatus: normalizedMembershipStatus,
        programmeType: normalizedProgrammeType,
      } = normalizeMembershipClassification({
        membershipStatus: inferredMembershipStatus,
        programmeType: inferredProgrammeType,
      });

      if (!trimmedUsername || !trimmedFirstName || !trimmedSurname) {
        return {
          success: false,
          status: 400,
          message: "Username, first name, and surname are required.",
        };
      }

      if (!(await memberProfileGateway.roleExists(userType))) {
        return {
          success: false,
          status: 400,
          message: "Please choose a valid member role.",
        };
      }

      if (!existingUser && !trimmedPassword) {
        return {
          success: false,
          status: 400,
          message: "A password is required when creating a new member.",
        };
      }

      const passwordToSave = trimmedPassword
        ? hashPassword(trimmedPassword)
        : existingUser?.password || null;
      const provisionalUser = normalizeMemberStatusWithFees(
        {
          username: existingUser?.username ?? trimmedUsername,
          rfid_tag: trimmedRfidTag || null,
          active_member: normalizedActiveMember ? 1 : 0,
          affiliate_member: normalizedAffiliateMember ? 1 : 0,
          junior_member: normalizedJuniorMember ? 1 : 0,
          membership_fees_due: normalizedMembershipFeesDue,
          coaching_volunteer: normalizedCoachingVolunteer ? 1 : 0,
        },
        { deactivatedRfidSuffix },
      );

      const { requiresMembershipStatusSync: _ignored, ...normalizedUser } = provisionalUser;
      const userPayload = {
        username: normalizedUser.username,
        firstName: trimmedFirstName,
        surname: trimmedSurname,
        goldenRecordsId: normalizedGoldenRecordsId || existingUser?.gr_id || null,
        archeryGbMembershipNumber: trimmedArcheryGbMembershipNumber,
        emailAddress: trimmedEmailAddress,
        password: passwordToSave,
        rfidTag: normalizedUser.rfid_tag,
        activeMember: normalizedUser.active_member,
        affiliateMember: normalizedUser.affiliate_member,
        juniorMember: normalizedUser.junior_member,
        membershipFeesDue: normalizedUser.membership_fees_due,
        coachingVolunteer: normalizedUser.coaching_volunteer,
        membershipStatus: normalizedMembershipStatus,
        programmeType: normalizedProgrammeType,
      };

      try {
        await memberProfileGateway.saveMemberProfile({
          disciplines: normalizedDisciplines,
          loanBow: normalizedLoanBow,
          userPayload,
          userType,
        });

        const savedUser = await memberAuthGateway.findUserByUsername(userPayload.username);
        const savedLoanBow = await memberProfileGateway.findLoanBowByUsername(
          userPayload.username,
        );

        return {
          success: true,
          editableProfile: buildEditableMemberProfile(
            savedUser,
            normalizedDisciplines,
            savedLoanBow,
          ),
          userProfile: buildMemberUserProfile(savedUser, normalizedDisciplines),
        };
      } catch (error) {
        if (
          error?.message?.includes("UNIQUE constraint failed: users.rfid_tag") ||
          error?.message?.includes("duplicate key value violates unique constraint")
        ) {
          return {
            success: false,
            status: 409,
            message: "That RFID tag is already assigned to another member.",
          };
        }

        return {
          success: false,
          status: 500,
          message: "Unable to save the member profile.",
        };
      }
    },
    async syncAllMemberStatusesWithFees() {
      for (const user of await memberAuthGateway.listAllUsers()) {
        await this.syncMemberStatusWithFees(user);
      }
    },
    async syncMemberStatusWithFees(user) {
      const normalizedUser = normalizeMemberStatusWithFees(user, {
        deactivatedRfidSuffix,
      });

      if (normalizedUser?.requiresMembershipStatusSync) {
        await memberAuthGateway.updateUserMembershipStatus(
          normalizedUser.username,
          normalizedUser.active_member,
          normalizedUser.rfid_tag,
        );
      }

      if (!normalizedUser) {
        return normalizedUser;
      }

      const {
        requiresMembershipStatusSync: _requiresMembershipStatusSync,
        ...syncedUser
      } = normalizedUser;

      return syncedUser;
    },
  };
}
