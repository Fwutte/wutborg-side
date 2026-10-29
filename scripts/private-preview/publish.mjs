import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { initializeCms } from './cms-storage.mjs';
import { protectProductionDeployments } from './deployment-guard.mjs';
import { migrateOnlineModel } from './migrate-online-model.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const wrangler = process.env.PRIVATE_PREVIEW_WRANGLER || 'C:/Users/lotte/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/bin/wrangler.js';
const python = 'C:/Users/lotte/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const publish = process.argv.includes('--publish');
const issuer = 'https://super-shadow-c7e6.cloudflareaccess.com';
const audience = '5ba625328a13cdb9e9bde5b76debbea6948d2a5b9ae7672fb62c7a93947f6900';
function run(command, args, cwd = repo, quiet = false) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 240000, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' }, maxBuffer: 10 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    // Config downloads are captured, since existing settings may contain private values.
    if (!quiet) process.stderr.write(result.stdout + result.stderr);
    throw new Error(`Command failed: ${path.basename(command)} ${args.slice(0, 3).join(' ')}`);
  }
  if (!quiet) process.stdout.write(result.stdout);
  return result.stdout;
}
// Confirm that the correct Access application protects every presentation endpoint.
for (const pathname of ['/oenskelandet', '/oenskelandet/', '/oenskelandet/app.js', '/oenskelandet/api/content']) {
  const response = await fetch('https://wutborg.dk' + pathname, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  const login = new URL(response.headers.get('location') || 'https://invalid.example');
  await response.body?.cancel();
  if (response.status !== 302 || login.origin !== issuer || login.searchParams.get('kid') !== audience) throw new Error('Expected Cloudflare Access protection is missing for ' + pathname);
}
const home = await fetch('https://wutborg.dk/', { redirect: 'manual', signal: AbortSignal.timeout(15000) });
await home.body?.cancel();
if (home.status !== 200) throw new Error('The public homepage is not available.');
console.log('Correct Access application protects the presentation endpoints.');

const downloaded = await fs.mkdtemp(path.join(os.tmpdir(), 'wutborg-live-config-'));
run(process.execPath, [wrangler, 'pages', 'download', 'config', 'wutborg-side'], downloaded, true);
const settings = JSON.parse(run(python, ['-c', 'import json,tomllib,sys; print(json.dumps(tomllib.load(open(sys.argv[1], "rb"))))', path.join(downloaded, 'wrangler.toml')], downloaded, true));
if (settings.name !== 'wutborg-side') throw new Error('Unexpected Pages project.');
const production = { ...settings, ...settings.env?.production };
if (!production.d1_databases?.some(db => db.binding === 'DB' && db.database_id === '24fdff5f-cf6a-4cfb-a5c3-534cbde42592')) throw new Error('Existing database binding differs; deployment stopped.');
const prepared = JSON.parse(run(process.execPath, ['scripts/prepare-private-preview.mjs', '--online'], repo, true));
const output = prepared.output;
settings.pages_build_output_dir = './public';
const vars = { PRIVATE_PREVIEW_ISSUER: issuer, PRIVATE_PREVIEW_AUDIENCE: audience, PRIVATE_PREVIEW_EMAILS: production.vars?.PRIVATE_PREVIEW_EMAILS || 'Frederik.wutborg@live.dk', OENSKELANDET_ADMIN_EMAILS: 'Frederik.wutborg@live.dk' };
settings.vars = { ...settings.vars, ...vars };
settings.env ||= {};
settings.env.production ||= {};
settings.env.production.vars = { ...production.vars, ...vars };
if (settings.env.preview) settings.env.preview.vars = { ...settings.env.preview.vars, ...vars };
settings.compatibility_flags = [...new Set([...(settings.compatibility_flags || []), 'nodejs_compat'])];
for (const scope of [settings, settings.env.production, settings.env.preview].filter(Boolean)) {
  scope.compatibility_flags = [...new Set([...(scope.compatibility_flags || settings.compatibility_flags), 'nodejs_compat'])];
  scope.r2_buckets = [...(scope.r2_buckets || settings.r2_buckets || []).filter(item => item.binding !== 'OENSKELANDET_MEDIA'), { binding: 'OENSKELANDET_MEDIA', bucket_name: 'oenskelandet-cms' }];
}
await fs.rename(path.join(output, 'wrangler.toml'), path.join(output, 'wrangler.local-only.toml'));
await fs.writeFile(path.join(output, 'wrangler.json'), JSON.stringify(settings, null, 2));
run(process.execPath, ['scripts/private-preview/check.mjs', output]);
run(process.execPath, ['scripts/private-preview/check-worker.mjs']);
run(process.execPath, ['scripts/private-preview/check-cms-worker.mjs', output]);
run(process.execPath, ['scripts/private-preview/check-admin-upgrade.mjs', output]);
await migrateOnlineModel(output);
run(process.execPath, [wrangler, 'pages', 'functions', 'build', 'functions', '--outdir', './compiled-check', '--build-output-directory', './public'], output);
console.log(JSON.stringify({ publishedPages: prepared.publishedPages, protectedFiles: prepared.protectedFiles, productionVariablesPreserved: Object.keys(production.vars || {}).length, databasePreserved: true, readyToPublish: true }));
if (publish) {
  await protectProductionDeployments();
  await initializeCms(output);
  const deployed = run(process.execPath, [wrangler, 'pages', 'deploy', './public', '--project-name', 'wutborg-side', '--branch', 'main', '--commit-dirty=true', '--commit-message', 'Publish website with protected online administration'], output);
  const deployment = deployed.match(/https:\/\/[a-f0-9]+\.wutborg-side\.pages\.dev\b/)?.[0];
  if (!deployment) throw new Error('Deployment finished without a verifiable deployment URL.');
  await migrateOnlineModel(output,{apply:true});
  run(process.execPath, ['scripts/private-preview/verify.mjs', deployment]);
} else console.log('Validation only: nothing published.');
