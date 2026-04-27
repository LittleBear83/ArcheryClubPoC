export function createSqliteEquipmentStatements(db) {
  const listEquipmentItems = db.prepare(`
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
    LEFT JOIN users AS added_by
      ON added_by.id = equipment_items.added_by_user_id
    LEFT JOIN users AS decommissioned_by
      ON decommissioned_by.id = equipment_items.decommissioned_by_user_id
    LEFT JOIN users AS assigned_by
      ON assigned_by.id = equipment_items.last_assignment_by_user_id
    LEFT JOIN users AS storage_by
      ON storage_by.id = equipment_items.last_storage_updated_by_user_id
    LEFT JOIN users AS location_member
      ON location_member.id = equipment_items.location_member_user_id
    LEFT JOIN equipment_items AS location_case
      ON location_case.id = equipment_items.location_case_id
    ORDER BY equipment_items.equipment_type ASC, equipment_items.item_number ASC, equipment_items.id ASC
  `);

  const findEquipmentItemById = db.prepare(`
    SELECT *
    FROM equipment_items
    WHERE id = ?
  `);

  const findEquipmentItemByIdWithRelations = db.prepare(`
    SELECT
      equipment_items.*,
      location_case.item_number AS location_case_number
    FROM equipment_items
    LEFT JOIN equipment_items AS location_case
      ON location_case.id = equipment_items.location_case_id
    WHERE equipment_items.id = ?
  `);

  const listEquipmentItemsByCaseId = db.prepare(`
    SELECT *
    FROM equipment_items
    WHERE location_case_id = ?
      AND status = 'active'
    ORDER BY equipment_type ASC, item_number ASC, id ASC
  `);

  const findActiveEquipmentByIdentity = db.prepare(`
    SELECT id
    FROM equipment_items
    WHERE equipment_type = ?
      AND size_category = ?
      AND item_number = ?
      AND status = 'active'
  `);

  const insertEquipmentItem = db.prepare(`
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
      @equipmentType,
      @itemNumber,
      @sizeCategory,
      @arrowLength,
      @arrowQuantity,
      'active',
      @locationType,
      @locationLabel,
      @locationCaseId,
      @locationMemberUsername,
      @addedByUsername,
      @addedAtDate,
      @addedAtTime,
      @storageByUsername,
      @storageAtDate,
      @storageAtTime
    )
  `);

  const updateEquipmentItemForDecommission = db.prepare(`
    UPDATE equipment_items
    SET
      status = 'decommissioned',
      location_type = 'cupboard',
      location_label = @locationLabel,
      location_case_id = NULL,
      location_member_username = NULL,
      decommissioned_by_username = @decommissionedByUsername,
      decommissioned_at_date = @decommissionedAtDate,
      decommissioned_at_time = @decommissionedAtTime,
      decommission_reason = @decommissionReason
    WHERE id = @id
  `);

  const updateEquipmentItemStorage = db.prepare(`
    UPDATE equipment_items
    SET
      location_type = @locationType,
      location_label = @locationLabel,
      location_case_id = @locationCaseId,
      location_member_username = @locationMemberUsername,
      last_storage_updated_by_username = @storageByUsername,
      last_storage_updated_at_date = @storageAtDate,
      last_storage_updated_at_time = @storageAtTime
    WHERE id = @id
  `);

  const updateEquipmentAssignmentMetadata = db.prepare(`
    UPDATE equipment_items
    SET
      last_assignment_by_username = @assignedByUsername,
      last_assignment_at_date = @assignedAtDate,
      last_assignment_at_time = @assignedAtTime
    WHERE id = @id
  `);

  const listEquipmentStorageLocations = db.prepare(`
    SELECT label
    FROM equipment_storage_locations
    ORDER BY lower(label) ASC
  `);

  const findEquipmentStorageLocationByLabel = db.prepare(`
    SELECT label
    FROM equipment_storage_locations
    WHERE label = ?
  `);

  const countEquipmentItemsByStorageLocation = db.prepare(`
    SELECT COUNT(*) AS count
    FROM equipment_items
    WHERE location_type = 'cupboard'
      AND location_label = ?
      AND status = 'active'
  `);

  const insertEquipmentStorageLocation = db.prepare(`
    INSERT INTO equipment_storage_locations (
      label,
      created_at_date,
      created_at_time
    )
    VALUES (?, ?, ?)
  `);

  const deleteEquipmentStorageLocation = db.prepare(`
    DELETE FROM equipment_storage_locations
    WHERE label = ?
  `);

  const listEquipmentLoans = db.prepare(`
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
    LEFT JOIN users AS member
      ON member.id = equipment_loans.member_user_id
    LEFT JOIN users AS loaned_by
      ON loaned_by.id = equipment_loans.loaned_by_user_id
    LEFT JOIN users AS returned_by
      ON returned_by.id = equipment_loans.returned_by_user_id
    LEFT JOIN equipment_items AS context_case
      ON context_case.id = equipment_loans.loan_context_case_id
    ORDER BY equipment_loans.loaned_at_date DESC, equipment_loans.loaned_at_time DESC, equipment_loans.id DESC
  `);

  const findOpenEquipmentLoanByItemId = db.prepare(`
    SELECT *
    FROM equipment_loans
    WHERE equipment_item_id = ?
      AND returned_at_date IS NULL
    LIMIT 1
  `);

  const listOpenEquipmentLoansByCaseId = db.prepare(`
    SELECT *
    FROM equipment_loans
    WHERE loan_context_case_id = ?
      AND returned_at_date IS NULL
  `);

  const listOpenEquipmentLoansByMemberUserId = db.prepare(`
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
    WHERE equipment_loans.member_user_id = ?
      AND equipment_loans.returned_at_date IS NULL
    ORDER BY equipment_loans.loaned_at_date DESC, equipment_loans.loaned_at_time DESC, equipment_loans.id DESC
  `);

  const insertEquipmentLoan = db.prepare(`
    INSERT INTO equipment_loans (
      equipment_item_id,
      member_username,
      loaned_by_username,
      loaned_at_date,
      loaned_at_time,
      loan_context_case_id
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const closeEquipmentLoan = db.prepare(`
    UPDATE equipment_loans
    SET
      returned_by_username = ?,
      returned_at_date = ?,
      returned_at_time = ?,
      return_location_type = ?,
      return_location_label = ?,
      return_case_id = ?
    WHERE id = ?
  `);

  return {
    closeEquipmentLoan,
    countEquipmentItemsByStorageLocation,
    deleteEquipmentStorageLocation,
    findActiveEquipmentByIdentity,
    findEquipmentItemById,
    findEquipmentItemByIdWithRelations,
    findEquipmentStorageLocationByLabel,
    findOpenEquipmentLoanByItemId,
    insertEquipmentItem,
    insertEquipmentLoan,
    insertEquipmentStorageLocation,
    listEquipmentItems,
    listEquipmentItemsByCaseId,
    listEquipmentLoans,
    listEquipmentStorageLocations,
    listOpenEquipmentLoansByCaseId,
    listOpenEquipmentLoansByMemberUserId,
    updateEquipmentAssignmentMetadata,
    updateEquipmentItemForDecommission,
    updateEquipmentItemStorage,
  };
}
