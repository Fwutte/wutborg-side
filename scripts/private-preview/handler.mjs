import { authenticate } from './access.mjs';

const prefix = '/oenskelandet';
const headers = {
  'cache-control': 'private, no-store, max-age=0',
  'x-robots-tag': 'noindex, nofollow, noarchive, nosnippet',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
};
const reply = (body, status = 200, extra = {}) => new Response(body, { status, headers: { ...headers, ...extra } });

export function createHandler(assets, { cms } = {}) {
  return async function onRequest({ request, env }) {
    const url = new URL(request.url);
    // Reject alternate hosts and independently validate Cloudflare's signed login.
    if (url.protocol !== 'https:' || url.hostname !== 'wutborg.dk') return reply('Not found', 404);
    const identity = await authenticate(request, env);
    if (!identity) return reply('Not found', 404);
    if (url.pathname === prefix) return reply(null, 302, { location: prefix + '/' + url.search });
    if (!url.pathname.startsWith(prefix + '/')) return reply('Not found', 404);
    const pagePath = id => /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/.test(id) && !['api', 'admin', 'uploads', 'data', 'runtime-lib'].includes(id.split('/')[0]);
    let name = url.pathname.slice(prefix.length + 1) || 'index.html';
    if (name === 'index.html' && url.searchParams.has('side') && ['GET', 'HEAD'].includes(request.method)) {
      const id = url.searchParams.get('side');
      if (id && !pagePath(id)) return reply('Not found', 404);
      url.searchParams.delete('side');
      return reply(null, 302, { location: prefix + '/' + id + url.search });
    }
    const candidate = name.replace(/\/$/, '');
    const pageId = cms && pagePath(candidate) && !Object.hasOwn(assets, name) ? candidate : null;
    if (cms) {
      try {
        const response = await cms({ request, env, identity, name, pageId });
        if (response) return response;
      } catch {
        return reply(JSON.stringify({ error: 'Handlingen kunne ikke gennemføres. Prøv igen.' }), 500, { 'content-type': 'application/json; charset=utf-8' });
      }
    }
    if (!['GET', 'HEAD'].includes(request.method)) return reply('Method not allowed', 405, { allow: 'GET, HEAD' });
    if (pageId) {
      if (name.endsWith('/')) return reply(null, 302, { location: prefix + '/' + pageId + url.search });
      name = 'index.html';
    }
    const asset = Object.hasOwn(assets, name) && assets[name];
    if (!asset) return reply('Not found', 404);
    const body = asset.base64 ? Uint8Array.from(atob(asset.body), ch => ch.charCodeAt(0)) : asset.body;
    const extra = { 'content-type': asset.type };
    if (cms && name === 'index.html' && url.searchParams.get('preview') === '1') extra['x-frame-options'] = 'SAMEORIGIN';
    if (name.startsWith('admin/')) extra['content-security-policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; media-src 'self' https:; frame-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
    return reply(request.method === 'HEAD' ? null : body, 200, extra);
  };
}
