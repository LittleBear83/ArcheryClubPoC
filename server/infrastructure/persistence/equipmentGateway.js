function normalizeCountLikeResult(result) {
  return {
    changes: Number(result?.changes ?? result?.rowCount ?? 0),
  };
}

function normalizeInsertId(result) {
  return Number(result?.lastInsertRowid ?? result?.rows?.[0]?.id ?? 0);
}

function normalizeCountRow(row) {
  return {
    count: Number(row?.count ?? 0),
  };
}

function createSqliteEquipmentGateway(deps) {
  return {
    async closeEquipmentLoan(payload) {
      deps.closeEquipmentLoan.run(
        payload.returnedByUsername,
        payload.returnedAtDate,
        payload.returnedAtTime,
        payload.returnLocationType,
        payload.returnLocationLabel,
        payload.returnCaseId,
        payload.id,
      );
    },
    async countEquipmentItemsByStorageLocation(label) {
      return normalizeCountRow(deps.countEquipmentItemsByStorageLocation.get(label));
    },
    async createEquipmentItem(payload) {
      return deps.insertEquipmentItem.run(payload);
    },
    async createEquipmentLoan(
      equipmentItemId,
      memberUsername,
      loanedByUsername,
      loanedAtDate,
      loanedAtTime,
      loanContextCaseId,
    ) {
      deps.insertEquipmentLoan.run(
        equipmentItemId,
        memberUsername,
        loanedByUsername,
        loanedAtDate,
        loanedAtTime,
        loanContextCaseId,
      );
    },
    async createEquipmentStorageLocation(label, date, time) {
      deps.insertEquipmentStorageLocation.run(label, date, time);
    },
    async deleteEquipmentStorageLocation(label) {
      deps.deleteEquipmentStorageLocation.run(label);
    },
    async findEquipmentItemById(id) {
      return deps.findEquipmentItemById.get(id);
    },
    async findEquipmentItemByIdWithRelations(id) {
      return deps.findEquipmentItemByIdWithRelations.get(id);
    },
    async findEquipmentStorageLocationByLabel(label) {
      return deps.findEquipmentStorageLocationByLabel.get(label);
    },
    async findOpenEquipmentLoanByItemId(id) {
      return deps.findOpenEquipmentLoanByItemId.get(id);
    },
    async listEquipmentItems() {
      return deps.listEquipmentItems.all();
    },
    async listEquipmentItemsByCaseId(caseId) {
      return deps.listEquipmentItemsByCaseId.all(caseId);
    },
    async listEquipmentLoans() {
      return deps.listEquipmentLoans.all();
    },
    async listEquipmentStorageLocations() {
      return deps.listEquipmentStorageLocations.all();
    },
    async listOpenEquipmentLoansByCaseId(caseId) {
      return deps.listOpenEquipmentLoansByCaseId.all(caseId);
    },
    async listOpenEquipmentLoansByMemberUserId(username) {
      return deps.listOpenEquipmentLoansByMemberUserId.all(username);
    },
    async removeEquipmentLoan(eventId, actorId) {
      return normalizeCountLikeResult(deps.deleteEventBooking.run(eventId, actorId));
    },
    async removeEquipmentStorageLoan(sessionId, actorId) {
      return normalizeCountLikeResult(deps.deleteCoachingSessionBooking.run(sessionId, actorId));
    },
    async updateEquipmentAssignmentMetadata(payload) {
      deps.updateEquipmentAssignmentMetadata.run(payload);
    },
    async updateEquipmentItemForDecommission(payload) {
      deps.updateEquipmentItemForDecommission.run(payload);
    },
    async updateEquipmentItemStorage(payload) {
      deps.updateEquipmentItemStorage.run(payload);
    },
  };
}

