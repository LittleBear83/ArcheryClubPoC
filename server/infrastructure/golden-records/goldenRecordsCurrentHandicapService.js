import { createGoldenRecordsHttpClient } from "./goldenRecordsHttpClient.js";

const DEFAULT_CACHE_TTL_MS = 60_000;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 20;
const MIN_REQUEST_GAP_MS = 1_100;

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
  return {
    achieved: row?.achieved ?? "",
    bowClass: row?.bow_class ?? "",
    handicap:
      row?.handicap === null || row?.handicap === undefined ? null : Number(row.handicap),
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

function createDisabledSnapshot() {
  return {
    enabled: false,
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
  let lastRequestAt = 0;

  async function waitForQuotaWindow() {
    const elapsedMs = Date.now() - lastRequestAt;

    if (elapsedMs < MIN_REQUEST_GAP_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_GAP_MS - elapsedMs));
    }

    lastRequestAt = Date.now();
  }

  async function listMembers() {
    const rows = [];

    for (let pageNumber = 1; pageNumber <= DEFAULT_MAX_PAGES; pageNumber += 1) {
      await waitForQuotaWindow();
      const result = await client.getJson("/api/members", {
        pageNumber,
        pageSize: DEFAULT_PAGE_SIZE,
      });

      if (!result.ok) {
        throw new Error(
          `Golden Records returned ${result.status} while loading members.`,
        );
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
    await waitForQuotaWindow();
    const result = await client.getJson("/api/currenthandicaps", {
      id: memberId,
      pageNumber: 1,
      pageSize: 20,
    });

    if (!result.ok) {
      throw new Error(
        `Golden Records returned ${result.status} while loading current handicaps.`,
      );
    }

    return (Array.isArray(result.body) ? result.body : []).map(normalizeHandicapRow);
  }

  async function getSnapshotForMember({ archeryGbMembershipNumber, firstName, surname, username }) {
    const cacheKey = JSON.stringify({
      archeryGbMembershipNumber: String(archeryGbMembershipNumber ?? "").trim(),
      firstName: String(firstName ?? "").trim().toLowerCase(),
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
      const trimmedMembershipNumber = String(archeryGbMembershipNumber ?? "").trim();
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

      let snapshot = {
        enabled: true,
        handicaps: [],
        matchedMemberId: "",
        matchedMemberName: "",
        matchSource: "not-found",
      };

      if (matchedMembers.length === 1) {
        const matchedMember = matchedMembers[0];
        const memberRows = (await getCurrentHandicapsByMemberId(matchedMember.memberId)).sort(
          (left, right) => {
            const byType = left.type.localeCompare(right.type);

            if (byType !== 0) {
              return byType;
            }

            return left.bowClass.localeCompare(right.bowClass);
          },
        );

        snapshot = {
          enabled: true,
          handicaps: memberRows,
          matchedMemberId: matchedMember.memberId,
          matchedMemberName: matchedMember.name,
          matchSource:
            membershipMatches.length > 0
              ? "membership-id"
              : trimmedMembershipNumber
                ? "name-fallback"
                : "name",
        };
      } else if (matchedMembers.length > 1) {
        snapshot = {
          enabled: true,
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
      return {
        enabled: true,
        error:
          error instanceof Error ? error.message : "Golden Records could not be loaded.",
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
