import { readFileSync } from "node:fs";

const handicapTablesSource = JSON.parse(
  readFileSync(new URL("../../../shared/handicapTablesSource.json", import.meta.url), "utf-8"),
);

function flattenSourceTables() {
  return handicapTablesSource.families.flatMap((family) =>
    family.tables.map((table, tableIndex) => ({
      allowancePercent: null,
      description: family.description,
      displayOrder: table.displayOrder ?? tableIndex,
      isEditable: 0,
      rows: table.rows,
      tableKey: table.tableKey,
      title: table.title,
    })),
  );
}

const sourceTables = flattenSourceTables();

function rowsEqual(existingRows, sourceRows) {
  if (existingRows.length !== sourceRows.length) {
    return false;
  }

  return existingRows.every((row, index) => {
    const sourceRow = sourceRows[index];
    return (
      row.handicapValue === sourceRow.handicapValue &&
      row.referenceScore === sourceRow.referenceScore &&
      row.displayOrder === index
    );
  });
}

function buildFamilyResponse({ metadataByTableKey, rowsByTableKey }) {
  return handicapTablesSource.families.map((family, familyIndex) => ({
    familyKey: family.familyKey,
    familyTitle: family.familyTitle,
    description: family.description,
    displayOrder: familyIndex,
    tables: family.tables
      .map((table, tableIndex) => {
        const metadata = metadataByTableKey.get(table.tableKey);
        if (!metadata) {
          return null;
        }

        return {
          tableKey: table.tableKey,
          title: metadata.title,
          description: metadata.description,
          allowancePercent: metadata.allowancePercent,
          isEditable: Boolean(metadata.isEditable),
          displayOrder: table.displayOrder ?? tableIndex,
          updatedAtDate: metadata.updatedAtDate,
          updatedAtTime: metadata.updatedAtTime,
          updatedByUsername: metadata.updatedByUsername,
          rows: rowsByTableKey.get(table.tableKey) ?? [],
        };
      })
      .filter(Boolean),
  }));
}

function normalizeMetadataRow(row) {
  return {
    allowancePercent: row.allowance_percent ?? null,
    description: row.description ?? "",
    isEditable: row.is_editable ?? 0,
    tableId: row.id,
    tableKey: row.table_key,
    title: row.title,
    updatedAtDate: row.updated_at_date ?? "",
    updatedAtTime: row.updated_at_time ?? "",
    updatedByUsername: row.updated_by_username ?? "",
  };
}

function normalizeRow(row) {
  return {
    handicapValue: row.handicap_value,
    referenceScore: row.reference_score,
    displayOrder: row.display_order ?? 0,
  };
}

