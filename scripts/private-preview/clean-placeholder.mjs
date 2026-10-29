import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = 'C:/Codex/oenskelandet';
const cleanBody = body => body.replace(/<p\b[^>]*>[\s\S]*?<\/p>/gi, paragraph => /lorem\s+ipsum/i.test(paragraph) && /nonexsistmysite\.com/i.test(paragraph) ? '' : paragraph);
function cleanModel(model) {
  let removed = 0;
  for (const page of model.pages) {
    const cleaned = cleanBody(page.body);
    if (cleaned !== page.body) { removed++; page.body = cleaned; }
    if (page.id === '' && !page.body.trim() && model.home) model.home.showSource = false;
  }
  return removed;
}
const mode = process.argv[2];
if (mode === '--local') {
  const filename = path.join(root, 'data/content-state.json');
  const state = JSON.parse(await fs.readFile(filename, 'utf8'));
  const before = structuredClone(state);
  const removedDraft = cleanModel(state.draft), removedPublished = cleanModel(state.published);
  if (removedDraft || removedPublished) {
    const now = new Date().toISOString();
    await fs.writeFile(path.join(root, 'data/history', Date.now() + '-' + crypto.randomUUID() + '.json'), JSON.stringify({ ...before, savedAt: now, action: 'publish' }, null, 2), { flag: 'wx' });
    state.revision++; state.publishedRevision = state.revision; state.updatedAt = now; state.publishedAt = now;
    const temporary = filename + '.' + crypto.randomUUID() + '.tmp';
    await fs.writeFile(temporary, JSON.stringify(state, null, 2)); await fs.rename(temporary, filename);
  }
  const seedPath = path.join(root, 'content.js');
  const text = await fs.readFile(seedPath, 'utf8');
  const pages = JSON.parse(text.replace(/^\s*window\.SITE_CONTENT\s*=\s*/, '').replace(/;\s*$/, ''));
  const seedRemoved = cleanModel({ pages });
  if (seedRemoved) {
    try { await fs.writeFile(seedPath + '.before-placeholder-cleanup', text, { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    await fs.writeFile(seedPath, 'window.SITE_CONTENT=' + JSON.stringify(pages) + ';\n');
  }
  console.log(JSON.stringify({ localDraftParagraphsRemoved: removedDraft, localPublishedParagraphsRemoved: removedPublished, seedParagraphsRemoved: seedRemoved }));
} else if (mode === '--remote' || mode === '--verify') {
  const credentials = await fs.readFile('C:/Users/lotte/AppData/Roaming/xdg.config/.wrangler/config/default.toml', 'utf8');
  const token = credentials.match(/^oauth_token\s*=\s*"([^"\r\n]+)"/m)?.[1];
  if (!token) throw new Error('Existing Cloudflare authorization not found.');
  const url = 'https://api.cloudflare.com/client/v4/accounts/98a6d302d1e0fdbc93ac71aeb0d6606c/d1/database/24fdff5f-cf6a-4cfb-a5c3-534cbde42592/query';
  async function query(body) {
    const response = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    const data = await response.json();
    if (!response.ok || !data.success || data.result.some(result => !result.success)) throw new Error('Content operation failed (HTTP ' + response.status + ').');
    return data.result;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await query({ sql: 'SELECT revision, state_json, public_json FROM oenskelandet_cms_state WHERE id = 1' });
    const row = result[0].results[0]; if (!row) throw new Error('Online content is missing.');
    const state = JSON.parse(row.state_json);
    if (mode === '--verify') {
      const placeholders = /lorem\s+ipsum|nonexsistmysite\.com/i;
      if (placeholders.test(row.public_json) || placeholders.test(JSON.stringify(state.draft))) throw new Error('Placeholder text remains.');
      console.log(JSON.stringify({ verified: true, revision: row.revision, livePlaceholderRemoved: true, draftPlaceholderRemoved: true })); break;
    }
    const removedDraft = cleanModel(state.draft), removedPublished = cleanModel(state.published);
    if (!removedDraft && !removedPublished) { console.log('Online placeholder is already absent; no changes made.'); break; }
    const { publicContent } = await import(pathToFileURL(path.join(root, 'cms/model.mjs')));
    const now = new Date().toISOString(); state.revision++; state.publishedRevision = state.revision; state.updatedAt = now; state.publishedAt = now;
    const rendered = JSON.stringify(publicContent(state.published, state.publishedRevision));
    if (/lorem\s+ipsum|nonexsistmysite\.com/i.test(rendered)) throw new Error('Unexpected remaining placeholder; no update made.');
    const writes = await query({ batch: [
      { sql: 'INSERT INTO oenskelandet_cms_history (id, revision, created_at, action, state_json) SELECT ?, revision, ?, ?, state_json FROM oenskelandet_cms_state WHERE id = 1 AND revision = ?', params: [Date.now() + '-' + crypto.randomUUID() + '.json', now, 'publish', row.revision] },
      { sql: 'UPDATE oenskelandet_cms_state SET revision = ?, state_json = ?, public_json = ? WHERE id = 1 AND revision = ?', params: [state.revision, JSON.stringify(state), rendered, row.revision] },
    ] });
    if (writes[1].meta.changes === 1) { console.log(JSON.stringify({ onlineDraftParagraphsRemoved: removedDraft, onlinePublishedParagraphsRemoved: removedPublished, revision: state.revision, previousVersionPreserved: true })); break; }
    if (attempt === 2) throw new Error('Concurrent edits prevented the cleanup; no changes overwritten.');
  }
} else throw new Error('Use --local, --remote or --verify.');
