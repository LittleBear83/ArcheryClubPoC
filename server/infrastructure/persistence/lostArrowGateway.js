function normalizeLostArrowRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    archerUsername: row.archer_username,
    archerName: row.archer_name ?? "",
    dateLost: row.date_lost,
    arrowMaterial: row.arrow_material,
    arrowColour: row.arrow_colour,
    arrowIdentifier: row.arrow_identifier,
    fletchingColour1: row.fletching_colour_1,
    fletchingColour2: row.fletching_colour_2,
    fletchingColour3: row.fletching_colour_3 ?? "",
    nockColour: row.nock_colour,
    targetDistance: row.target_distance,
    laneNumber: Number(row.lane_number),
    otherDetails: row.other_details ?? "",
    dateFound: row.date_found ?? "",
    foundByUsername: row.found_by_username ?? "",
    foundByName: row.found_by_name ?? "",
    foundCollectionLocation: row.found_collection_location ?? "",
    createdAtDate: row.created_at_date,
    createdAtTime: row.created_at_time,
  };
}

function createSqliteLostArrowGateway(db) {
  const createLostArrowStatement = db.prepare(`
    INSERT INTO lost_arrows (
      archer_username,
      date_lost,
      arrow_material,
      arrow_colour,
      arrow_identifier,
      fletching_colour_1,
      fletching_colour_2,
      fletching_colour_3,
      nock_colour,
      target_distance,
      lane_number,
      other_details,
      created_at_date,
      created_at_time
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const listOpenLostArrowsStatement = db.prepare(`
    SELECT
      lost_arrows.*,
      owners.first_name || ' ' || owners.surname AS archer_name,
      finders.first_name || ' ' || finders.surname AS found_by_name
    FROM lost_arrows
    INNER JOIN users AS owners ON owners.username = lost_arrows.archer_username
    LEFT JOIN users AS finders ON finders.username = lost_arrows.found_by_username
    WHERE lost_arrows.date_found IS NULL
    ORDER BY lost_arrows.date_lost DESC, lost_arrows.id DESC
  `);
  const listFoundLostArrowsForUserStatement = db.prepare(`
    SELECT
      lost_arrows.*,
      owners.first_name || ' ' || owners.surname AS archer_name,
      finders.first_name || ' ' || finders.surname AS found_by_name
    FROM lost_arrows
    INNER JOIN users AS owners ON owners.username = lost_arrows.archer_username
    LEFT JOIN users AS finders ON finders.username = lost_arrows.found_by_username
    WHERE LOWER(lost_arrows.archer_username) = LOWER(?)
      AND lost_arrows.date_found IS NOT NULL
      AND lost_arrows.found_seen_at_date IS NULL
    ORDER BY lost_arrows.date_found DESC, lost_arrows.id DESC
  `);
  const findLostArrowByIdStatement = db.prepare(`
    SELECT
      lost_arrows.*,
      owners.first_name || ' ' || owners.surname AS archer_name,
      finders.first_name || ' ' || finders.surname AS found_by_name
    FROM lost_arrows
    INNER JOIN users AS owners ON owners.username = lost_arrows.archer_username
    LEFT JOIN users AS finders ON finders.username = lost_arrows.found_by_username
    WHERE lost_arrows.id = ?
    LIMIT 1
  `);
  const markLostArrowFoundStatement = db.prepare(`
    UPDATE lost_arrows
    SET
      date_found = ?,
      found_by_username = ?,
      found_collection_location = ?
    WHERE id = ?
  `);
  const markFoundLostArrowsSeenForUserStatement = db.prepare(`
    UPDATE lost_arrows
    SET
      found_seen_at_date = ?,
      found_seen_at_time = ?
    WHERE LOWER(archer_username) = LOWER(?)
      AND date_found IS NOT NULL
      AND found_seen_at_date IS NULL
  `);

  return {
    async createLostArrow(payload) {
      const result = createLostArrowStatement.run(
        payload.archerUsername,
        payload.dateLost,
        payload.arrowMaterial,
        payload.arrowColour,
        payload.arrowIdentifier,
        payload.fletchingColour1,
        payload.fletchingColour2,
        payload.fletchingColour3,
        payload.nockColour,
        payload.targetDistance,
        payload.laneNumber,
        payload.otherDetails,
        payload.createdAtDate,
        payload.createdAtTime,
      );

      return normalizeLostArrowRow(findLostArrowByIdStatement.get(result.lastInsertRowid));
    },
    async findLostArrowById(id) {
      return normalizeLostArrowRow(findLostArrowByIdStatement.get(id));
    },
    async listFoundLostArrowsForUser(username) {
      return listFoundLostArrowsForUserStatement
        .all(username)
        .map(normalizeLostArrowRow);
    },
    async listOpenLostArrows() {
      return listOpenLostArrowsStatement.all().map(normalizeLostArrowRow);
    },
    async markLostArrowFound({
      dateFound,
      foundByUsername,
      foundCollectionLocation,
      id,
    }) {
      markLostArrowFoundStatement.run(
        dateFound,
        foundByUsername,
        foundCollectionLocation,
        id,
      );
      return normalizeLostArrowRow(findLostArrowByIdStatement.get(id));
    },
    async markFoundLostArrowsSeenForUser({
      seenAtDate,
      seenAtTime,
      username,
    }) {
      markFoundLostArrowsSeenForUserStatement.run(
        seenAtDate,
        seenAtTime,
        username,
      );
    },
  };
}

function createPostgresLostArrowGateway(pool) {
  return {
    async createLostArrow(payload) {
      const result = await pool.query(
        `
          INSERT INTO lost_arrows (
            archer_username,
            date_lost,
            arrow_material,
            arrow_colour,
            arrow_identifier,
            fletching_colour_1,
            fletching_colour_2,
            fletching_colour_3,
            nock_colour,
            target_distance,
            lane_number,
            other_details,
            created_at_date,
            created_at_time
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING id
        `,
        [
          payload.archerUsername,
          payload.dateLost,
          payload.arrowMaterial,
          payload.arrowColour,
          payload.arrowIdentifier,
          payload.fletchingColour1,
          payload.fletchingColour2,
          payload.fletchingColour3,
          payload.nockColour,
          payload.targetDistance,
          payload.laneNumber,
          payload.otherDetails,
          payload.createdAtDate,
          payload.createdAtTime,
        ],
      );

      return this.findLostArrowById(result.rows[0]?.id);
    },
    async findLostArrowById(id) {
      const result = await pool.query(
        `
          SELECT
            lost_arrows.*,
            owners.first_name || ' ' || owners.surname AS archer_name,
            finders.first_name || ' ' || finders.surname AS found_by_name
          FROM lost_arrows
          INNER JOIN users AS owners ON owners.username = lost_arrows.archer_username
          LEFT JOIN users AS finders ON finders.username = lost_arrows.found_by_username
          WHERE lost_arrows.id = $1
          LIMIT 1
        `,
        [id],
      );

      return normalizeLostArrowRow(result.rows[0] ?? null);
    },
    async listFoundLostArrowsForUser(username) {
      const result = await pool.query(
        `
          SELECT
            lost_arrows.*,
            owners.first_name || ' ' || owners.surname AS archer_name,
            finders.first_name || ' ' || finders.surname AS found_by_name
          FROM lost_arrows
          INNER JOIN users AS owners ON owners.username = lost_arrows.archer_username
          LEFT JOIN users AS finders ON finders.username = lost_arrows.found_by_username
          WHERE LOWER(lost_arrows.archer_username) = LOWER($1)
            AND lost_arrows.date_found IS NOT NULL
            AND lost_arrows.found_seen_at_date IS NULL
          ORDER BY lost_arrows.date_found DESC, lost_arrows.id DESC
        `,
        [username],
      );

      return result.rows.map(normalizeLostArrowRow);
    },
    async listOpenLostArrows() {
      const result = await pool.query(`
        SELECT
          lost_arrows.*,
          owners.first_name || ' ' || owners.surname AS archer_name,
          finders.first_name || ' ' || finders.surname AS found_by_name
        FROM lost_arrows
        INNER JOIN users AS owners ON owners.username = lost_arrows.archer_username
        LEFT JOIN users AS finders ON finders.username = lost_arrows.found_by_username
        WHERE lost_arrows.date_found IS NULL
        ORDER BY lost_arrows.date_lost DESC, lost_arrows.id DESC
      `);

      return result.rows.map(normalizeLostArrowRow);
    },
    async markLostArrowFound({
      dateFound,
      foundByUsername,
      foundCollectionLocation,
      id,
    }) {
      await pool.query(
        `
          UPDATE lost_arrows
          SET
            date_found = $1,
            found_by_username = $2,
            found_collection_location = $3
          WHERE id = $4
        `,
        [dateFound, foundByUsername, foundCollectionLocation, id],
      );

      return this.findLostArrowById(id);
    },
    async markFoundLostArrowsSeenForUser({ seenAtDate, seenAtTime, username }) {
      await pool.query(
        `
          UPDATE lost_arrows
          SET
            found_seen_at_date = $1,
            found_seen_at_time = $2
          WHERE LOWER(archer_username) = LOWER($3)
            AND date_found IS NOT NULL
            AND found_seen_at_date IS NULL
        `,
        [seenAtDate, seenAtTime, username],
      );
    },
  };
}

export function createLostArrowGateway({ databaseEngine, db, pool }) {
  if (databaseEngine === "postgres") {
    return createPostgresLostArrowGateway(pool);
  }

  return createSqliteLostArrowGateway(db);
}
