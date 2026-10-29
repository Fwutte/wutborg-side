import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/lotte/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/package.json');
export async function fixture(output, seed, outbound) {
  const entry = path.join(output, 'upgrade-fixture.mjs');
  await fs.writeFile(entry, "import assets from './runtime-lib/assets.mjs';import {createHandler} from './runtime-lib/handler.mjs';import {cms} from './runtime-lib/cms.mjs';const handler=createHandler(assets,{cms});export default {fetch(request,env){return handler({request,env});}};");
  const bundled = path.join(output, 'upgrade-fixture-worker.mjs');
  await require('esbuild').build({ entryPoints: [entry], outfile: bundled, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', external: ['node:*'] });
  const issuer = 'https://admin-upgrade-test.cloudflareaccess.com';
  const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'test', alg: 'RS256', use: 'sig' };
  const now = Math.floor(Date.now()/1000), encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const message = encode({ kid: 'test', alg: 'RS256' }) + '.' + encode({ iss: issuer, aud: ['admin-upgrade'], email: 'owner@example.com', sub: 'owner', type: 'app', iat: now-5, exp: now+36000 });
  const token = message + '.' + Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(message))).toString('base64url');
  const worker = new (require('miniflare').Miniflare)({ modules: true, modulesRoot: output, scriptPath: bundled, compatibilityDate: '2026-06-01', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], r2Buckets: ['OENSKELANDET_MEDIA'], bindings: { PRIVATE_PREVIEW_ISSUER: issuer, PRIVATE_PREVIEW_AUDIENCE: 'admin-upgrade', PRIVATE_PREVIEW_EMAILS: 'owner@example.com', OENSKELANDET_ADMIN_EMAILS: 'owner@example.com' }, outboundService: async request => request.url.startsWith(issuer+'/') ? Response.json({ keys: [jwk] }) : outbound ? outbound(request) : new Response('Unavailable in isolated preview', { status: 502 }) });
  const db = await worker.getD1Database('DB');
  const schema = await fs.readFile(new URL('./cms-schema.sql', import.meta.url), 'utf8');
  await db.batch(schema.split(';').map(sql=>sql.trim()).filter(Boolean).map(sql=>db.prepare(sql)));
  const rendering = await fs.readFile(path.join(output, 'cms-initial-public.json'), 'utf8');
  await db.prepare('INSERT INTO oenskelandet_cms_state (id,revision,state_json,public_json) VALUES(1,?,?,?)').bind(seed.revision, JSON.stringify(seed), rendering).run();
  await db.prepare("INSERT INTO oenskelandet_cms_usage (id,value) VALUES('r2-storage',0)").run();
  return { worker, db, token, dispose:()=>worker.dispose() };
}
