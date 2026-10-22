

export async function queryRows(client, sql, values = []) {
  const result = await client.query(sql, values);
  return result.rows ?? [];
}

export async function setPullApplyMode(client) {
  await client.query(`SELECT set_config('archery.sync.apply_mode', 'pull', true)`);
}

export async function querySingleValue(client, sql, values = []) {
  const rows = await queryRows(client, sql, values);
  return rows[0] ?? null;
}