function createSqliteHandicapTableGateway(db) {
  const listTables = db.prepare(`
    SELECT
      id,
      table_key,
      title,
      description,
      allowance_percent,
      is_editable,
      updated_at_date,
      updated_at_time,
      updated_by_username
    FROM tournament_handicap_tables
  `);
  const listRows = db.prepare(`
    SELECT
      table_id,
      handicap_value,
      reference_score,
      display_order
    FROM tournament_handicap_table_rows
    ORDER BY table_id, display_order, handicap_value
  `);
  const upsertTable = db.prepare(`
    INSERT INTO tournament_handicap_tables (
      table_key,
      title,
      description,
      allowance_percent,
      is_editable,
      updated_at_date,
      updated_at_time,
      updated_by_username
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(table_key) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      allowance_percent = excluded.allowance_percent,
      is_editable = excluded.is_editable,
      updated_at_date = excluded.updated_at_date,
      updated_at_time = excluded.updated_at_time,
      updated_by_username = excluded.updated_by_username
  `);
  const findTableByKey = db.prepare(`
    SELECT
      id,
      table_key,
      title,
      description,
      allowance_percent,
      is_editable,
      updated_at_date,
      updated_at_time,
      updated_by_username
    FROM tournament_handicap_tables
    WHERE table_key = ?
  `);
  const deleteRowsByTableId = db.prepare(`
    DELETE FROM tournament_handicap_table_rows
    WHERE table_id = ?
  `);
  const insertRow = db.prepare(`
    INSERT INTO tournament_handicap_table_rows (
      table_id,
      handicap_value,
      reference_score,
      display_order
    )
    VALUES (?, ?, ?, ?)
  `);

  const readSnapshot = () => {
    const metadataRows = listTables.all().map(normalizeMetadataRow);
    const rows = listRows.all();
    const tableKeyById = new Map(metadataRows.map((row) => [row.tableId, row.tableKey]));
    const metadataByTableKey = new Map(metadataRows.map((row) => [row.tableKey, row]));
    const rowsByTableKey = new Map();

    for (const row of rows) {
      const tableKey = tableKeyById.get(row.table_id);
      if (!tableKey) {
        continue;
      }

      const normalized = normalizeRow(row);
      const currentRows = rowsByTableKey.get(tableKey) ?? [];
      currentRows.push(normalized);
      rowsByTableKey.set(tableKey, currentRows);
    }

    return { metadataByTableKey, rowsByTableKey };
  };

  const syncTransaction = db.transaction((payload) => {
    const { metadataByTableKey, rowsByTableKey } = readSnapshot();
    let updatedTables = 0;

    for (const sourceTable of sourceTables) {
      const existingMetadata = metadataByTableKey.get(sourceTable.tableKey);
      const existingRows = rowsByTableKey.get(sourceTable.tableKey) ?? [];
      const sourceRows = sourceTable.rows.map((row, index) => ({
        handicapValue: row.handicapValue,
        referenceScore: row.referenceScore,
        displayOrder: index,
      }));
      const isUnchanged =
        existingMetadata &&
        existingMetadata.title === sourceTable.title &&
        existingMetadata.description === sourceTable.description &&
        existingMetadata.allowancePercent === sourceTable.allowancePercent &&
        existingMetadata.isEditable === sourceTable.isEditable &&
        rowsEqual(existingRows, sourceRows);

      if (isUnchanged) {
        continue;
      }

      upsertTable.run(
        sourceTable.tableKey,
        sourceTable.title,
        sourceTable.description,
        sourceTable.allowancePercent,
        sourceTable.isEditable,
        payload.updatedAtDate,
        payload.updatedAtTime,
        payload.updatedByUsername,
      );
      const syncedTable = findTableByKey.get(sourceTable.tableKey);
      deleteRowsByTableId.run(syncedTable.id);

      for (const [rowIndex, row] of sourceTable.rows.entries()) {
        insertRow.run(syncedTable.id, row.handicapValue, row.referenceScore, rowIndex);
      }

      updatedTables += 1;
    }

    return { updatedTables };
  });

  return {
    async listHandicapTables() {
      const snapshot = readSnapshot();
      return {
        families: buildFamilyResponse(snapshot),
        sourceDocument: handicapTablesSource.sourceDocument,
        sourceRevision: handicapTablesSource.sourceRevision,
        sourceTitle: handicapTablesSource.sourceTitle,
      };
    },
    async syncSourceTables(payload) {
      const result = syncTransaction(payload);
      return {
        sourceDocument: handicapTablesSource.sourceDocument,
        sourceRevision: handicapTablesSource.sourceRevision,
        updatedTables: result.updatedTables,
      };
    },
  };
}

