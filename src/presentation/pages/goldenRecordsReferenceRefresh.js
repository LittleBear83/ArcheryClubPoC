export async function refreshGoldenRecordsReferenceData(checkConnection, refreshLookups) {
  const connection = await checkConnection();
  if (!connection.health?.ok) {
    throw new Error(connection.message || "Golden Records connection check failed.");
  }
  return refreshLookups();
}
