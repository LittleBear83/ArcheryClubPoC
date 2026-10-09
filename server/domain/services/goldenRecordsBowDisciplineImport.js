import { createHash } from "node:crypto";

const BOW_DISCIPLINES = new Map([
  ["recurve", "Recurve Bow"],
  ["compound", "Compound Bow"],
  ["barebow", "Bare Bow"],
  ["longbow", "Long Bow"],
]);

const text = (value) => String(value ?? "").trim();
const norm = (value) => text(value).toLowerCase();
const isTrue = (value) => value === true || Number(value) === 1 || ["true", "t"].includes(norm(value));
const isArchived = isTrue;

export function mapGoldenRecordsBowClassToDiscipline(bowClass) {
  return BOW_DISCIPLINES.get(norm(bowClass)) ?? "";
}

function indexRows(rows, keyFn) {
  const index = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const group = index.get(key) ?? [];
    group.push(row);
    index.set(key, group);
  }
  return index;
}

function sortedDisciplines(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function resolveMatch(portalMember, goldenRecordsMembers, byId, byMembership) {
  const grId = text(portalMember.gr_id ?? portalMember.golden_records_member_id);
  const membershipId = text(portalMember.archery_gb_membership_number);
  const idMatches = grId ? byId.get(grId) ?? [] : [];
  const membershipMatches = membershipId ? byMembership.get(membershipId) ?? [] : [];

  if (idMatches.length > 1) return { reason: "Golden Records ID is duplicated", status: "skip" };
  if (membershipMatches.length > 1) return { reason: "Membership number is duplicated in Golden Records", status: "skip" };

  if (idMatches.length === 1) {
    const byIdMember = idMatches[0];
    if (membershipMatches.length === 1 && membershipMatches[0].member_id !== byIdMember.member_id) {
      return { reason: "Golden Records ID and membership number point to different people", status: "skip" };
    }
    return { member: byIdMember, matchSource: "golden-records-id" };
  }

  if (membershipMatches.length === 1) {
    return { member: membershipMatches[0], matchSource: "membership-number" };
  }

  const archivedMatch = goldenRecordsMembers.some((member) =>
    (grId && text(member.member_id) === grId) ||
    (membershipId && text(member.membership_id) === membershipId && isArchived(member.member_archived))
  );
  return archivedMatch
    ? { reason: "Golden Records record is archived", status: "skip" }
    : { reason: "No exact Golden Records ID or membership-number match", status: "skip" };
}

export function createGoldenRecordsBowDisciplineImportPlan({ goldenRecordsMembers, portalMembers }) {
  if (!Array.isArray(goldenRecordsMembers) || !Array.isArray(portalMembers)) {
    throw new TypeError("Golden Records members and portal members must be arrays.");
  }

  const byId = indexRows(goldenRecordsMembers, (member) => text(member.member_id));
  const byMembership = indexRows(goldenRecordsMembers, (member) => text(member.membership_id));
  const records = portalMembers
    .filter((member) => isTrue(member.active_member))
    .map((portalMember) => {
      const base = {
        username: text(portalMember.username),
        firstName: text(portalMember.first_name),
        surname: text(portalMember.surname),
        portalGoldenRecordsId: text(portalMember.gr_id ?? portalMember.golden_records_member_id),
        portalMembershipId: text(portalMember.archery_gb_membership_number),
        currentDisciplines: sortedDisciplines(portalMember.disciplines),
      };
      const match = resolveMatch(portalMember, goldenRecordsMembers, byId, byMembership);
      if (!match.member) return { ...base, status: match.status, reason: match.reason };

      const member = match.member;
      const discipline = mapGoldenRecordsBowClassToDiscipline(member.bow_class);
      const matched = {
        ...base,
        grMemberId: text(member.member_id),
        grMembershipId: text(member.membership_id),
        grName: text(member.name),
        bowClass: text(member.bow_class),
        discipline,
        matchSource: match.matchSource,
      };
      if (isArchived(member.member_archived)) {
        return { ...matched, status: "skip", reason: "Golden Records record is archived" };
      }
      if (!discipline) {
        return { ...matched, status: "skip", reason: "Bow class is blank or not supported" };
      }
      return {
        ...matched,
        status: matched.currentDisciplines.some((value) => norm(value) === norm(discipline)) ? "unchanged" : "add",
        reason: "",
      };
    });

  const memberUseCounts = new Map();
  for (const record of records) {
    if (record.grMemberId && record.status !== "skip") {
      memberUseCounts.set(record.grMemberId, (memberUseCounts.get(record.grMemberId) ?? 0) + 1);
    }
  }
  const uniqueRecords = records.map((record) =>
    record.grMemberId && memberUseCounts.get(record.grMemberId) > 1
      ? { ...record, status: "skip", reason: "Golden Records member is matched to multiple portal accounts" }
      : record
  ).sort((a, b) => a.username.localeCompare(b.username));

  return { records: uniqueRecords, planHash: hashGoldenRecordsBowDisciplinePlan(uniqueRecords) };
}

export function hashGoldenRecordsBowDisciplinePlan(records) {
  const canonical = [...records]
    .sort((a, b) => text(a.username).localeCompare(text(b.username)))
    .map((record) => ({
      username: text(record.username),
      portalGoldenRecordsId: text(record.portalGoldenRecordsId),
      portalMembershipId: text(record.portalMembershipId),
      grMemberId: text(record.grMemberId),
      grMembershipId: text(record.grMembershipId),
      bowClass: text(record.bowClass),
      discipline: text(record.discipline),
      currentDisciplines: sortedDisciplines(record.currentDisciplines),
      status: text(record.status),
      reason: text(record.reason),
    }));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
