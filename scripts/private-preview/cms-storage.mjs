import fs from 'node:fs/promises';
import path from 'node:path';

export async function initializeCms(output) {
  const config = await fs.readFile('C:/Users/lotte/AppData/Roaming/xdg.config/.wrangler/config/default.toml', 'utf8');
  const token = config.match(/^oauth_token\s*=\s*"([^"\r\n]+)"/m)?.[1];
  if (!token) throw new Error('The existing Wrangler authorization is unavailable.');
  const url = 'https://api.cloudflare.com/client/v4/accounts/98a6d302d1e0fdbc93ac71aeb0d6606c/d1/database/24fdff5f-cf6a-4cfb-a5c3-534cbde42592/query';
  async function query(sql, params = []) {
    const response = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ sql, params }), signal: AbortSignal.timeout(30000) });
    const data = await response.json();
    if (!response.ok || !data.success || data.result.some(result => !result.success)) throw new Error('CMS storage initialization failed (HTTP ' + response.status + ', codes ' + (data.errors || []).map(error => error.code).join(',') + ').');
    return data.result;
  }
  const schema = await fs.readFile(new URL('./cms-schema.sql', import.meta.url), 'utf8');
  await query(schema);
  const state = JSON.parse(await fs.readFile(path.join(output, 'cms-initial-state.json'), 'utf8'));
  const rendered = await fs.readFile(path.join(output, 'cms-initial-public.json'), 'utf8');
  const result = await query('INSERT OR IGNORE INTO oenskelandet_cms_state (id, revision, state_json, public_json) VALUES (1, ?, ?, ?)', [state.revision, JSON.stringify(state), rendered]);
  await query("INSERT OR IGNORE INTO oenskelandet_cms_usage (id, value) VALUES ('r2-storage', 0)");
  const current = await query('SELECT revision FROM oenskelandet_cms_state WHERE id = 1');
  console.log(JSON.stringify({ cmsSchemaReady: true, seededNow: result[0].meta.changes === 1, onlineRevision: current[0].results[0].revision }));
}
