import { createGoldenRecordsHttpClient } from "./goldenRecordsHttpClient.js";
import { createGoldenRecordsBowDisciplineImportPlan } from "../../domain/services/goldenRecordsBowDisciplineImport.js";

const PAGE_SIZE = 1000;
const MIN_REQUEST_GAP_MS = 1100;

function targetScope(runtime) {
  let databaseName = runtime.postgres.databaseName || "";
  let databaseHost = runtime.postgres.host || "";
  if (runtime.databaseUrl) {
    const url = new URL(runtime.databaseUrl);
    databaseName ||= url.pathname.replace(/^\//u, "");
    databaseHost ||= url.host;
  }
  return {
    appMode: runtime.appMode,
    databaseEngine: runtime.databaseEngine,
    databaseName,
    databaseHost,
    cloudSqlInstance: String(runtime.postgres.socketDirectory ?? "").replace(/^\/cloudsql\//u, ""),
  };
}

export function createGoldenRecordsBowDisciplineImportService({
  pool,
  runtime,
  httpClient = null,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => new Date(),
}) {
  if (runtime.databaseEngine !== "postgres" || !pool) {
    return {
      preview: async () => { throw new Error("Bow discipline import requires the cloud PostgreSQL database."); },
      apply: async () => { throw new Error("Bow discipline import requires the cloud PostgreSQL database."); },
    };
  }

  async function fetchGoldenRecordsMembers() {
    const client = httpClient ?? createGoldenRecordsHttpClient(runtime.goldenRecords);
    const members = [];
    let lastRequestAt = 0;
    for (let pageNumber = 1; ; pageNumber += 1) {
      const gap = MIN_REQUEST_GAP_MS - (Date.now() - lastRequestAt);
      if (gap > 0) await wait(gap);
      lastRequestAt = Date.now();
      const response = await client.getJson("/api/members", { pageNumber, pageSize: PAGE_SIZE });
      if (!response.ok) throw new Error(`Golden Records members request failed (${response.status} ${response.statusText}).`);
      if (!Array.isArray(response.body)) throw new Error("Golden Records members response was not an array; no changes were made.");
      members.push(...response.body);
      if (response.body.length < PAGE_SIZE) break;
    }
    return members;
  }

  async function readActivePortalMembers() {
    const result = await pool.query(`
      SELECT u.username, u.first_name, u.surname, u.gr_id,
        u.archery_gb_membership_number, u.active_member,
        COALESCE(ARRAY_AGG(DISTINCT d.discipline ORDER BY d.discipline)
          FILTER (WHERE d.discipline IS NOT NULL), ARRAY[]::text[]) AS disciplines
      FROM users u
      LEFT JOIN user_disciplines d ON d.username = u.username
      WHERE u.active_member = 1
      GROUP BY u.username, u.first_name, u.surname, u.gr_id,
        u.archery_gb_membership_number, u.active_member
      ORDER BY u.username
    `);
    return result.rows;
  }

  async function preview() {
    const [goldenRecordsMembers, portalMembers] = await Promise.all([
      fetchGoldenRecordsMembers(), readActivePortalMembers(),
    ]);
    const plan = createGoldenRecordsBowDisciplineImportPlan({ goldenRecordsMembers, portalMembers });
    const counts = { add: 0, unchanged: 0, skip: 0 };
    for (const record of plan.records) counts[record.status] += 1;
    return {
      version: 1,
      generatedAt: now().toISOString(),
      target: targetScope(runtime),
      goldenRecordsMemberCount: goldenRecordsMembers.length,
      portalMemberCount: portalMembers.length,
      ...plan,
      counts,
    };
  }

  async function apply({ planHash, actorUsername }) {
    if (!/^[a-f0-9]{64}$/u.test(String(planHash ?? ""))) throw new Error("Preview this import before applying it.");
    const currentPlan = await preview();
    if (planHash !== currentPlan.planHash) {
      throw new Error("Golden Records or portal data changed since the preview. Preview again; no changes were made.");
    }
    const changes = currentPlan.records.filter((record) => record.status === "add");
    if (!changes.length) return { inserted: 0, plan: currentPlan };

    const client = await pool.connect();
    let inserted = 0;
    try {
      await client.query("BEGIN");
      const usernames = changes.map((record) => record.username);
      const locked = await client.query(`
        SELECT username, COALESCE(gr_id, '') AS gr_id,
          COALESCE(archery_gb_membership_number, '') AS archery_gb_membership_number,
          active_member
        FROM users WHERE username = ANY($1::text[]) FOR UPDATE
      `, [usernames]);
      const lockedByUsername = new Map(locked.rows.map((row) => [row.username, row]));
      for (const record of changes) {
        const user = lockedByUsername.get(record.username);
        if (!user || Number(user.active_member) !== 1 ||
            String(user.gr_id ?? "").trim() !== record.portalGoldenRecordsId ||
            String(user.archery_gb_membership_number ?? "").trim() !== record.portalMembershipId) {
          throw new Error(`Portal identity changed for ${record.username}; transaction rolled back.`);
        }
        const disciplinesResult = await client.query(
          "SELECT discipline FROM user_disciplines WHERE username = $1 ORDER BY discipline", [record.username],
        );
        const currentDisciplines = disciplinesResult.rows.map((row) => row.discipline).sort();
        if (JSON.stringify(currentDisciplines) !== JSON.stringify([...record.currentDisciplines].sort())) {
          throw new Error(`Portal disciplines changed for ${record.username}; transaction rolled back.`);
        }
        const result = await client.query(`
          INSERT INTO user_disciplines (username, discipline) VALUES ($1, $2)
          ON CONFLICT (username, discipline) DO NOTHING
        `, [record.username, record.discipline]);
        if (result.rowCount > 0) {
          inserted += 1;
          const timestamp = now().toISOString();
          await client.query(`
            INSERT INTO audit_events (actor_username, action, target, status_code, metadata_json, created_at_date, created_at_time)
            VALUES ($1, $2, $3, 200, $4, $5, $6)
          `, [
            actorUsername,
            "golden_records_bow_discipline_import",
            record.username,
            JSON.stringify({ bowClass: record.bowClass, discipline: record.discipline, goldenRecordsMemberId: record.grMemberId, matchSource: record.matchSource }),
            timestamp.slice(0, 10), timestamp.slice(11, 19),
          ]);
        }
      }
      await client.query("COMMIT");
      return { inserted, plan: currentPlan };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return { preview, apply };
}
