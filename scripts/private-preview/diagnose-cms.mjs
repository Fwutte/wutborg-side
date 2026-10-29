import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const wrangler = 'C:/Users/lotte/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/bin/wrangler.js';
const python = 'C:/Users/lotte/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-diagnostics-'));
function run(exe, args) { const r = spawnSync(exe, args, { cwd, encoding: 'utf8', timeout: 60000 }); if (r.status) throw new Error('Configuration read failed.'); return r.stdout; }
run(process.execPath, [wrangler, 'pages', 'download', 'config', 'wutborg-side']);
const config = JSON.parse(run(python, ['-c', 'import json,tomllib,sys; print(json.dumps(tomllib.load(open(sys.argv[1], "rb"))))', path.join(cwd, 'wrangler.toml')]));
const production = { ...config, ...config.env?.production };
console.log(JSON.stringify({ adminConfigured: production.vars?.OENSKELANDET_ADMIN_EMAILS?.toLowerCase() === 'frederik.wutborg@live.dk', viewerConfigured: !!production.vars?.PRIVATE_PREVIEW_EMAILS, nodeCompat: production.compatibility_flags?.includes('nodejs_compat'), mediaBinding: production.r2_buckets?.some(bucket => bucket.binding === 'OENSKELANDET_MEDIA'), databaseBinding: production.d1_databases?.some(db => db.binding === 'DB') }));
const credentials = await fs.readFile('C:/Users/lotte/AppData/Roaming/xdg.config/.wrangler/config/default.toml', 'utf8');
const token = credentials.match(/^oauth_token\s*=\s*"([^"\r\n]+)"/m)?.[1];
const response = await fetch('https://api.cloudflare.com/client/v4/accounts/98a6d302d1e0fdbc93ac71aeb0d6606c/d1/database/24fdff5f-cf6a-4cfb-a5c3-534cbde42592/query', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ sql: "SELECT revision, length(state_json) AS state_bytes, length(public_json) AS public_bytes, (SELECT COUNT(*) FROM oenskelandet_cms_sessions) AS sessions FROM oenskelandet_cms_state WHERE id = 1" }) });
const data = await response.json();
if (!response.ok || !data.success) throw new Error('Storage diagnosis failed.');
console.log(JSON.stringify({ storage: data.result[0].results[0] }));
