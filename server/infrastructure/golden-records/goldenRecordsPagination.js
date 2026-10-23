export const GOLDEN_RECORDS_PAGE_SIZE = 1000;
export const GOLDEN_RECORDS_MAX_PAGES = 100;
export const GOLDEN_RECORDS_REQUEST_GAP_MS = 1100;

export async function collectGoldenRecordsPages({
  path,
  fetchPage,
  beforePage,
  readRows = (response) => response.body,
  errorMessage = (response) => `Golden Records returned ${response.status} for ${path}.`,
  invalidResponseMessage = `Invalid Golden Records page response from ${path}.`,
  allowNullEmpty = false,
  pageSize = GOLDEN_RECORDS_PAGE_SIZE,
  maxPages = GOLDEN_RECORDS_MAX_PAGES,
  signal,
}) {
  const rows = [];
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    signal?.throwIfAborted();
    await beforePage?.();
    const response = await fetchPage({ pageNumber, pageSize, signal });
    if (!response.ok) throw new Error(errorMessage(response));
    if (allowNullEmpty && response.body === null && !response.bodyWasEmpty) break;

    const pageRows = readRows(response);
    if (!Array.isArray(pageRows) || pageRows.length > pageSize) {
      throw new Error(invalidResponseMessage);
    }
    if (pageRows.length === 0) break;
    rows.push(...pageRows);
    if (pageRows.length < pageSize) break;
    if (pageNumber === maxPages) {
      throw new Error(`Golden Records pagination safety limit reached for ${path} after ${maxPages} full pages; refusing partial results.`);
    }
  }
  return rows;
}
