import { validateModel as legacyValidate, publicContent as legacyPublic, dom, cleanBody, esc, safeUrl } from './legacy-model.mjs';
export { dom, cleanBody, esc } from './legacy-model.mjs';

export const sharedLabels = { openingHours: 'Åbningstider', closingDays: 'Lukkedage', prices: 'Priser', visit: 'Rundvisning' };
const reserved = new Set(['admin', 'api', 'uploads', 'data', 'runtime-lib', 'index', 'styles', 'app', 'content']);
export const validPageId = id => typeof id === 'string' && /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/.test(id) && !reserved.has(id.split('/')[0]);
const text = (value, limit = 10000) => { if (typeof value !== 'string' || value.length > limit) throw new Error('Et indholdsfelt er ugyldigt eller for langt.'); return value; };
const marker = key => `<div data-cms-shared="${key}"></div>`;
const sharedChanged = record => record && (record.activated || record.title !== record.baselineTitle || record.html !== record.baselineHtml);

export function upgradeModel(input) {
  const model = structuredClone(input);
  if (model.cmsVersion === 2) return model;
  model.cmsVersion = 2;
  model.shared ||= {};
  const record = (key, html, title = sharedLabels[key]) => model.shared[key] ||= { title, html, baselineTitle: title, baselineHtml: html };
  const opening = model.pages.find(page => page.id === 'praktisk/aabningstider');
  if (opening) {
    const nodes = [...dom(opening.body).body.childNodes];
    const cut = nodes.findIndex(node => /^h[234]$/i.test(node.localName || '') && /lukkedage/i.test(node.textContent));
    const before = nodes.slice(0, cut < 0 ? nodes.length : cut).map(node => node.outerHTML ?? node.textContent).join('');
    const after = cut < 0 ? '' : nodes.slice(cut).map(node => node.outerHTML ?? node.textContent).join('');
    record('openingHours', before, ''); record('closingDays', after, '');
    opening.body = marker('openingHours') + marker('closingDays');
  }
  const prices = model.pages.find(page => page.id === 'praktisk/priser');
  if (prices) { record('prices', prices.body, ''); prices.body = marker('prices'); }
  // Keep each existing invitation unchanged until the shared invitation is edited.
  for (const page of model.pages) {
    const document = dom(page.body);
    for (const heading of [...document.querySelectorAll('h2,h3,h4')]) {
      if (!/^Rundvisning$/i.test(heading.textContent.trim()) && !/Vi vil rigtig gerne vise jer rundt i Børnehuset/i.test(heading.textContent)) continue;
      let html = heading.outerHTML;
      const next = heading.nextElementSibling;
      if (next?.localName === 'p' && /Vi vil rigtig gerne vise jer rundt/i.test(next.textContent)) { html += next.outerHTML; next.remove(); }
      if (!model.shared.visit) {
        const content = dom(html); content.querySelector('h2,h3,h4')?.remove();
        const body = content.body.innerHTML.trim() || `<p>${esc(heading.textContent.trim())}</p>`;
        record('visit', body, /^Rundvisning$/i.test(heading.textContent.trim()) ? 'Rundvisning' : 'Rundvisning');
      }
      const node = document.createElement('div'); node.setAttribute('data-cms-shared', 'visit');
      node.setAttribute('data-cms-original', html); heading.replaceWith(node);
    }
    page.body = document.body.innerHTML;
  }
  for (const [key, label] of Object.entries(sharedLabels)) record(key, '', label);
  model.pages.forEach((page, index) => {
    page.key ||= 'page-' + (index + 1); page.aliases ||= []; page.template ||= 'standard';
    const nodes = [...dom(page.body).body.childNodes]; let chunk = '', blocks = [];
    const flush = () => { if (chunk.trim()) blocks.push({ id: page.key + '-block-' + (blocks.length + 1), type: 'text', html: chunk }); chunk = ''; };
    for (const node of nodes) {
      if (node.nodeType === 1 && node.hasAttribute('data-cms-shared')) {
        flush(); blocks.push({ id: page.key + '-block-' + (blocks.length + 1), type: 'shared', key: node.getAttribute('data-cms-shared'), originalHtml: node.getAttribute('data-cms-original') || '' });
      } else {
        if (/^h[23]$/i.test(node.localName || '')) flush();
        chunk += node.outerHTML ?? node.textContent;
      }
    }
    flush(); page.blocks = blocks;
  });
  model.home.sectionOrder ||= ['hero', 'offers', 'nature', 'videos', 'practical', 'visit', 'extra', 'source'];
  model.home.videoPages ||= ['vuggestue', 'om/mad-og-maaltider', 'om/foraeldresamarbejde'];
  model.home.practicalPages ||= ['praktisk/venteliste', 'praktisk/priser', 'praktisk/aabningstider', 'praktisk/intranet'];
  model.home.blocks ||= [];
  return model;
}

