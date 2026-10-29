import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

// Read-only development preview, available only on this computer's loopback address.
// The protected source/content remains outside the repository and public assets.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const prepared = JSON.parse(execFileSync(process.execPath, ['scripts/prepare-private-preview.mjs', '--online'], { cwd: repo, encoding: 'utf8' }));
const { default: assets } = await import(pathToFileURL(path.join(prepared.output, 'runtime-lib/assets.mjs')));
const snapshot = JSON.parse(assets['api/content'].body);
const port = 8317;
http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  let name = url.pathname.slice('/oenskelandet/'.length) || 'index.html';
  if (name === 'index.html' && url.searchParams.has('side')) {
    const id = url.searchParams.get('side'); url.searchParams.delete('side');
    if (snapshot.pages.some(page => page.id === id)) {
      response.writeHead(302, { location: '/oenskelandet/' + id + url.search });
      response.end(); return;
    }
  }
  if (snapshot.pages.some(page => page.id && page.id === name.replace(/\/$/, ''))) name = 'index.html';
  const asset = url.pathname.startsWith('/oenskelandet/') && Object.hasOwn(assets, name) && assets[name];
  response.setHeader('cache-control', 'no-store');
  if (!['GET', 'HEAD'].includes(request.method) || !asset || name.startsWith('admin/') || name.startsWith('api/admin/')) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.setHeader('content-type', asset.type);
  response.end(request.method === 'HEAD' ? undefined : asset.base64 ? Buffer.from(asset.body, 'base64') : asset.body);
}).listen(port, '127.0.0.1', () => console.log('Read-only mobile review: http://localhost:' + port + '/oenskelandet/'));