function createPostgresEquipmentGateway({ pool }) {
  return {
    async closeEquipmentLoan(payload) {
      await pool.query(
        `
          UPDATE equipment_loans
          SET
            returned_by_username = $1,
            returned_at_date = $2,
            returned_at_time = $3,
            return_location_type = $4,
            return_location_label = $5,
            return_case_id = $6
          WHERE id = $7
        `,
        [
          payload.returnedByUsername,
          payload.returnedAtDate,
          payload.returnedAtTime,
          payload.returnLocationType,
          payload.returnLocationLabel,
          payload.returnCaseId,
          payload.id,
        ],
      );
    },
    async countEquipmentItemsByStorageLocation(label) {
      const result = await pool.query(
        `
          SELECT COUNT(*) AS count
          FROM equipment_items
          WHERE location_type = 'cupboard'
            AND location_label = $1
            AND status = 'active'
        `,
        [label],
      );

      return normalizeCountRow(result.rows[0]);
    },
    async createEquipmentItem(payload) {
      const result = await pool.query(
        `
          INSERT INTO equipment_items (
            equipment_type,
            item_number,
            size_category,
            arrow_length,
            arrow_quantity,
            status,
            location_type,
            location_label,
            location_case_id,
            location_member_username,
            added_by_username,
            added_at_date,
            added_at_time,
            last_storage_updated_by_username,
            last_storage_updated_at_date,
            last_storage_updated_at_time
          )
          VALUES (
            $1, $2, $3, $4, $5, 'active', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
          )
          RETURNING id
        `,
        [
          payload.equipmentType,
          payload.itemNumber,
          payload.sizeCategory,
          payload.arrowLength,
          payload.arrowQuantity,
          payload.locationType,
          payload.locationLabel,
          payload.locationCaseId,
          payload.locationMemberUsername,
          payload.addedByUsername,
          payload.addedAtDate,
          payload.addedAtTime,
          payload.storageByUsername,
          payload.storageAtDate,
          payload.storageAtTime,
        ],
      );

      return { lastInsertRowid: normalizeInsertId(result) };
    },
    async createEquipmentLoan(
      equipmentItemId,
      memberUsername,
      loanedByUsername,
      loanedAtDate,
      loanedAtTime,
      loanContextCaseId,
    ) {
      await pool.query(
        `
          INSERT INTO equipment_loans (
            equipment_item_id,
            member_username,
            loaned_by_username,
            loaned_at_date,
            loaned_at_time,
            loan_context_case_id
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          equipmentItemId,
          memberUsername,
          loanedByUsername,
          loanedAtDate,
          loanedAtTime,
          loanContextCaseId,
        ],
      );
    },
    async createEquipmentStorageLocation(label, date, time) {
      await pool.query(
        `
          INSERT INTO equipment_storage_locations (
            label,
            created_at_date,
            created_at_time
          )
          VALUES ($1, $2, $3)
        `,
        [label, date, time],
      );
    },
    async deleteEquipmentStorageLocation(label) {
      await pool.query(
        `DELETE FROM equipment_storage_locations WHERE label = $1`,
        [label],
      );
    },
    async findEquipmentItemById(id) {
      const result = await pool.query(
        `SELECT * FROM equipment_items WHERE id = $1 LIMIT 1`,
        [id],
      );
      return result.rows[0] ?? null;
    },
    async findEquipmentItemByIdWithRelations(id) {
      const result = await pool.query(
        `
          SELECT
            equipment_items.*,
            location_case.item_number AS location_case_number
          FROM equipment_items
          LEFT JOIN equipment_items AS location_case
            ON location_case.id = equipment_items.location_case_id
          WHERE equipment_items.id = $1
          LIMIT 1
        `,
        [id],
      );
      return result.rows[0] ?? null;
    },
    async findEquipmentStorageLocationByLabel(label) {
      const result = await pool.query(
        `SELECT label FROM equipment_storage_locations WHERE label = $1 LIMIT 1`,
        [label],
      );
      return result.rows[0] ?? null;
    },
    async findOpenEquipmentLoanByItemId(id) {
      const result = await pool.query(
        `
          SELECT *
          FROM equipment_loans
          WHERE equipment_item_id = $1
            AND returned_at_date IS NULL
          LIMIT 1
        `,
        [id],
      );
      return result.rows[0] ?? null;
    },
    async listEquipmentItems() {
      const result = await pool.query(
        `
          SELECT
            equipment_items.*,
            added_by.first_name AS added_by_first_name,
            added_by.surname AS added_by_surname,
            decommissioned_by.first_name AS decommissioned_by_first_name,
            decommissioned_by.surname AS decommissioned_by_surname,
            assigned_by.first_name AS assigned_by_first_name,
            assigned_by.surname AS assigned_by_surname,
            storage_by.first_name AS storage_by_first_name,
            storage_by.surname AS storage_by_surname,
            location_member.first_name AS location_member_first_name,
            location_member.surname AS location_member_surname,
            location_case.item_number AS location_case_number,
            location_case.equipment_type AS location_case_type
          FROM equipment_items
          LEFT JOIN users AS added_by ON added_by.id = equipment_items.added_by_user_id
          LEFT JOIN users AS decommissioned_by ON decommissioned_by.id = equipment_items.decommissioned_by_user_id
          LEFT JOIN users AS assigned_by ON assigned_by.id = equipment_items.last_assignment_by_user_id
          LEFT JOIN users AS storage_by ON storage_by.id = equipment_items.last_storage_updated_by_user_id
          LEFT JOIN users AS location_member ON location_member.id = equipment_items.location_member_user_id
          LEFT JOIN equipment_items AS location_case ON location_case.id = equipment_items.location_case_id
          ORDER BY equipment_items.equipment_type ASC, equipment_items.item_number ASC, equipment_items.id ASC
        `,
      );
      return result.rows;
    },
    async listEquipmentItemsByCaseId(caseId) {
      const result = await pool.query(
        `
          SELECT *
          FROM equipment_items
          WHERE location_case_id = $1
            AND status = 'active'
          ORDER BY equipment_type ASC, item_number ASC, id ASC
        `,
        [caseId],
      );
      return result.rows;
    },
    async listEquipmentLoans() {
      const result = await pool.query(
        `
          SELECT
            equipment_loans.*,
            member.first_name AS member_first_name,
            member.surname AS member_surname,
            loaned_by.first_name AS loaned_by_first_name,
            loaned_by.surname AS loaned_by_surname,
            returned_by.first_name AS returned_by_first_name,
            returned_by.surname AS returned_by_surname,
            context_case.item_number AS context_case_number
          FROM equipment_loans
          LEFT JOIN users AS member ON member.id = equipment_loans.member_user_id
          LEFT JOIN users AS loaned_by ON loaned_by.id = equipment_loans.loaned_by_user_id
          LEFT JOIN users AS returned_by ON returned_by.id = equipment_loans.returned_by_user_id
          LEFT JOIN equipment_items AS context_case ON context_case.id = equipment_loans.loan_context_case_id
          ORDER BY equipment_loans.loaned_at_date DESC, equipment_loans.loaned_at_time DESC, equipment_loans.id DESC
        `,
      );
      return result.rows;
    },
    async listEquipmentStorageLocations() {
      const result = await pool.query(
        `SELECT label FROM equipment_storage_locations ORDER BY lower(label) ASC`,
      );
      return result.rows;
    },
    async listOpenEquipmentLoansByCaseId(caseId) {
      const result = await pool.query(
        `
          SELECT *
          FROM equipment_loans
          WHERE loan_context_case_id = $1
            AND returned_at_date IS NULL
        `,
        [caseId],
      );
      return result.rows;
    },
    async listOpenEquipmentLoansByMemberUserId(username) {
      const result = await pool.query(
        `
          SELECT
            equipment_loans.*,
            equipment_items.equipment_type,
            equipment_items.item_number,
            equipment_items.size_category,
            equipment_items.arrow_length,
            equipment_items.arrow_quantity
          FROM equipment_loans
          INNER JOIN equipment_items
            ON equipment_items.id = equipment_loans.equipment_item_id
          WHERE equipment_loans.member_username = $1
            AND equipment_loans.returned_at_date IS NULL
          ORDER BY equipment_loans.loaned_at_date DESC, equipment_loans.loaned_at_time DESC, equipment_loans.id DESC
        `,
        [username],
      );
      return result.rows;
    },
    async updateEquipmentAssignmentMetadata(payload) {
      await pool.query(
        `
          UPDATE equipment_items
          SET
            last_assignment_by_username = $1,
            last_assignment_at_date = $2,
            last_assignment_at_time = $3
          WHERE id = $4
        `,
        [
          payload.assignedByUsername,
          payload.assignedAtDate,
          payload.assignedAtTime,
          payload.id,
        ],
      );
    },
    async updateEquipmentItemForDecommission(payload) {
      await pool.query(
        `
          UPDATE equipment_items
          SET
            status = 'decommissioned',
            location_type = 'cupboard',
            location_label = $1,
            location_case_id = NULL,
            location_member_username = NULL,
            decommissioned_by_username = $2,
            decommissioned_at_date = $3,
            decommissioned_at_time = $4,
            decommission_reason = $5
          WHERE id = $6
        `,
        [
          payload.locationLabel,
          payload.decommissionedByUsername,
          payload.decommissionedAtDate,
          payload.decommissionedAtTime,
          payload.decommissionReason,
          payload.id,
        ],
      );
    },
    async updateEquipmentItemStorage(payload) {
      await pool.query(
        `
          UPDATE equipment_items
          SET
            location_type = $1,
            location_label = $2,
            location_case_id = $3,
            location_member_username = $4,
            last_storage_updated_by_username = $5,
            last_storage_updated_at_date = $6,
            last_storage_updated_at_time = $7
          WHERE id = $8
        `,
        [
          payload.locationType,
          payload.locationLabel,
          payload.locationCaseId,
          payload.locationMemberUsername,
          payload.storageByUsername,
          payload.storageAtDate,
          payload.storageAtTime,
          payload.id,
        ],
      );
    },
  };
}

export function createEquipmentGateway(options) {
  if (options.databaseEngine === "postgres") {
    return createPostgresEquipmentGateway(options);
  }

  return createSqliteEquipmentGateway(options);
}