function renderShared(model, key, original = '') {
  const record = model.shared?.[key];
  if (!record) return '';
  if (original && !sharedChanged(record)) return cleanBody(original);
  return (record.title ? `<h2>${esc(record.title)}</h2>` : '') + cleanBody(record.html);
}
function mediaLink(value) { const url = safeUrl(value || ''); if (url && !/^(https?:\/\/|\/uploads\/)/.test(url)) throw new Error('Vælg et billede, en video eller et dokument.'); return url; }
function imageSizeClass(size) { if (size === undefined || size === null || size === '') return ''; if (!['small','medium','large','full'].includes(size)) throw new Error('Billedstørrelsen er ugyldig.'); return ' cms-image-size-' + size; }
export function renderBlocks(blocks, model) {
  if (!Array.isArray(blocks) || blocks.length > 300) throw new Error('Der er for mange indholdsafsnit.');
  const ids = new Set();
  return blocks.map(block => {
    if (!block || typeof block.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(block.id) || ids.has(block.id)) throw new Error('Et afsnit har et ugyldigt id.');
    ids.add(block.id);
    if (block.type === 'text') {
      const html = block.html = cleanBody(text(block.html, 1000000));
      if (!html.includes('data-cms-shared')) return html;
      const document = dom(html);
      for (const node of document.querySelectorAll('[data-cms-shared]')) node.replaceWith(...dom(renderShared(model, node.getAttribute('data-cms-shared'), node.getAttribute('data-cms-original') || '')).body.childNodes);
      return document.body.innerHTML;
    }
    if (block.type === 'heading') return `<h${block.level === '3' ? '3' : '2'}>${esc(text(block.text, 500))}</h${block.level === '3' ? '3' : '2'}>`;
    if (block.type === 'image') return `<figure><img class="content-image${imageSizeClass(block.size)}" src="${esc(mediaLink(block.url))}" alt="${esc(text(block.alt || '', 1000))}" loading="lazy">${block.caption ? `<figcaption>${esc(text(block.caption, 1000))}</figcaption>` : ''}</figure>`;
    if (block.type === 'video') return `<figure><video controls playsinline preload="metadata" src="${esc(mediaLink(block.url))}"></video>${block.caption ? `<figcaption>${esc(text(block.caption, 1000))}</figcaption>` : ''}</figure>`;
    if (block.type === 'documents') { if (!Array.isArray(block.ids) || block.ids.length > 1000 || block.ids.some(id => !model.documents.some(doc => doc.id === id && doc.active !== false))) throw new Error('Dokumentlisten er ugyldig.'); return block.ids.map(id => `<div data-cms-document="${esc(id)}"></div>`).join(''); }
    if (block.type === 'contact') return `<div class="contact-map"><h2>${esc(block.title || 'Kontakt os')}</h2><p>${esc(model.settings.address)}<br>${esc(model.settings.postcode)}</p><p><a href="mailto:${esc(model.settings.email)}">${esc(model.settings.email)}</a><br><a href="tel:${esc(model.settings.phone.replace(/[^+\d]/g, ''))}">${esc(model.settings.phone)}</a></p></div>`;
    if (block.type === 'shared' && Object.hasOwn(sharedLabels, block.key)) { block.originalHtml = cleanBody(text(block.originalHtml || '', 100000)); return renderShared(model, block.key, block.originalHtml); }
    throw new Error('Afsnittets type findes ikke.');
  }).join('\n');
}

