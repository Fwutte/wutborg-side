import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mobilePresentation } from './private-preview/mobile-presentation.mjs';
import { cleanRoutes } from './private-preview/clean-routes.mjs';
import { contentPresentation } from './private-preview/content-presentation.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(process.argv.slice(2).find(value => !value.startsWith('--')) || 'C:/Codex/oenskelandet');
const online = process.argv.includes('--online');
// Confidential content must never go into this repo or its static web root.
const output = await fs.mkdtemp(path.join(os.tmpdir(), 'wutborg-private-preview-'));
const publicDir = path.join(output, 'public');
await fs.mkdir(publicDir);
const state = JSON.parse(await fs.readFile(path.join(source, 'data/content-state.json'), 'utf8'));
const { publicContent } = await import(pathToFileURL(path.join(source, 'cms/model.mjs')).href);
if (!state.published) throw new Error('The saved published model is missing.');
const snapshot = publicContent(state.published, state.publishedRevision);
const serialized = JSON.stringify(snapshot);
const uploads = [...new Set([...serialized.matchAll(/(?<![A-Za-z0-9/_-])\/uploads\/([a-zA-Z0-9_.-]+)/g)].map(match => match[1]))];
const relocateUploads = text => text.replace(/(?<![A-Za-z0-9/_-])\/uploads\//g, '/oenskelandet/uploads/');
const content = relocateUploads(serialized);
const assets = {};
let html = await fs.readFile(path.join(source, 'index.html'), 'utf8');
html = html.replace('<meta name="theme-color"', '<meta name="robots" content="noindex, nofollow, noarchive"><meta name="referrer" content="no-referrer"><meta name="theme-color"');
html = html.replace('href="styles.css"', 'href="/oenskelandet/styles.css"').replace('src="content.js"', 'src="/oenskelandet/content.js"').replace('src="app.js"', 'src="/oenskelandet/app.js"').replaceAll('href="?"', 'href="/oenskelandet/"');
assets['index.html'] = { type: 'text/html; charset=utf-8', body: html };
assets['styles.css'] = { type: 'text/css; charset=utf-8', body: await fs.readFile(path.join(source, 'styles.css'), 'utf8') };
assets['content.js'] = { type: 'text/javascript; charset=utf-8', body: 'window.SITE_CONTENT=' + relocateUploads(JSON.stringify(snapshot.pages)) + ';' };
let app = await fs.readFile(path.join(source, 'app.js'), 'utf8');
if (!app.includes("fetch('/api/content'")) throw new Error('The source app changed: content URL must be reviewed.');
app = app.replace("fetch('/api/content'", "fetch('/oenskelandet/api/content'");
const mobile = await mobilePresentation(app, assets['styles.css'].body);
app = contentPresentation(cleanRoutes(mobile.app));
assets['styles.css'].body = mobile.styles;
assets['app.js'] = { type: 'text/javascript; charset=utf-8', body: app };
assets['api/content'] = { type: 'application/json; charset=utf-8', body: content };
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm' };
for (const name of uploads) {
  const type = mime[path.extname(name).toLowerCase()];
  if (!type) throw new Error('Unsupported uploaded media type.');
  assets['uploads/' + name] = { type, body: (await fs.readFile(path.join(source, 'data/uploads', name))).toString('base64'), base64: true };
}
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: repo }).toString().split('\0').filter(Boolean);
let copied = 0;
for (const filename of tracked) {
  // Copy the existing public website and its Functions, never docs, sources or local files.
  const server = filename.startsWith('functions/');
  const web = !filename.includes('/') && (filename.endsWith('.html') || ['_headers', '_redirects'].includes(filename)) || /^(assets|css|js|madplan)\//.test(filename);
  if (!server && !web) continue;
  const dest = path.join(server ? output : publicDir, filename);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(path.join(repo, filename), dest);
  copied++;
}
const library = path.join(output, 'runtime-lib');
await fs.mkdir(library);
await fs.copyFile(path.join(repo, 'scripts/private-preview/handler.mjs'), path.join(library, 'handler.mjs'));
await fs.copyFile(path.join(repo, 'scripts/private-preview/access.mjs'), path.join(library, 'access.mjs'));
if (online) {
  const sourceRequire = createRequire(path.join(source, 'package.json'));
  let model = await fs.readFile(path.join(source, 'cms/model.mjs'), 'utf8');
  model = model.replace(/^import (?:fs|path|crypto) from .*;\r?\n/gm, '');
  const seedStart = model.indexOf('export async function seedModel(root)');
  const seedEnd = model.indexOf('function insertReference(', seedStart);
  if (seedStart < 0 || seedEnd < 0) throw new Error('Review the CMS model export before deployment.');
  model = model.slice(0, seedStart) + model.slice(seedEnd);
  model = model.slice(0, model.indexOf('export class ContentStore'));
  model = model.replace("from 'linkedom'", 'from ' + JSON.stringify(sourceRequire.resolve('linkedom').replaceAll('\\', '/')))
    .replace("from 'sanitize-html'", 'from ' + JSON.stringify(sourceRequire.resolve('sanitize-html').replaceAll('\\', '/')));
  model = model.replace("'data-cms-contact']", "'data-cms-contact','data-cms-shared','data-cms-original']");
  model = model.replace('for(const record of selected)if(', "for(const record of selected)if(!(kind==='document'&&page.blocks?.some(block=>block.type==='documents'))&&");
  await fs.writeFile(path.join(library, 'legacy-model.mjs'), model);
  await fs.copyFile(path.join(repo, 'scripts/private-preview/model-v2.mjs'), path.join(library, 'model.mjs'));
  const tooling = createRequire('C:/Users/lotte/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/package.json');
  const editorBuild = await tooling('esbuild').build({ entryPoints: [path.join(repo, 'scripts/private-preview/editor/entry.js')], bundle: true, write: false, minify: true, format: 'iife', platform: 'browser', target: 'es2022' });
  assets['admin/editor.js'] = { type: 'text/javascript; charset=utf-8', body: editorBuild.outputFiles[0].text };
  await fs.copyFile(path.join(repo, 'scripts/private-preview/cms.mjs'), path.join(library, 'cms.mjs'));
  await fs.copyFile(path.join(repo, 'scripts/private-preview/media-library.mjs'), path.join(library, 'media-library.mjs'));
  const adminSource = path.join(repo, 'scripts/private-preview/admin');
  assets['admin/'] = { type: 'text/html; charset=utf-8', body: await fs.readFile(path.join(adminSource, 'index.html'), 'utf8') };
  assets['admin/index.html'] = assets['admin/'];
  assets['admin/admin.js'] = { type: 'text/javascript; charset=utf-8', body: await fs.readFile(path.join(adminSource, 'admin.js'), 'utf8') };
  assets['admin/admin.css'] = { type: 'text/css; charset=utf-8', body: await fs.readFile(path.join(adminSource, 'admin.css'), 'utf8') };
  assets['admin/frame.css'] = { type: 'text/css; charset=utf-8', body: await fs.readFile(path.join(adminSource, 'frame.css'), 'utf8') };
  assets['content.js'].body = 'window.SITE_CONTENT=[];';
  assets['app.js'].body = assets['app.js'].body.replaceAll('href="/admin"', 'href="/oenskelandet/admin/"');
  await fs.writeFile(path.join(output, 'cms-initial-state.json'), JSON.stringify(state));
  await fs.writeFile(path.join(output, 'cms-initial-public.json'), JSON.stringify(snapshot));
}
await fs.writeFile(path.join(library, 'assets.mjs'), 'export default ' + JSON.stringify(assets) + ';\n');
const route = path.join(output, 'functions/oenskelandet');
await fs.mkdir(route, { recursive: true });
const handler = "import assets from '../../runtime-lib/assets.mjs';\nimport {createHandler} from '../../runtime-lib/handler.mjs';\n" + (online ? "import {cms} from '../../runtime-lib/cms.mjs';\nexport const onRequest=createHandler(assets,{cms});\n" : "export const onRequest=createHandler(assets);\n");
await fs.writeFile(path.join(route, 'index.js'), handler);
await fs.writeFile(path.join(route, '[[path]].js'), handler);
let config = await fs.readFile(path.join(repo, 'wrangler.toml'), 'utf8');
config = config.replace('pages_build_output_dir = "."', 'pages_build_output_dir = "public"');
await fs.writeFile(path.join(output, 'wrangler.toml'), config);
await fs.writeFile(path.join(output, 'access-settings.json'), JSON.stringify({
  deployed: false,
  hostname: 'wutborg.dk', paths: ['/oenskelandet', '/oenskelandet/*'],
  login: 'one-time PIN', allowedEmails: ['Frederik.wutborg@live.dk'],
  requiredServerVariables: ['PRIVATE_PREVIEW_ISSUER', 'PRIVATE_PREVIEW_AUDIENCE', 'PRIVATE_PREVIEW_EMAILS'],
  note: 'Keep the scoped Cloudflare Access email Allow policy. Never deploy the source folder or runtime-lib as static assets.'
}, null, 2));
console.log(JSON.stringify({ output, online, publishedPages: snapshot.pages.length, protectedFiles: Object.keys(assets).length, copiedPublicFiles: copied, deployed: false }, null, 2));
