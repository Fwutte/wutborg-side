import { publicContent, validateModel, upgradeModel } from './model.mjs';
import { mediaLibrary } from './media-library.mjs';

const base = '/oenskelandet/';
const maximumUpload = 100000000;
const storageLimit = 1000000000;
const monthlyReadLimit = 500000;
const monthlyWriteLimit = 50000;
const monthKey = () => new Date().toISOString().slice(0, 7);
async function reserve(db, id, amount, limit) {
  if (amount <= 0 || amount > limit) throw fail('Løsningens sikkerhedsgrænse for gratis forbrug er nået. Kontakt os, før grænsen ændres.', 429);
  const result = await db.prepare('INSERT INTO oenskelandet_cms_usage (id, value) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value = value + excluded.value WHERE value + excluded.value <= ?').bind(id, amount, limit).run();
  if (result.meta.changes !== 1) throw fail('Løsningens sikkerhedsgrænse for gratis forbrug er nået. Nye uploads eller filvisninger er stoppet, før grænsen overskrides.', 429);
}
async function release(db, id, amount) {
  await db.prepare('UPDATE oenskelandet_cms_usage SET value = MAX(0, value - ?) WHERE id = ?').bind(amount, id).run();
}
async function usage(db) {
  const rows = (await db.prepare('SELECT id, value FROM oenskelandet_cms_usage WHERE id IN (?, ?, ?, ?)').bind('r2-storage', 'r2-read:' + monthKey(), 'r2-write:' + monthKey(), 'changes:' + new Date().toISOString().slice(0, 10)).all()).results;
  const get = id => rows.find(row => row.id === id)?.value || 0;
  const metrics = [
    { label: 'Filer i lageret', used: get('r2-storage'), limit: storageLimit, unit: 'bytes' },
    { label: 'Filvisninger denne måned', used: get('r2-read:' + monthKey()), limit: monthlyReadLimit, unit: 'requests' },
    { label: 'Filhandlinger denne måned', used: get('r2-write:' + monthKey()), limit: monthlyWriteLimit, unit: 'requests' },
    { label: 'Gemninger i dag', used: get('changes:' + new Date().toISOString().slice(0, 10)), limit: 1000, unit: 'requests' },
  ];
  return { metrics, warning: metrics.some(metric => metric.used >= metric.limit * 0.8), note: 'Løsningens egne stopgrænser ligger under Cloudflares inkluderede gratis grænser. Måleren dækker kun denne løsning.' };
}
const security = { 'cache-control': 'private, no-store, max-age=0', 'x-robots-tag': 'noindex, nofollow, noarchive, nosnippet', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY' };
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const relocate = text => text.replace(/(?<![A-Za-z0-9/_-])\/uploads\//g, base + 'uploads/');
const json = (data, status = 200, headers = {}) => new Response(relocate(JSON.stringify(data)), { status, headers: { ...security, 'content-type': 'application/json; charset=utf-8', ...headers } });
const cookieName = 'oenskelandet_online';
const cookieValue = request => (request.headers.get('cookie') || '').split(';').map(value => value.trim()).find(value => value.startsWith(cookieName + '='))?.slice(cookieName.length + 1) || '';
const cookieHeader = (value, age = 28800) => `${cookieName}=${value}; Path=${base}; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
const subject = async identity => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity.iss + ':' + identity.sub))), byte => byte.toString(16).padStart(2, '0')).join('');
const load = async db => {
  const row = await db.prepare('SELECT state_json FROM oenskelandet_cms_state WHERE id = 1').first();
  if (!row) throw fail('Indholdslageret er ikke klargjort endnu.', 503);
  const state = JSON.parse(row.state_json);
  return { ...state, draft: upgradeModel(state.draft), published: upgradeModel(state.published) };
};
const loadPublic = async db => {
  const row = await db.prepare('SELECT public_json FROM oenskelandet_cms_state WHERE id = 1').first();
  if (!row) throw fail('Indholdslageret er ikke klargjort endnu.', 503);
  return JSON.parse(row.public_json);
};
const media = async db => (await db.prepare('SELECT record_json FROM oenskelandet_cms_media ORDER BY created_at DESC').all()).results.map(row => JSON.parse(row.record_json));
async function session(db, request, identity) {
  const id = cookieValue(request);
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  return await db.prepare('SELECT id, csrf FROM oenskelandet_cms_sessions WHERE id = ? AND subject = ? AND expires_at > ?').bind(id, await subject(identity), Date.now()).first();
}
async function input(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw fail('Brug JSON til denne handling.', 415);
  if (!request.body) throw fail('Handlingen mangler indhold.');
  const reader = request.body.getReader(); const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length; if (size > 1000000) { await reader.cancel(); throw fail('Indholdet fylder for meget.', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes).replaceAll(base + 'uploads/', '/uploads/')); }
  catch { throw fail('Indholdet kunne ikke læses.'); }
}
async function change(db, action, data) {
  const state = await load(db);
  if (data.expectedRevision !== state.revision) throw fail('En anden fane har gemt ændringer. Genindlæs indholdet, før du gemmer igen.', 409);
  await reserve(db, 'changes:' + new Date().toISOString().slice(0, 10), 1, 1000);
  const next = structuredClone(state);
  try {
    if (action === 'save') next.draft = validateModel(data.model);
    else if (action === 'publish') {
      if (data.model) next.draft = validateModel(data.model);
      next.published = structuredClone(next.draft); next.publishedRevision = next.revision + 1; next.publishedAt = new Date().toISOString();
    } else if (action === 'restore') {
      if (!/^[a-zA-Z0-9_.-]+\.json$/.test(data.historyId || '')) throw fail('Versionen er ugyldig.');
      const old = await db.prepare('SELECT state_json FROM oenskelandet_cms_history WHERE id = ?').bind(data.historyId).first();
      if (!old) throw fail('Versionen blev ikke fundet.', 404);
      next.draft = validateModel(JSON.parse(old.state_json).draft);
    } else throw fail('Handlingen blev ikke fundet.', 404);
  } catch (error) { if (error.status) throw error; throw fail(error.message || 'Indholdet er ugyldigt.'); }
  next.revision++; next.updatedAt = new Date().toISOString();
  const serialized = JSON.stringify(next);
  const references = JSON.stringify({ draft: { ...next.draft, mediaDescriptions: undefined }, published: { ...next.published, mediaDescriptions: undefined } });
  if (new TextEncoder().encode(serialized).length > 1200000) throw fail('Indholdet fylder for meget. Fjern unødvendig tekst eller brug filer fra mediebiblioteket.', 413);
  const rendered = action === 'publish' ? JSON.stringify(publicContent(next.published, next.publishedRevision, { validated: true })) : null;
  // D1 batches are atomic. Both statements use the same revision condition.
  const results = await db.batch([
    db.prepare("INSERT INTO oenskelandet_cms_history (id, revision, created_at, action, state_json) SELECT ?, revision, ?, ?, state_json FROM oenskelandet_cms_state WHERE id = 1 AND revision = ? AND NOT EXISTS (SELECT 1 FROM oenskelandet_cms_media WHERE (json_extract(record_json, '$.purgingAt') IS NOT NULL OR json_extract(record_json, '$.deletedAt') IS NOT NULL) AND instr(?, json_extract(record_json, '$.url')) > 0)").bind(Date.now() + '-' + crypto.randomUUID() + '.json', next.updatedAt, action, state.revision, references),
    db.prepare("UPDATE oenskelandet_cms_state SET revision = ?, state_json = ?, public_json = COALESCE(?, public_json) WHERE id = 1 AND revision = ? AND NOT EXISTS (SELECT 1 FROM oenskelandet_cms_media WHERE (json_extract(record_json, '$.purgingAt') IS NOT NULL OR json_extract(record_json, '$.deletedAt') IS NOT NULL) AND instr(?, json_extract(record_json, '$.url')) > 0)").bind(next.revision, serialized, rendered, state.revision, references),
  ]);
  if (results[1].meta.changes !== 1) throw fail('En anden fane har gemt ændringer. Genindlæs indholdet, før du gemmer igen.', 409);
  await db.prepare('DELETE FROM oenskelandet_cms_history WHERE id NOT IN (SELECT id FROM oenskelandet_cms_history ORDER BY created_at DESC LIMIT 50)').run();
  return next;
}
const types = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm', svg: 'image/svg+xml' };
function sniff(bytes) {
  const text = new TextDecoder('latin1').decode(bytes);
  if (bytes[0] === 137 && text.slice(1, 4) === 'PNG') return 'png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (text.startsWith('GIF87a') || text.startsWith('GIF89a')) return 'gif';
  if (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP') return 'webp';
  if (text.startsWith('%PDF-')) return 'pdf';
  if (text.slice(4, 8) === 'ftyp') return 'mp4';
  if (bytes[0] === 26 && bytes[1] === 69 && bytes[2] === 223 && bytes[3] === 163) return 'webm';
  return null;
}
async function upload(env, request, trustedSvg = false) {
  if (!env.OENSKELANDET_MEDIA) throw fail('Upload er endnu ikke aktiveret.', 503);
  const length = Number(request.headers.get('content-length'));
  if (!Number.isSafeInteger(length) || length <= 0 || length > maximumUpload) throw fail('Filen skal være mellem 1 byte og 100 MB.', 413);
  const reader = request.body?.getReader(); if (!reader) throw fail('Filen er tom.');
  const initial = []; const header = new Uint8Array(16); let headerSize = 0, size = 0;
  while (headerSize < 16) {
    const { done, value } = await reader.read(); if (done) break;
    initial.push(value); size += value.length;
    const part = value.subarray(0, 16 - headerSize); header.set(part, headerSize); headerSize += part.length;
    if (size > length) { await reader.cancel(); throw fail('Filstørrelsen er ugyldig.'); }
  }
  const extension = trustedSvg && new TextDecoder().decode(header).startsWith('<svg') ? 'svg' : sniff(header.subarray(0, headerSize));
  if (!extension) { await reader.cancel(); throw fail('Vælg et billede, en PDF eller en video i et understøttet format.', 415); }
  const name = `${crypto.randomUUID()}.${extension}`;
  try {
    await reserve(env.DB, 'r2-write:' + monthKey(), 5, monthlyWriteLimit);
    await reserve(env.DB, 'r2-storage', length, storageLimit);
  } catch (error) { await reader.cancel(); throw error; }
  const stream = new ReadableStream({
    start(controller) { for (const chunk of initial) controller.enqueue(chunk); },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) { if (size !== length) controller.error(new Error('Invalid size')); else controller.close(); return; }
      size += value.length;
      if (size > length || size > maximumUpload) { await reader.cancel(); controller.error(new Error('Invalid size')); return; }
      controller.enqueue(value);
    }, cancel(reason) { return reader.cancel(reason); },
  });
  const fixed = new FixedLengthStream(length);
  const pipe = stream.pipeTo(fixed.writable);
  try {
    await Promise.all([env.OENSKELANDET_MEDIA.put(name, fixed.readable, { httpMetadata: { contentType: types[extension], cacheControl: 'private, no-store' } }), pipe]);
  } catch (error) { await env.OENSKELANDET_MEDIA.delete(name); await release(env.DB, 'r2-storage', length); throw error; }
  let original; try { original = decodeURIComponent(request.headers.get('x-file-name') || 'Fil'); } catch { original = 'Fil'; }
  const record = { id: name, name: original.replace(/[\r\n\x00-\x1f]/g, '').slice(0, 200), url: '/uploads/' + name, type: types[extension], size: length, createdAt: new Date().toISOString() };
  try {
    await env.DB.prepare('INSERT INTO oenskelandet_cms_media (id, created_at, record_json) VALUES (?, ?, ?)').bind(name, record.createdAt, JSON.stringify(record)).run();
  } catch (error) { await env.OENSKELANDET_MEDIA.delete(name); await release(env.DB, 'r2-storage', length); throw error; }
  return json(record, 201);
}

export async function cms({ request, env, identity, name, pageId = null }) {
  try {
    const url = new URL(request.url);
    const admin = String(env.OENSKELANDET_ADMIN_EMAILS || '').toLowerCase().split(/[\s,;]+/).filter(Boolean).includes(identity.email.toLowerCase());
    const preview = url.searchParams.get('preview') === '1';
    const adminRoute = name === 'admin' || name.startsWith('admin/') || name.startsWith('api/admin/') || preview;
    if (adminRoute && !admin) throw fail('Du har ikke adgang til administrationen.', 403);
    if (!env.DB) throw fail('Indholdslageret er ikke tilgængeligt.', 503);
    const write = !['GET', 'HEAD'].includes(request.method);
    if (write && (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin')) throw fail('Handlingen skal udføres fra administrationen.', 403);
    if (name === 'api/admin/session' && request.method === 'GET') {
      let active = await session(env.DB, request, identity); let headers = {};
      if (!active) {
        active = { id: crypto.randomUUID(), csrf: crypto.randomUUID() };
        await env.DB.batch([
          env.DB.prepare('DELETE FROM oenskelandet_cms_sessions WHERE expires_at <= ?').bind(Date.now()),
          env.DB.prepare('INSERT INTO oenskelandet_cms_sessions (id, subject, csrf, expires_at) VALUES (?, ?, ?, ?)').bind(active.id, await subject(identity), active.csrf, Date.now() + 8 * 3600000),
        ]);
        headers['set-cookie'] = cookieHeader(active.id);
      }
      return json({ authenticated: true, localMode: false, csrf: active.csrf, online: true, uploadsEnabled: !!env.OENSKELANDET_MEDIA }, 200, headers);
    }
    if (name.startsWith('api/admin/')) {
      const active = await session(env.DB, request, identity);
      if (!active) throw fail('Genindlæs administrationen for at fortsætte.', 401);
      if (write && request.headers.get('x-csrf-token') !== active.csrf) throw fail('Sikkerhedstokenet er udløbet. Genindlæs administrationen.', 403);
      if (name.startsWith('api/admin/media-') && request.method === 'POST') return await mediaLibrary({ name, data: await input(request), env, state: await load(env.DB), fail, json, upload, reserve });
      if (name === 'api/admin/state' && request.method === 'GET') return json({ ...await load(env.DB), media: await media(env.DB), usage: await usage(env.DB) });
      if (name === 'api/admin/usage' && request.method === 'GET') return json(await usage(env.DB));
      if (name === 'api/admin/history' && request.method === 'GET') return json((await env.DB.prepare('SELECT id, revision, created_at AS createdAt, action FROM oenskelandet_cms_history ORDER BY created_at DESC LIMIT 100').all()).results);
      if (name === 'api/admin/logout' && request.method === 'POST') {
        await env.DB.prepare('DELETE FROM oenskelandet_cms_sessions WHERE id = ?').bind(active.id).run();
        return json({ ok: true }, 200, { 'set-cookie': cookieHeader('', 0) });
      }
      if (['api/admin/save', 'api/admin/publish', 'api/admin/restore'].includes(name) && request.method === 'POST') return json({ ...await change(env.DB, name.split('/').at(-1), await input(request)), media: await media(env.DB), usage: await usage(env.DB) });
      if (name === 'api/admin/upload' && request.method === 'POST') return await upload(env, request);
      throw fail('Handlingen blev ikke fundet.', 404);
    }
    if (name === 'api/content' && request.method === 'GET') {
      if (!preview) return json(await loadPublic(env.DB));
      const state = await load(env.DB);
      return json(publicContent(state.draft, state.revision, { preview: true }));
    }
    if (name === 'admin' && request.method === 'GET') return new Response(null, { status: 302, headers: { ...security, location: base + 'admin/' } });
    if (name.startsWith('uploads/') && ['GET', 'HEAD'].includes(request.method)) {
      const id = name.slice('uploads/'.length);
      if (!/^[a-zA-Z0-9_-]+\.(png|jpg|gif|webp|pdf|mp4|webm|svg)$/.test(id) || !env.OENSKELANDET_MEDIA) throw fail('Filen blev ikke fundet.', 404);
      if (!admin && !JSON.stringify(await loadPublic(env.DB)).includes('/uploads/' + id)) throw fail('Filen blev ikke fundet.', 404);
      await reserve(env.DB, 'r2-read:' + monthKey(), 1, monthlyReadLimit);
      const object = await env.OENSKELANDET_MEDIA.get(id, { range: request.headers });
      if (!object) throw fail('Filen blev ikke fundet.', 404);
      const headers = new Headers(security); object.writeHttpMetadata(headers);
      headers.set('cache-control', 'private, no-store'); headers.set('etag', object.httpEtag); headers.set('accept-ranges', 'bytes');
      if (id.endsWith('.svg')) headers.set('content-security-policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'");
      let status = 200;
      if (request.headers.has('range') && object.range) {
        const offset = object.range.offset ?? object.size - object.range.suffix;
        const length = object.range.length ?? object.size - offset;
        headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`); headers.set('content-length', String(length)); status = 206;
      } else headers.set('content-length', String(object.size));
      return new Response(request.method === 'HEAD' ? null : object.body, { status, headers });
    }
    if (pageId) {
      const snapshot = preview ? publicContent((await load(env.DB)).draft, 0, { preview: true }) : await loadPublic(env.DB);
      const page = snapshot.pages.find(page => (page.id === pageId || page.aliases?.includes(pageId)) && page.active !== false);
      if (!page) throw fail('Siden blev ikke fundet.', 404);
      if (page.id !== pageId) return new Response(null, { status: 302, headers: { ...security, location: base + page.id + url.search } });
    }
    if (preview && name === 'index.html') await load(env.DB);
    return null;
  } catch (error) {
    return json({ error: error.status ? error.message : 'Handlingen kunne ikke gennemføres. Prøv igen.' }, error.status || 500);
  }
}
