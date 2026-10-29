import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire('C:/Users/lotte/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/package.json');
const { Miniflare } = require('miniflare');
const issuer = 'https://worker-test.cloudflareaccess.com';
const env = { PRIVATE_PREVIEW_ISSUER: issuer, PRIVATE_PREVIEW_AUDIENCE: 'worker-app', PRIVATE_PREVIEW_EMAILS: 'reviewer@example.com' };
const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'worker-test', use: 'sig', alg: 'RS256' };
const now = Math.floor(Date.now() / 1000);
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
async function sign(changes = {}) {
  const message = encode({ alg: 'RS256', kid: 'worker-test' }) + '.' + encode({ iss: issuer, aud: ['worker-app'], iat: now - 5, exp: now + 3600, email: 'reviewer@example.com', sub: 'reviewer', type: 'app', ...changes });
  return message + '.' + Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(message))).toString('base64url');
}
const token = await sign();
const source = await fs.readFile(new URL('./access.mjs', import.meta.url), 'utf8') + '\n' + (await fs.readFile(new URL('./handler.mjs', import.meta.url), 'utf8')).replace("import { authenticate } from './access.mjs';", '');
const worker = new Miniflare({
  modules: true, compatibilityDate: '2026-06-01',
  script: source + '\nconst handler=createHandler({"index.html":{type:"text/html",body:"<h1>Presentation</h1>"},"api/content":{type:"application/json",body:"{}"}});export default {fetch(request,env){return handler({request,env});}};',
  bindings: env,
  outboundService: async () => Response.json({ keys: [jwk] }),
});
try {
  for (const headers of [{ cookie: 'CF_Authorization=' + token }, { 'Cf-Access-Jwt-Assertion': token }]) {
    const response = await worker.dispatchFetch('https://wutborg.dk/oenskelandet/', { headers });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '<h1>Presentation</h1>');
    assert.ok(response.headers.get('x-robots-tag').includes('noindex'));
  }
  for (const headers of [{}, { cookie: 'CF_Authorization=invalid' }, { 'Cf-Access-Jwt-Assertion': await sign({ email: 'outsider@example.com' }) }, { 'Cf-Access-Jwt-Assertion': await sign({ exp: now - 1 }) }]) {
    assert.equal((await worker.dispatchFetch('https://wutborg.dk/oenskelandet/', { headers })).status, 404);
    assert.equal((await worker.dispatchFetch('https://wutborg.dk/oenskelandet/api/content', { headers })).status, 404);
  }
  assert.equal((await worker.dispatchFetch('https://wutborg.dk/oenskelandet/api/content', { headers: { 'Cf-Access-Jwt-Assertion': token } })).status, 200);
  assert.equal((await worker.dispatchFetch('https://wutborg.dk/oenskelandet/admin')).status, 404);
  assert.equal((await worker.dispatchFetch('https://wutborg-side.pages.dev/oenskelandet/')).status, 404);
  console.log('Workers runtime confirms valid header/cookie login, denial without login and for other identities, noindex and alternate-host isolation.');
} finally { await worker.dispose(); }
