import { createGoldenRecordsHttpClient } from "./goldenRecordsHttpClient.js";

const DEFAULT_CACHE_TTL_MS = 60_000;
const DEFAULT_MEMBER_LIST_CACHE_TTL_MS = 10 * 60_000;
const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_MAX_PAGES = 100;
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
  const normalizedFirstName = normalizeNamePart(firstName);
  const normalizedSurname = normalizeNamePart(surname);

  if (!normalizedFirstName || !normalizedSurname) {
    return [];
  }

  return [
    `${normalizedSurname} ${normalizedFirstName}`,
    `${normalizedFirstName} ${normalizedSurname}`,
  ];
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
    memberArchived: Boolean(row?.member_archived),
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

  function buildGoldenRecordsErrorMessage(prefix, result) {
    const bodyPreview =
      typeof result?.body === "string"
        ? result.body.trim().slice(0, 300)
        : result?.body
          ? JSON.stringify(result.body).slice(0, 300)
          : "";

    return bodyPreview
      ? `${prefix} Response body: ${bodyPreview}`
      : prefix;
  }

  async function listMembersWithPageSize(pageSize) {
    if (membersCache.rows.length > 0 && membersCache.expiresAt > Date.now()) {
      return membersCache.rows;
    }

    const rows = [];

    try {
      for (let pageNumber = 1; pageNumber <= DEFAULT_MAX_PAGES; pageNumber += 1) {
        await waitForQuotaWindow();
        const result = await client.getJson("/api/members", {
          pageNumber,
          pageSize,
        });

        if (!result.ok) {
          throw new Error(
            buildGoldenRecordsErrorMessage(
              `Golden Records returned ${result.status} while loading members with page size ${pageSize}.`,
              result,
            ),
          );
        }

        const pageRows = Array.isArray(result.body) ? result.body : [];

        if (pageRows.length === 0) {
          break;
        }

        rows.push(...pageRows);

        if (pageRows.length < pageSize) {
          break;
        }
      }

      membersCache = {
        expiresAt: Date.now() + DEFAULT_MEMBER_LIST_CACHE_TTL_MS,
        rows,
      };

      return rows;
    } catch (error) {
      if (membersCache.rows.length > 0) {
        return membersCache.rows;
      }

      throw error;
    }
  }

  async function listMembers() {
    return listMembersWithPageSize(DEFAULT_PAGE_SIZE);
  }

  async function listPagedRows(path, query, buildErrorMessage) {
    const rows = [];

    for (let pageNumber = 1; pageNumber <= DEFAULT_MAX_PAGES; pageNumber += 1) {
      await waitForQuotaWindow();
      const result = await client.getJson(path, {
        ...query,
        pageNumber,
        pageSize: DEFAULT_PAGE_SIZE,
      });

      if (!result.ok) {
        throw new Error(buildErrorMessage(result.status));
      }

      const pageRows = Array.isArray(result.body) ? result.body : [];

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
      .filter((entry) => entry.memberId === memberId)
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
      .filter((entry) => entry.memberId === memberId)
      .sort((left, right) => right.achieved.localeCompare(left.achieved));
  }

  async function buildSnapshotFromMemberId({
    fallbackName,
    matchSource,
    memberId,
  }) {
    const fetchedAt = new Date().toISOString();
    const handicapRows = await getCurrentHandicapsByMemberId(memberId);
    const achievementRows = await getAchievementsByMemberId(memberId);
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
    firstName,
    goldenRecordsId,
    surname,
    username,
  }) {
    const cacheKey = JSON.stringify({
      archeryGbMembershipNumber: String(archeryGbMembershipNumber ?? "").trim(),
      firstName: String(firstName ?? "").trim().toLowerCase(),
      goldenRecordsId: String(goldenRecordsId ?? "").trim(),
      surname: String(surname ?? "").trim().toLowerCase(),
      username: String(username ?? "").trim().toLowerCase(),
    });
    const cachedSnapshot = cache.get(cacheKey);

    if (cachedSnapshot && cachedSnapshot.expiresAt > Date.now()) {
      return cachedSnapshot.value;
    }

    const candidateNames = buildCandidateNames({ firstName, surname });

    if (candidateNames.length === 0) {
      return createDisabledSnapshot();
    }

    try {
      const trimmedGoldenRecordsId = String(goldenRecordsId ?? "").trim();
      const trimmedMembershipNumber = String(archeryGbMembershipNumber ?? "").trim();

      if (trimmedGoldenRecordsId) {
        const snapshot = await buildSnapshotFromMemberId({
          fallbackName: `${String(firstName ?? "").trim()} ${String(surname ?? "").trim()}`.trim(),
          matchSource: "gr-id",
          memberId: trimmedGoldenRecordsId,
        });

        cache.set(cacheKey, {
          expiresAt: Date.now() + ttlMs,
          value: snapshot,
        });

        return snapshot;
      }

      const allMembers = (await listMembers()).map(normalizeMemberRow);
      const nameMatches = allMembers.filter((row) =>
        candidateNames.includes(normalizeNamePart(row.name)),
      );
      const membershipMatches = trimmedMembershipNumber
        ? allMembers.filter((row) => row.membershipId === trimmedMembershipNumber)
        : [];
      const exactMatches =
        membershipMatches.length > 0 ? membershipMatches : nameMatches.filter((row) => !row.memberArchived);
      const fallbackMatches =
        membershipMatches.length > 0 ? membershipMatches : nameMatches;
      const matchedMembers = exactMatches.length > 0 ? exactMatches : fallbackMatches;
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

      if (matchedMembers.length === 1) {
        const matchedMember = matchedMembers[0];
        snapshot = await buildSnapshotFromMemberId({
          fallbackName: matchedMember.name,
          matchSource:
            membershipMatches.length > 0
              ? "membership-id"
              : trimmedMembershipNumber
                ? "name-fallback"
                : "name",
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
  };
}
