import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const issuer = 'https://super-shadow-c7e6.cloudflareaccess.com';
const audience = '5ba625328a13cdb9e9bde5b76debbea6948d2a5b9ae7672fb62c7a93947f6900';
const deployment = process.argv.find(arg => /^https:\/\/[a-f0-9]+\.wutborg-side\.pages\.dev$/.test(arg));
assert.match(deployment || '', /^https:\/\/[a-f0-9]+\.wutborg-side\.pages\.dev$/);
let checks = 0;
for (const suffix of ['', '/', '/vuggestue', '/boernehave', '/praktisk/aabningstider', '/vuggestue?preview=1', '/index.html', '/styles.css', '/app.js', '/content.js', '/api/content', '/data/content-state.json', '/admin', '/admin/', '/admin/admin.js', '/admin/admin.css', '/admin/editor.js', '/api/admin/media-info', '/api/admin/media-update', '/api/admin/media-import', '/api/admin/media-trash', '/api/admin/media-purge', '/api/admin/session', '/api/admin/state', '/api/admin/usage', '/api/admin/upload']) {
  const url = 'https://wutborg.dk/oenskelandet' + suffix;
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 302, url);
  const login = new URL(response.headers.get('location'), url);
  assert.equal(login.origin, issuer, url);
  assert.equal(login.searchParams.get('kid'), audience, url);
  await response.body?.cancel();
  checks++;
}
for (const host of [deployment, 'https://wutborg-side.pages.dev']) {
  for (const suffix of ['/', '/vuggestue', '/boernehave', '/praktisk/aabningstider', '/app.js', '/api/content', '/admin/', '/api/admin/state', '/uploads/missing.png']) {
    const response = await fetch(host + '/oenskelandet' + suffix, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 404, host + suffix);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.ok(response.headers.get('cache-control').includes('no-store'));
    assert.ok(response.headers.get('x-robots-tag').includes('noindex'));
    assert.equal(await response.text(), 'Not found');
    checks++;
  }
}
const home = await fetch('https://wutborg.dk/', { redirect: 'manual', signal: AbortSignal.timeout(15000) });
assert.equal(home.status, 200);
const html = await home.text();
assert.equal(/oenskeland|ønskeland/i.test(html), false);
const hash = value => createHash('sha256').update(value).digest('hex');
// Cloudflare rewrites existing mailto links and inserts its email decoder in transit.
const email = encoded => {
  const bytes = Buffer.from(encoded, 'hex');
  return Buffer.from(bytes.subarray(1).map(byte => byte ^ bytes[0])).toString('utf8');
};
const normalize = text => text
  .replace(/\/cdn-cgi\/l\/email-protection#([a-f0-9]+)/gi, (_, value) => 'mailto:' + email(value))
  .replace(/<span class="__cf_email__" data-cfemail="([a-f0-9]+)">[\s\S]*?<\/span>/gi, (_, value) => email(value))
  .replace(/<script\b[^>]*src="\/cdn-cgi\/scripts\/[^\"]+\/cloudflare-static\/email-decode\.min\.js"[^>]*><\/script>/g, '');
const expected = await fs.readFile(new URL('../../index.html', import.meta.url), 'utf8');
assert.equal(hash(normalize(html)), hash(expected));
checks++;
console.log(JSON.stringify({ liveChecksPassed: checks, emailLoginRequired: true, alternateHostsBlocked: true, noReferenceOnHomepage: true }));