export function validateModel(input) {
  const model = upgradeModel(input);
  const paths = new Set(); const keys = new Set();
  for (const page of model.pages) {
    if (page.id && !validPageId(page.id)) throw new Error('Sideadressen er reserveret eller ugyldig.');
    if (typeof page.key !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(page.key) || keys.has(page.key)) throw new Error('Sidens identitet er ugyldig.');
    keys.add(page.key);
    if (!Array.isArray(page.aliases) || page.aliases.length > 50) throw new Error('Der er for mange tidligere adresser.');
    for (const id of [page.id, ...page.aliases]) { if ((id && !validPageId(id)) || paths.has(id)) throw new Error('En sideadresse bruges allerede eller er reserveret.'); paths.add(id); }
    if (!['standard', 'information', 'documents', 'contact'].includes(page.template)) throw new Error('Sidetypen er ugyldig.');
  }
  for (const key of Object.keys(sharedLabels)) {
    const record = model.shared?.[key]; if (!record) throw new Error('En fælles oplysning mangler.');
    record.title = text(record.title, 500); record.html = cleanBody(text(record.html, 100000));
    record.baselineTitle = text(record.baselineTitle || '', 500); record.baselineHtml = cleanBody(text(record.baselineHtml || '', 100000));
    if (sharedChanged(record)) { record.activated = true; record.baselineTitle = ''; record.baselineHtml = ''; }
  }
  for (const page of model.pages) for (const block of page.blocks) if (block.type === 'shared' && model.shared[block.key]?.activated) block.originalHtml = '';
  for (const person of model.people) if (person.edited) delete person.sourceHtml;
  for (const page of model.pages) page.body = renderBlocks(page.blocks, model);
  for (const key of ['videoPages', 'practicalPages']) if (!Array.isArray(model.home[key]) || model.home[key].length > 100 || model.home[key].some(id => !model.pages.some(page => page.id === id))) throw new Error('Forsiden linker til en side, der ikke findes.');
  const sections = ['hero', 'offers', 'nature', 'videos', 'practical', 'visit', 'extra', 'source'];
  if (!Array.isArray(model.home.sectionOrder) || model.home.sectionOrder.length !== sections.length || new Set(model.home.sectionOrder).size !== sections.length || model.home.sectionOrder.some(key => !sections.includes(key))) throw new Error('Forsidens rækkefølge er ugyldig.');
  renderBlocks(model.home.blocks, model);
  const placements = new Map(model.documents.map(doc => [doc.id, [...doc.pages]]));
  for (const page of model.pages) for (const block of page.blocks) if (block.type === 'documents') for (const id of block.ids) { const doc = model.documents.find(doc => doc.id === id); if (!doc.pages.includes(page.id)) doc.pages.push(page.id); }
  if (model.mediaDescriptions !== undefined) {
    if (!model.mediaDescriptions || typeof model.mediaDescriptions !== 'object' || Object.keys(model.mediaDescriptions).length > 5000) throw new Error('Billedbeskrivelserne er ugyldige.');
    for (const [url, meta] of Object.entries(model.mediaDescriptions)) { mediaLink(url); text(meta?.alt, 1000); }
  }
  const validated = legacyValidate(model);
  for (const doc of validated.documents) doc.pages = placements.get(doc.id);
  return validated;
}

export function publicContent(input, revision, options = {}) {
  const model = options.validated ? structuredClone(input) : validateModel(input);
  const result = legacyPublic(model, revision, options);
  result.home.extraHtml = cleanBody(renderBlocks(model.home.blocks, model));
  const extra = dom(result.home.extraHtml);
  for (const node of extra.querySelectorAll('[data-cms-document]')) { const doc = model.documents.find(doc => doc.id === node.getAttribute('data-cms-document') && doc.active !== false); node.replaceWith(...dom(doc ? `<a class="document-link" href="${esc(doc.url)}" target="_blank" rel="noopener">${esc(doc.label)}</a>` : '').body.childNodes); }
  result.home.extraHtml = extra.body.innerHTML;
  if (sharedChanged(model.shared.visit)) {
    result.home.visitHeading = model.shared.visit.title;
    result.home.visitText = dom(model.shared.visit.html).body.textContent.trim();
  }
  // Apply media descriptions to legacy inline images as well as explicit image blocks.
  for (const page of result.pages) {
    const document = dom(page.body);
    for (const image of document.querySelectorAll('img')) {
      const meta = model.mediaDescriptions?.[image.getAttribute('src')];
      if (typeof meta?.alt === 'string') image.setAttribute('alt', meta.alt);
    }
    page.body = document.body.innerHTML;
  }
  return result;
}
