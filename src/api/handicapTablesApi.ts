import { fetchApi } from "./client";

export type HandicapTableRow = {
  handicapValue: number;
  referenceScore: number | null;
};

export type HandicapTable = {
  tableKey: string;
  title: string;
  description: string;
  allowancePercent: number | null;
  isEditable: boolean;
  displayOrder: number;
  updatedAtDate: string;
  updatedAtTime: string;
  updatedByUsername: string;
  rows: HandicapTableRow[];
};

export type HandicapTableFamily = {
  familyKey: string;
  familyTitle: string;
  description: string;
  displayOrder: number;
  tables: HandicapTable[];
};

export type HandicapTablesSnapshot = {
  sourceDocument: string;
  sourceRevision: string;
  sourceTitle: string;
  families: HandicapTableFamily[];
};

export async function listHandicapTables() {
  const response = await fetchApi<{
    success: boolean;
    handicapTables: HandicapTablesSnapshot;
  }>("/api/handicap-tables", {
    method: "GET",
  });

  return response.handicapTables;
}
