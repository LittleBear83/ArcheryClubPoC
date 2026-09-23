import { createGoldenRecordsHttpClient } from "./goldenRecordsHttpClient.js";

const DEFAULT_CACHE_TTL_MS = 60_000;
const DEFAULT_MEMBER_LIST_CACHE_TTL_MS = 10 * 60_000;
const DEFAULT_PAGE_SIZE = 1000;
const MIN_REQUEST_GAP_MS = 1_100;

function mapGoldenRecordsBowClassToDiscipline(bowClass) {
  switch (String(bowClass ?? "").trim().toLowerCase()) {
    case "recurve":
      return "Recurve Bow";
    case "compound":
      return "Compound Bow";
    case "barebow":
      return "Bare Bow";
    case "longbow":
      return "Long Bow";
    default:
      return "";
  }
}

function normalizeGoldenRecordsHandicapType(value) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized.includes("outdoor")) {
    return "outdoor";
  }

  if (normalized.includes("indoor")) {
    return "indoor";
  }

  return normalized;
}

function normalizeNamePart(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[,.'-]+/g, " ")
    .replace(/\s+/g, " ");
}

function buildCandidateNames({ firstName, surname }) {
  const first = normalizeNamePart(firstName);
  const last = normalizeNamePart(surname);
  return first && last ? [`${first} ${last}`, `${last} ${first}`] : [];
}

function normalizeHandicapRow(row) {
  const bowClass = row?.bow_class ?? "";

  return {
    achieved: row?.achieved ?? "",
    bowClass,
    discipline: mapGoldenRecordsBowClassToDiscipline(bowClass),
    handicap:
      row?.handicap === null || row?.handicap === undefined ? null : Number(row.handicap),
    memberId: row?.member_id ?? "",
    name: row?.name ?? "",
    type: normalizeGoldenRecordsHandicapType(row?.type),
    updated: row?.updated ?? "",
  };
}

function normalizeAchievementRow(row) {
  const bowClass = row?.bow_class ?? "";

  return {
    raw: row,
    derived: false,
    achieved: row?.achieved ?? "",
    achievement: row?.achievement ?? "",
    achievementId: row?.achievement_id ?? "",
    ageGroup: row?.age_group ?? "",
    bowClass,
    discipline: mapGoldenRecordsBowClassToDiscipline(bowClass),
    memberId: row?.member_id ?? "",
    name: row?.name ?? "",
    round: row?.round ?? "",
  };
}

function normalizeClassificationRow(row) {
  const bowClass = row?.bow_class ?? "";

  return {
    achieved: row?.achieved ?? "",
    ageGroup: row?.age_group ?? "",
    bowClass,
    classification: row?.classification ?? "",
    classificationId: row?.classification_id ?? "",
    discipline: mapGoldenRecordsBowClassToDiscipline(bowClass),
    memberId: row?.member_id ?? "",
    name: row?.name ?? "",
    type: row?.type ?? "",
    updated: row?.updated ?? "",
  };
}

function normalizeMemberRow(row) {
  return {
    memberArchived: [true, 1, "true", "1"].includes(row?.member_archived),
    email: String(row?.email ?? row?.email_address ?? "").trim().toLowerCase(),
    memberId: row?.member_id ?? "",
    membershipId: String(row?.membership_id ?? "").trim(),
    name: row?.name ?? "",
  };
}

function tokenizeNormalizedName(value) {
  return normalizeNamePart(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function scoreSuggestedMemberMatch(row, { firstName, surname, archeryGbMembershipNumber }) {
  const normalizedFirstName = normalizeNamePart(firstName);
  const normalizedSurname = normalizeNamePart(surname);
  const normalizedName = normalizeNamePart(row?.name);
  const nameTokens = tokenizeNormalizedName(row?.name);
  let score = 0;

  if (!normalizedFirstName && !normalizedSurname) {
    return 0;
  }

  if (normalizedName === `${normalizedSurname} ${normalizedFirstName}`) {
    score += 140;
  }

  if (normalizedName === `${normalizedFirstName} ${normalizedSurname}`) {
    score += 140;
  }

  if (normalizedSurname) {
    if (nameTokens.includes(normalizedSurname)) {
      score += 80;
    } else if (
      nameTokens.some(
        (token) => token.startsWith(normalizedSurname) || normalizedSurname.startsWith(token),
      )
    ) {
      score += 35;
    }
  }

  if (normalizedFirstName) {
    if (nameTokens.includes(normalizedFirstName)) {
      score += 60;
    } else if (
      nameTokens.some(
        (token) => token.startsWith(normalizedFirstName) || normalizedFirstName.startsWith(token),
      )
    ) {
      score += 25;
    }
  }

  const trimmedMembershipNumber = String(archeryGbMembershipNumber ?? "").trim();

  if (trimmedMembershipNumber && String(row?.membershipId ?? "").trim() === trimmedMembershipNumber) {
    score += 120;
  }

  if (!row?.memberArchived) {
    score += 5;
  }

  return score;
}

function toCandidateMatch(row) {
  return {
    memberArchived: Boolean(row?.memberArchived),
    memberId: row?.memberId ?? "",
    membershipId: String(row?.membershipId ?? "").trim(),
    name: row?.name ?? "",
  };
}

function buildCandidateMatches(rows, criteria) {
  return rows
    .map((row) => ({
      row,
      score: scoreSuggestedMemberMatch(row, criteria),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (left.row.memberArchived !== right.row.memberArchived) {
        return left.row.memberArchived ? 1 : -1;
      }

      return String(left.row.name ?? "").localeCompare(String(right.row.name ?? ""));
    })
    .slice(0, 3)
    .map((entry) => toCandidateMatch(entry.row));
}

function createDisabledSnapshot() {
  return {
    achievements: [],
    candidateMatches: [],
    classifications: [],
    enabled: false,
    fetchedAt: "",
    handicaps: [],
    matchedMemberId: "",
    matchedMemberName: "",
    matchSource: "disabled",
  };
}

export function createGoldenRecordsCurrentHandicapService({
  baseUrl,
  authMode,
  apiKey,
  password,
  timeoutMs = 15_000,
  ttlMs = DEFAULT_CACHE_TTL_MS,
  userAgent,
  username,
  logger = console,
} = {}) {
  const trimmedBaseUrl = String(baseUrl ?? "").trim();
  const trimmedAuthMode = String(authMode ?? "").trim().toLowerCase();
  const hasApiKey = Boolean(String(apiKey ?? "").trim());
  const hasMemberCredentials =
    Boolean(String(username ?? "").trim()) && Boolean(String(password ?? ""));
  const isEnabled =
    Boolean(trimmedBaseUrl) &&
    ((trimmedAuthMode === "member-credentials" && hasMemberCredentials) ||
      (trimmedAuthMode !== "member-credentials" && hasApiKey));

  if (!isEnabled) {
    return {
      isEnabled: false,
      async getSnapshotForMember() {
        return createDisabledSnapshot();
      },
    };
  }

  const client = createGoldenRecordsHttpClient({
    apiKey,
    authMode,
    baseUrl: trimmedBaseUrl,
    password,
    timeoutMs,
    userAgent,
    username,
  });
  const cache = new Map();
  let membersCache = {
    expiresAt: 0,
    rows: [],
  };
  let lastRequestAt = 0;

  async function waitForQuotaWindow() {
    const elapsedMs = Date.now() - lastRequestAt;

    if (elapsedMs < MIN_REQUEST_GAP_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_GAP_MS - elapsedMs));
    }

    lastRequestAt = Date.now();
  }

  async function listMembers() {
    if (membersCache.expiresAt > Date.now()) return membersCache.rows;
    const rows = await listPagedRows("/api/members", {}, (status) => "Golden Records returned " + status + " while loading members.");
    membersCache = { expiresAt: Date.now() + DEFAULT_MEMBER_LIST_CACHE_TTL_MS, rows };
    return rows;
  }

  async function listPagedRows(path, query, buildErrorMessage) {
    const rows = [];

    for (let pageNumber = 1; ; pageNumber += 1) {
      await waitForQuotaWindow();
      const result = await client.getJson(path, {
        ...query,
        pageNumber,
        pageSize: DEFAULT_PAGE_SIZE,
      });

      if (!result.ok) {
        throw new Error(buildErrorMessage(result.status));
      }

      if (!Array.isArray(result.body)) throw new Error("Invalid Golden Records page response.");
      const pageRows = result.body;

      if (pageRows.length === 0) {
        break;
      }

      rows.push(...pageRows);

      if (pageRows.length < DEFAULT_PAGE_SIZE) {
        break;
      }
    }

    return rows;
  }

  async function getCurrentHandicapsByMemberId(memberId) {
    const rows = await listPagedRows(
      "/api/currenthandicaps",
      { id: memberId },
      (status) =>
        `Golden Records returned ${status} while loading current handicaps.`,
    );

    return rows.map(normalizeHandicapRow);
  }

  async function getAchievementsByMemberId(memberId) {
    const achievementRows = await listPagedRows(
      "/api/achievements",
      { filter_id: memberId },
      (status) =>
        `Golden Records returned ${status} while loading achievements.`,
    );

    return achievementRows
      .map(normalizeAchievementRow)
      .filter((entry) => String(entry.memberId) === String(memberId))
      .sort((left, right) => right.achieved.localeCompare(left.achieved));
  }

  async function getCurrentClassificationsByMemberId(memberId) {
    const rows = await listPagedRows(
      "/api/currentclassifications",
      { id: memberId },
      (status) =>
        `Golden Records returned ${status} while loading current classifications.`,
    );

    return rows
      .map(normalizeClassificationRow)
      .filter((entry) => String(entry.memberId) === String(memberId))
      .sort((left, right) => right.achieved.localeCompare(left.achieved));
  }

  async function buildSnapshotFromMemberId({
    fallbackName,
    matchSource,
    memberId,
    clubData,
  }) {
    const fetchedAt = new Date().toISOString();
    const handicapRows = await getCurrentHandicapsByMemberId(memberId);
    const rawAchievements = clubData?.achievementsByMember.get(String(memberId)) ?? (clubData ? [] : undefined);
    const achievementRows = rawAchievements ? rawAchievements.map(normalizeAchievementRow) : await getAchievementsByMemberId(memberId);
    const classificationRows = await getCurrentClassificationsByMemberId(memberId);
    const handicaps = handicapRows.sort((left, right) => {
      const byType = left.type.localeCompare(right.type);

      if (byType !== 0) {
        return byType;
      }

      return left.bowClass.localeCompare(right.bowClass);
    });
    const matchedMemberName =
      handicaps[0]?.name ??
      achievementRows[0]?.name ??
      classificationRows[0]?.name ??
      fallbackName;

    return {
      rawAchievements: rawAchievements ?? achievementRows.map((row) => row.raw),
      achievements: achievementRows,
      candidateMatches: [],
      classifications: classificationRows,
      enabled: true,
      fetchedAt,
      handicaps,
      matchedMemberId: memberId,
      matchedMemberName,
      matchSource,
    };
  }

  async function getSnapshotForMember({
    archeryGbMembershipNumber,
    email,
    clubData,
    firstName,
    goldenRecordsId,
    surname,
    username,
  }) {
    const cacheKey = JSON.stringify({
      email: String(email ?? "").trim().toLowerCase(),
      archeryGbMembershipNumber: String(archeryGbMembershipNumber ?? "").trim(),
      firstName: String(firstName ?? "").trim().toLowerCase(),
      goldenRecordsId: String(goldenRecordsId ?? "").trim(),
      surname: String(surname ?? "").trim().toLowerCase(),
      username: String(username ?? "").trim().toLowerCase(),
    });
    const cachedSnapshot = cache.get(cacheKey);

    if (!clubData && cachedSnapshot && cachedSnapshot.expiresAt > Date.now()) {
      return cachedSnapshot.value;
    }

    try {
      const trimmedGoldenRecordsId = String(goldenRecordsId ?? "").trim();
      const trimmedMembershipNumber = String(archeryGbMembershipNumber ?? "").trim();

      const allMembers = (clubData?.members ?? (await listMembers()).map(normalizeMemberRow)).filter((row) => !row.memberArchived);
      const idMatches = trimmedGoldenRecordsId ? allMembers.filter((row) => String(row.memberId) === trimmedGoldenRecordsId) : [];
      const membershipMatches = trimmedMembershipNumber ? allMembers.filter((row) => row.membershipId === trimmedMembershipNumber) : [];
      const normalizedEmail = String(email ?? "").trim().toLowerCase();
      const emailMatches = normalizedEmail ? allMembers.filter((row) => row.email === normalizedEmail) : [];
      const candidateNames = buildCandidateNames({ firstName, surname });
      const nameMatches = candidateNames.length
        ? allMembers.filter((row) => candidateNames.includes(normalizeNamePart(row.name)))
        : [];
      const matchedMembers = trimmedGoldenRecordsId
        ? idMatches
        : membershipMatches.length
          ? membershipMatches
          : emailMatches.length
            ? emailMatches
            : nameMatches;
      const candidateMatches = buildCandidateMatches(allMembers, {
        archeryGbMembershipNumber,
        firstName,
        surname,
      });

      let snapshot = {
        achievements: [],
        candidateMatches,
        classifications: [],
        enabled: true,
        fetchedAt: new Date().toISOString(),
        handicaps: [],
        matchedMemberId: "",
        matchedMemberName: "",
        matchSource: "not-found",
      };

      if (matchedMembers.length === 1 && clubData?.portalMembers) {
        const member = matchedMembers[0];
        const rank = idMatches.length ? 4 : membershipMatches.length ? 3 : emailMatches.length ? 2 : 1;
        const conflict = clubData.portalMembers.some((user) => {
          if (user.username === username) return false;
          const id = String(user.golden_records_member_id ?? user.gr_id ?? "").trim();
          const agb = String(user.archery_gb_membership_number ?? "").trim();
          const otherEmail = String(user.email ?? user.email_address ?? "").trim().toLowerCase();
          const otherNames = buildCandidateNames({ firstName: user.first_name, surname: user.surname });
          const otherRank = id === String(member.memberId)
            ? 4
            : agb && agb === member.membershipId
              ? 3
              : otherEmail && otherEmail === member.email
                ? 2
                : otherNames.includes(normalizeNamePart(member.name))
                  ? 1
                  : 0;
          return otherRank >= rank;
        });
        if (conflict) return { ...snapshot, matchSource: "ambiguous" };
      }
      if (matchedMembers.length === 1) {
        const matchedMember = matchedMembers[0];
        snapshot = await buildSnapshotFromMemberId({
          fallbackName: matchedMember.name,
          matchSource: idMatches.length
            ? "gr-id"
            : membershipMatches.length
              ? "membership-id"
              : emailMatches.length
                ? "email"
                : "name",
          clubData,
          memberId: matchedMember.memberId,
        });
      } else if (matchedMembers.length > 1) {
        snapshot = {
          achievements: [],
          candidateMatches: matchedMembers.slice(0, 3).map(toCandidateMatch),
          classifications: [],
          enabled: true,
          fetchedAt: new Date().toISOString(),
          handicaps: [],
          matchedMemberId: "",
          matchedMemberName: "",
          matchSource: "ambiguous",
        };
      }

      cache.set(cacheKey, {
        expiresAt: Date.now() + ttlMs,
        value: snapshot,
      });

      return snapshot;
    } catch (error) {
      logger.error?.("Golden Records API error", { error: error.message });
      const message =
        error instanceof Error ? error.message : "Golden Records could not be loaded.";

      return {
        achievements: [],
        candidateMatches: [],
        classifications: [],
        enabled: true,
        error:
          message.includes("while loading members")
            ? "Golden Records is temporarily unavailable while loading members. Please try again shortly."
            : message,
        fetchedAt: new Date().toISOString(),
        handicaps: [],
        matchedMemberId: "",
        matchedMemberName: "",
        matchSource: "error",
      };
    }
  }

  return {
    isEnabled: true,
    getSnapshotForMember,
    async fetchClubData() {
      try {
        const members = (await listPagedRows("/api/members", {}, (status) => "Golden Records members API returned " + status)).map(normalizeMemberRow);
        const achievements = await listPagedRows("/api/Achievements", {}, (status) => "Golden Records achievements API returned " + status);
        const achievementsByMember = new Map();
        for (const row of achievements) {
          const key = String(row.member_id ?? "");
          const rows = achievementsByMember.get(key) ?? [];
          rows.push(row);
          achievementsByMember.set(key, rows);
        }
        logger.info?.("Golden Records club data fetched", { members: members.length, activeMembers: members.filter((row) => !row.memberArchived).length, achievements: achievements.length });
        return { members, achievementsByMember };
      } catch (error) {
        logger.error?.("Golden Records club API error", { error: error.message });
        throw error;
      }
    },
  };
}
