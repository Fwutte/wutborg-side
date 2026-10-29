import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { authorized } from './access.mjs';
import { createHandler } from './handler.mjs';

const issuer = 'https://preview-test.cloudflareaccess.com';
const env = { PRIVATE_PREVIEW_ISSUER: issuer, PRIVATE_PREVIEW_AUDIENCE: 'private-demo', PRIVATE_PREVIEW_EMAILS: 'Frederik.wutborg@live.dk' };
const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'test-key', alg: 'RS256' };
const certs = async (url, options) => { assert.equal(url, issuer + '/cdn-cgi/access/certs'); assert.equal(options.redirect, 'manual'); return Response.json({ keys: [jwk] }); };
const now = Math.floor(Date.now() / 1000);
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const claims = { iss: issuer, aud: ['private-demo'], email: 'Frederik.wutborg@live.dk', sub: 'user-1', type: 'app', iat: now - 5, exp: now + 3600 };
async function sign(changes = {}, header = {}) {
  const message = encode({ alg: 'RS256', kid: 'test-key', ...header }) + '.' + encode({ ...claims, ...changes });
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(message));
  return message + '.' + Buffer.from(signature).toString('base64url');
}
const request = (token = '', url = 'https://wutborg.dk/oenskelandet/', method = 'GET') => new Request(url, { method, headers: { 'Cf-Access-Jwt-Assertion': token } });
let checks = 0;
const check = (actual, expected) => { assert.equal(actual, expected); checks++; };
const token = await sign();
check(await authorized(request(token), env, certs), true);
check(await authorized(new Request('https://wutborg.dk/oenskelandet/', { headers: { cookie: 'other=value; CF_Authorization=' + token } }), env, certs), true);
check(await authorized(request(), env, certs), false);
check(await authorized(request(token), {}, certs), false);
check(await authorized(request('invalid'), env, certs), false);
for (const changes of [{ email: 'outsider@example.com' }, { email: undefined }, { iss: 'https://evil.example' }, { aud: ['other-app'] }, { exp: now - 1 }, { exp: undefined }, { iat: now + 60 }, { nbf: now + 60 }, { sub: '' }, { type: 'org' }]) {
  check(await authorized(request(await sign(changes)), env, certs), false);
}
check(await authorized(request(await sign({}, { alg: 'none' })), env, certs), false);
check(await authorized(request(token), env, async () => { throw new Error('offline'); }), false);
check(await authorized(request(token), env, async () => Response.json({ keys: [] })), false);
check(await authorized(request(token), env, async () => new Response(null, { status: 302, headers: { location: 'https://other.example/keys' } })), false);
const forged = token.split('.'); forged[1] = encode({ ...claims, sub: 'forged' });
check(await authorized(request(forged.join('.')), env, certs), false);
const originalFetch = globalThis.fetch;
globalThis.fetch = certs;
try {
  const handler = createHandler({ 'index.html': { type: 'text/html', body: '<h1>Private example</h1>' }, 'api/content': { type: 'application/json', body: '{"private":true}' } });
  check((await handler({ request: request(), env })).status, 404);
  check((await handler({ request: request(token), env: {} })).status, 404);
  check((await handler({ request: new Request('http://wutborg.dk/oenskelandet/'), env })).status, 404);
  check((await handler({ request: request(token, 'https://project.pages.dev/oenskelandet/'), env })).status, 404);
  check((await handler({ request: request(token, 'https://wutborg.dk/oenskelandet/?side=test'), env })).headers.get('location'), '/oenskelandet/test');
  const page = await handler({ request: request(token), env });
  check(page.headers.get('cache-control').includes('no-store'), true);
  check(page.headers.get('referrer-policy'), 'no-referrer');
  check(page.headers.get('x-robots-tag').includes('noindex'), true);
  check((await handler({ request: request(token, 'https://wutborg.dk/oenskelandet/api/content'), env })).status, 200);
  for (const suffix of ['admin', 'api/admin/state', 'data/content-state.json', 'runtime-lib/assets.mjs', 'unknown.css', 'constructor', '__proto__']) {
    check((await handler({ request: request(token, 'https://wutborg.dk/oenskelandet/' + suffix), env })).status, 404);
  }
  check((await handler({ request: request(token, 'https://wutborg.dk/oenskelandet?side=test'), env })).headers.get('location'), '/oenskelandet/?side=test');
  check((await handler({ request: request(token, 'https://wutborg.dk/oenskelandet/', 'POST'), env })).status, 405);
  check(await (await handler({ request: request(token, 'https://wutborg.dk/oenskelandet/', 'HEAD'), env })).text(), '');
  if (process.argv[2]) {
    const output = path.resolve(process.argv[2]);
    const { default: assets } = await import(pathToFileURL(path.join(output, 'runtime-lib/assets.mjs')));
    const real = createHandler(assets);
    for (const filename of Object.keys(assets)) {
      check((await real({ request: request('', 'https://wutborg.dk/oenskelandet/' + filename), env })).status, 404);
      check((await real({ request: request(token, 'https://wutborg.dk/oenskelandet/' + filename), env })).status, 200);
    }
    check(assets['app.js'].body.includes("fetch('/oenskelandet/api/content'"), true);
    check(JSON.parse(assets['api/content'].body).preview, false);
    check(Object.keys(assets).some(name => /content-state|history/.test(name)), false);
    check((await fs.readdir(path.join(output, 'public'))).includes('oenskelandet'), false);
    const publicIndex = await fs.readFile(path.join(output, 'public/index.html'), 'utf8');
    check(/oenskeland|ønskeland/i.test(publicIndex), false);
    // Exercise the real presentation code against the exported CMS snapshot.
    // This is a DOM integration check, not a visual browser test.
    const sourceRequire = createRequire('C:/Codex/oenskelandet/package.json');
    const { parseHTML } = await import(pathToFileURL(sourceRequire.resolve('linkedom')));
    const snapshot = JSON.parse(assets['api/content'].body);
    for (const page of snapshot.pages) for (const mobile of [false, true]) for (const legacy of [false, true]) {
      const { window } = parseHTML(assets['index.html'].body);
      const { document, HTMLElement } = window;
      for (const method of ['focus', 'scrollIntoView', 'pause', 'load']) HTMLElement.prototype[method] = function() {};
      HTMLElement.prototype.play = () => Promise.resolve();
      window.scrollTo = () => {};
      const sandbox = {
        window, document, console, URL, URLSearchParams,
        location: new URL('https://wutborg.dk/oenskelandet/' + (legacy ? '?side=' + encodeURIComponent(page.id) : page.id)),
        matchMedia: query => ({ matches: query === '(max-width:650px)' && mobile }), requestAnimationFrame: fn => fn(),
        DOMParser: class { parseFromString(html) { return parseHTML('<html><head></head><body>' + html + '</body></html>').document; } },
        history: { pushState() {} },
        fetch: async url => { check(url, '/oenskelandet/api/content'); return Response.json(snapshot); },
      };
      const context = vm.createContext(sandbox);
      vm.runInContext(assets['content.js'].body, context);
      await vm.runInContext(assets['app.js'].body, context);
      check(document.querySelector('main h1')?.textContent, page.id ? page.heading : snapshot.home.title);
      check(document.querySelector('.cms-preview-banner'), null);
      check(document.querySelector('nav a')?.getAttribute('href')?.startsWith('/oenskelandet/'), true);
      check(Array.from(document.querySelectorAll('a[href]')).some(a => a.getAttribute('href').startsWith('?side=')), false);
      if (page.id) {
        const toc = document.querySelector('.article-toc');
        check(Boolean(toc), true);
        check(toc.open, !mobile);
        check(Boolean(document.querySelector('.article-main .article-body')), true);
        const anchors = Array.from(toc.querySelectorAll('a[href^="#"]'));
        check(toc.querySelector('summary').textContent.startsWith(anchors.length ? 'På denne side' : 'Flere sider'), true);
        for (const anchor of anchors) check(Boolean(document.getElementById(anchor.getAttribute('href').slice(1))), true);
        if (mobile && anchors.length) {
          toc.open = true;
          anchors[0].dispatchEvent(new window.Event('click', { bubbles: true }));
          check(toc.open, false);
        }
      }
    }
  }
} finally { globalThis.fetch = originalFetch; }
console.log(`${checks} presentation, isolation and email-login checks passed.`);
