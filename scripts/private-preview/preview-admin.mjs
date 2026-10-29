import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fixture } from './fixture.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const prepared=JSON.parse(execFileSync(process.execPath,['scripts/prepare-private-preview.mjs','--online'],{cwd:repo,encoding:'utf8'}));
let seed=JSON.parse(await fs.readFile(path.join(prepared.output,'cms-initial-state.json'),'utf8'));
let liveRendering;
if(process.argv.includes('--live-content')){
  execFileSync(process.execPath,['C:/Users/lotte/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/bin/wrangler.js','whoami'],{encoding:'utf8',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
  const config=await fs.readFile('C:/Users/lotte/AppData/Roaming/xdg.config/.wrangler/config/default.toml','utf8');
  const token=config.match(/^oauth_token\s*=\s*"([^"\r\n]+)"/m)?.[1];
  const response=await fetch('https://api.cloudflare.com/client/v4/accounts/98a6d302d1e0fdbc93ac71aeb0d6606c/d1/database/24fdff5f-cf6a-4cfb-a5c3-534cbde42592/query',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:'SELECT state_json,public_json FROM oenskelandet_cms_state WHERE id=1'})});
  const data=await response.json();if(!response.ok||!data.success)throw new Error('Content read failed (HTTP '+response.status+', codes '+(data.errors||[]).map(error=>error.code).join(',')+')');
  seed=JSON.parse(data.result[0].results[0].state_json);liveRendering=data.result[0].results[0].public_json;
}
const test=await fixture(prepared.output,seed);
if(liveRendering)await test.db.prepare('UPDATE oenskelandet_cms_state SET public_json=? WHERE id=1').bind(liveRendering).run();
const server=http.createServer(async(request,response)=>{
  try{
    const chunks=[];for await(const chunk of request)chunks.push(chunk);
    const headers=new Headers(request.headers);headers.set('Cf-Access-Jwt-Assertion',test.token);
    if(headers.has('origin'))headers.set('origin','https://wutborg.dk');headers.delete('host');
    const result=await test.worker.dispatchFetch('https://wutborg.dk'+request.url,{method:request.method,headers,redirect:'manual',...(!['GET','HEAD'].includes(request.method)?{body:Buffer.concat(chunks)}:{})});
    response.statusCode=result.status;
    result.headers.forEach((value,key)=>response.setHeader(key,key==='set-cookie'?value.replace('; Secure',''):key==='location'?value.replace('https://wutborg.dk','http://localhost:8318'):value));
    let body=Buffer.from(await result.arrayBuffer());
    if(result.headers.get('content-type')?.startsWith('text/html')&&request.url.startsWith('/oenskelandet/admin'))body=Buffer.from(body.toString().replace('<body>','<body><div style="background:#eed18c;color:#254c3d;text-align:center;padding:7px;font:14px Arial">Isoleret afprøvning · ændringer her påvirker ikke hjemmesiden</div>'));
    response.removeHeader('content-length');response.end(body);
  }catch(error){response.writeHead(500,{'content-type':'text/plain'});response.end(error.message);}
});
server.listen(8318,'127.0.0.1',()=>console.log('Isolated admin review: http://localhost:8318/oenskelandet/admin/ (source revision '+seed.revision+')'));
async function shutdown(){server.close();await test.dispose();process.exit();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
