export function mediaReferences(state, url) {
  const scan = model => {
    const uses = []; const contains = value => JSON.stringify(value ?? '').includes(url);
    for (const page of model.pages || []) if (page.active !== false && contains({ body: page.body, blocks: page.blocks, images: page.images, videos: page.videos })) uses.push({ id: page.id, label: page.navigationLabel || page.heading || 'Forsiden' });
    for (const person of model.people || []) if (person.active !== false && contains({ image: person.image, sourceHtml: person.sourceHtml })) for (const id of person.pages) if (!uses.some(use => use.id === id)) uses.push({ id, label: model.pages.find(page => page.id === id)?.navigationLabel || id });
    for (const doc of model.documents || []) if (doc.active !== false && doc.url === url) for (const id of doc.pages) if (!uses.some(use => use.id === id)) uses.push({ id, label: model.pages.find(page => page.id === id)?.navigationLabel || id });
    if (contains(model.home)) uses.push({ id: '', label: 'Forsiden' });
    if (contains(model.shared)) uses.push({ id: null, label: 'Fælles oplysninger' });
    if (contains(model.settings)) uses.push({ id: null, label: 'Logo eller fælles oplysninger' });
    return uses;
  };
  return { draft: scan(state.draft), published: scan(state.published) };
}

export async function mediaLibrary({ name, data, env, state, fail, json, upload, reserve }) {
  const db = env.DB;
  if (name === 'api/admin/media-import') {
    let source; try { source = new URL(data.url); } catch { throw fail('Filadressen er ugyldig.'); }
    const allowed = url => url.protocol === 'https:' && ['onskelandet.dk', 'www.onskelandet.dk'].includes(url.hostname) && !url.port && !url.username && !url.password && url.pathname.startsWith('/wp-content/uploads/');
    if (!allowed(source)) throw fail('Egne kopier kan kun hentes fra Ønskelandets oprindelige mediebibliotek.');
    const existing = await db.prepare("SELECT record_json FROM oenskelandet_cms_media WHERE json_extract(record_json, '$.sourceUrl') = ? AND json_extract(record_json, '$.trashedAt') IS NULL LIMIT 1").bind(source.href).first();
    if (existing) return json(JSON.parse(existing.record_json));
    let address = source, response;
    for (let redirects = 0; redirects < 4; redirects++) {
      response = await fetch(address.href, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
      if (response.status >= 300 && response.status < 400) {
        const target = new URL(response.headers.get('location'), address); await response.body?.cancel();
        if (!allowed(target)) throw fail('Mediets viderestilling er ikke tilladt.'); address = target; continue;
      }
      break;
    }
    if (!response.ok) { await response.body?.cancel(); throw fail('Den oprindelige fil kunne ikke hentes.', 502); }
    let body = response.body, length = Number(response.headers.get('content-length'));
    const svg = /\.svg$/i.test(address.pathname);
    if (!length || svg) {
      const reader = body.getReader(), chunks = []; let size = 0;
      for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > (svg ? 1000000 : 10000000)) { await reader.cancel(); throw fail('Denne fil skal uploades direkte fra din computer på grund af størrelsen.', 413); } chunks.push(part.value); }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      body = bytes; length = size;
      if (svg) {
        const sourceText = new TextDecoder().decode(bytes).replace(/<\?xml[^>]*>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[^>[\]]*(?:\[[\s\S]*?\])?\s*>/gi,'').trim();
        const checked = sourceText.replace(/url\s*\(\s*(['"]?)#[a-zA-Z0-9_-]+\1\s*\)/g,'');
        if (!sourceText.startsWith('<svg') || /<!|<\s*(script|foreignObject|iframe|image|use|animate|set)\b|\bon[a-z]+\s*=|\b(?:href|xlink:href)\s*=|url\s*\(|@import|expression\s*\(|javascript\s*:|behavior\s*:/i.test(checked)) throw fail('SVG-logoet indeholder funktioner, som ikke kan importeres sikkert.');
        body = new TextEncoder().encode(sourceText); length = body.length;
      }
    }
    if (!Number.isSafeInteger(length) || length < 1 || length > 100000000) { await response.body?.cancel(); throw fail('Mediet er større end den tilladte grænse på 100 MB.', 413); }
    const request = new Request('https://wutborg.dk/oenskelandet/api/admin/upload', { method: 'POST', headers: { 'content-length': String(length), 'x-file-name': encodeURIComponent(decodeURIComponent(source.pathname.split('/').pop())) }, body, duplex: 'half' });
    const uploaded = await upload(env, request, svg);
    if (!uploaded.ok) return uploaded;
    const file = await uploaded.json(); file.url = file.url.replace('/oenskelandet/uploads/', '/uploads/'); file.sourceUrl = source.href;
    await db.prepare('UPDATE oenskelandet_cms_media SET record_json = ? WHERE id = ?').bind(JSON.stringify(file), file.id).run();
    return json(file, 201);
  }
  const row = await db.prepare('SELECT record_json FROM oenskelandet_cms_media WHERE id = ?').bind(data.id || '').first();
  if (!row) throw fail('Filen blev ikke fundet.', 404);
  const file = JSON.parse(row.record_json), refs = mediaReferences(state, file.url);
  if (file.deletedAt) throw fail('Filen er slettet permanent.', 404);
  if (file.purgingAt && name !== 'api/admin/media-purge' && name !== 'api/admin/media-info') throw fail('Filen er ved at blive slettet.', 409);
  if (name === 'api/admin/media-info') return json({ file, ...refs });
  const next = { ...file };
  if (name === 'api/admin/media-update') {
    if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 200 || typeof data.alt !== 'string' || data.alt.length > 1000) throw fail('Angiv et filnavn og en billedbeskrivelse på højst 1.000 tegn.');
    next.name = data.name.trim(); next.alt = data.alt;
  } else if (name === 'api/admin/media-trash') {
    if (refs.draft.length || refs.published.length) throw fail('Filen bruges stadig på en side eller i en kladde og kan ikke lægges i papirkurven.', 409);
    next.trashedAt = new Date().toISOString();
  } else if (name === 'api/admin/media-restore') delete next.trashedAt;
  else if (name === 'api/admin/media-purge') {
    if (!file.trashedAt || Date.now() - Date.parse(file.trashedAt) < 7 * 86400000) throw fail('Filer kan først slettes permanent efter syv dage i papirkurven.', 409);
    if (refs.draft.length || refs.published.length) throw fail('Filen bruges stadig.', 409);
    const history = (await db.prepare('SELECT state_json FROM oenskelandet_cms_history').all()).results;
    if (history.some(item => { const refs = mediaReferences(JSON.parse(item.state_json), file.url); return refs.draft.length || refs.published.length; })) throw fail('Filen bruges af en bevaret version i historikken og skal bevares.', 409);
    await reserve(db, 'r2-write:' + new Date().toISOString().slice(0, 7), 1, 50000);
    const claimed = JSON.stringify({ ...file, purgingAt: new Date().toISOString() });
    const lock = await db.prepare("UPDATE oenskelandet_cms_media SET record_json = ? WHERE id = ? AND record_json = ? AND NOT EXISTS (SELECT 1 FROM oenskelandet_cms_state WHERE instr(json_remove(state_json, '$.draft.mediaDescriptions', '$.published.mediaDescriptions'), ?) > 0) AND NOT EXISTS (SELECT 1 FROM oenskelandet_cms_history WHERE instr(json_remove(state_json, '$.draft.mediaDescriptions', '$.published.mediaDescriptions'), ?) > 0)").bind(claimed, file.id, row.record_json, file.url, file.url).run();
    if (lock.meta.changes !== 1) throw fail('Filen eller dens anvendelse er ændret. Genindlæs biblioteket.', 409);
    try { await env.OENSKELANDET_MEDIA.delete(file.id); }
    catch (error) { await db.prepare('UPDATE oenskelandet_cms_media SET record_json = ? WHERE id = ? AND record_json = ?').bind(row.record_json, file.id, claimed).run(); throw error; }
    await db.batch([
      db.prepare("UPDATE oenskelandet_cms_usage SET value = MAX(0, value - ?) WHERE id = 'r2-storage' AND EXISTS (SELECT 1 FROM oenskelandet_cms_media WHERE id = ? AND record_json = ?)").bind(file.size, file.id, claimed),
      db.prepare('UPDATE oenskelandet_cms_media SET record_json = ? WHERE id = ? AND record_json = ?').bind(JSON.stringify({ ...file, size: 0, deletedAt: new Date().toISOString() }), file.id, claimed),
    ]);
    return json({ deleted: true });
  } else throw fail('Filhandlingen blev ikke fundet.', 404);
  const result = await db.prepare('UPDATE oenskelandet_cms_media SET record_json = ? WHERE id = ? AND record_json = ?').bind(JSON.stringify(next), file.id, row.record_json).run();
  if (result.meta.changes !== 1) throw fail('En anden fane har ændret filen. Genindlæs biblioteket.', 409);
  return json(next);
}