async function runPostgresTransaction(pool, callback) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function createPostgresHandicapTableGateway(pool) {
  const readSnapshot = async (client = pool) => {
    const metadataResult = await client.query(`
      SELECT
        id,
        table_key,
        title,
        description,
        allowance_percent,
        is_editable,
        updated_at_date,
        updated_at_time,
        updated_by_username
      FROM tournament_handicap_tables
    `);
    const rowsResult = await client.query(`
      SELECT
        table_id,
        handicap_value,
        reference_score,
        display_order
      FROM tournament_handicap_table_rows
      ORDER BY table_id, display_order, handicap_value
    `);
    const metadataRows = metadataResult.rows.map(normalizeMetadataRow);
    const tableKeyById = new Map(metadataRows.map((row) => [Number(row.tableId), row.tableKey]));
    const metadataByTableKey = new Map(metadataRows.map((row) => [row.tableKey, row]));
    const rowsByTableKey = new Map();

    for (const row of rowsResult.rows) {
      const tableKey = tableKeyById.get(Number(row.table_id));
      if (!tableKey) {
        continue;
      }

      const normalized = normalizeRow(row);
      const currentRows = rowsByTableKey.get(tableKey) ?? [];
      currentRows.push(normalized);
      rowsByTableKey.set(tableKey, currentRows);
    }

    return { metadataByTableKey, rowsByTableKey };
  };

  return {
    async listHandicapTables() {
      const snapshot = await readSnapshot();
      return {
        families: buildFamilyResponse(snapshot),
        sourceDocument: handicapTablesSource.sourceDocument,
        sourceRevision: handicapTablesSource.sourceRevision,
        sourceTitle: handicapTablesSource.sourceTitle,
      };
    },
    async syncSourceTables(payload) {
      return runPostgresTransaction(pool, async (client) => {
        const { metadataByTableKey, rowsByTableKey } = await readSnapshot(client);
        let updatedTables = 0;

        for (const sourceTable of sourceTables) {
          const existingMetadata = metadataByTableKey.get(sourceTable.tableKey);
          const existingRows = rowsByTableKey.get(sourceTable.tableKey) ?? [];
          const sourceRows = sourceTable.rows.map((row, index) => ({
            handicapValue: row.handicapValue,
            referenceScore: row.referenceScore,
            displayOrder: index,
          }));
          const isUnchanged =
            existingMetadata &&
            existingMetadata.title === sourceTable.title &&
            existingMetadata.description === sourceTable.description &&
            existingMetadata.allowancePercent === sourceTable.allowancePercent &&
            existingMetadata.isEditable === sourceTable.isEditable &&
            rowsEqual(existingRows, sourceRows);

          if (isUnchanged) {
            continue;
          }

          const upsertResult = await client.query(
            `
              INSERT INTO tournament_handicap_tables (
                table_key,
                title,
                description,
                allowance_percent,
                is_editable,
                updated_at_date,
                updated_at_time,
                updated_by_username
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              ON CONFLICT(table_key) DO UPDATE SET
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                allowance_percent = EXCLUDED.allowance_percent,
                is_editable = EXCLUDED.is_editable,
                updated_at_date = EXCLUDED.updated_at_date,
                updated_at_time = EXCLUDED.updated_at_time,
                updated_by_username = EXCLUDED.updated_by_username
              RETURNING id
            `,
            [
              sourceTable.tableKey,
              sourceTable.title,
              sourceTable.description,
              sourceTable.allowancePercent,
              sourceTable.isEditable,
              payload.updatedAtDate,
              payload.updatedAtTime,
              payload.updatedByUsername,
            ],
          );
          const tableId = upsertResult.rows[0]?.id;

          await client.query(
            `
              DELETE FROM tournament_handicap_table_rows
              WHERE table_id = $1
            `,
            [tableId],
          );

          for (const [rowIndex, row] of sourceTable.rows.entries()) {
            await client.query(
              `
                INSERT INTO tournament_handicap_table_rows (
                  table_id,
                  handicap_value,
                  reference_score,
                  display_order
                )
                VALUES ($1, $2, $3, $4)
              `,
              [tableId, row.handicapValue, row.referenceScore, rowIndex],
            );
          }

          updatedTables += 1;
        }

        return {
          sourceDocument: handicapTablesSource.sourceDocument,
          sourceRevision: handicapTablesSource.sourceRevision,
          updatedTables,
        };
      });
    },
  };
}

export function createHandicapTableGateway({ databaseEngine, db, pool }) {
  if (databaseEngine === "postgres") {
    return createPostgresHandicapTableGateway(pool);
  }

  return createSqliteHandicapTableGateway(db);
}
