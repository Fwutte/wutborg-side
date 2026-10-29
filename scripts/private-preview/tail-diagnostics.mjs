import { spawn } from 'node:child_process';
const deployment = process.argv[2];
if (!/^https:\/\/[a-f0-9]+\.wutborg-side\.pages\.dev$/.test(deployment || '')) throw new Error('Supply the current deployment URL.');
const wrangler = 'C:/Users/lotte/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/bin/wrangler.js';
const child = spawn(process.execPath, [wrangler, 'pages', 'deployment', 'tail', deployment, '--project-name', 'wutborg-side', '--format', 'json'], { env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
// Tail events contain cookies and JWTs. Only sanitized status summaries leave this process.
const safe = text => String(text).replace(/[A-Za-z0-9_+\/.=-]{40,}/g, '[redacted]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]').slice(0, 500);
let buffer = '', depth = 0, quoted = false, escaped = false;
child.stdout.on('data', chunk => {
  for (const ch of chunk.toString()) {
    if (!depth) { if (ch !== '{') continue; buffer = '{'; depth = 1; quoted = false; escaped = false; continue; }
    buffer += ch;
    if (quoted) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') quoted = false; }
    else if (ch === '"') quoted = true;
    else if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (!depth) {
      try {
        const event = JSON.parse(buffer); const route = new URL(event.event?.request?.url || 'https://invalid.example').pathname;
        if (route.startsWith('/oenskelandet')) console.log(JSON.stringify({ route, status: event.event?.response?.status, outcome: event.outcome, exceptions: (event.exceptions || []).map(error => ({ name: error.name, message: safe(error.message) })), notices: (event.logs || []).flatMap(log => log.message || []).filter(value => typeof value === 'string' && value.includes('cms-operation-failed')).map(safe) }));
      } catch {}
      buffer = '';
    }
    if (buffer.length > 1048576) { buffer = ''; depth = 0; }
  }
});
child.stderr.on('data', chunk => { if (/error|failed/i.test(chunk.toString())) console.log(safe(chunk.toString())); });
const timer = setTimeout(() => child.kill(), 180000);
child.on('exit', () => { clearTimeout(timer); console.log('Diagnostic session ended.'); });
console.log('Filtered diagnostics started; authentication data is never printed.');
