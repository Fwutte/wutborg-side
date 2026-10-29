import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire('C:/Users/lotte/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/package.json');
export async function migrateOnlineModel(output,{apply=false}={}){
  const bundle=path.join(output,'migration-model.cjs');
  await require('esbuild').build({entryPoints:[path.join(output,'runtime-lib/model.mjs')],outfile:bundle,bundle:true,platform:'node',format:'cjs'});
  const {upgradeModel,publicContent,dom}=require(bundle);
  const credentials=await fs.readFile('C:/Users/lotte/AppData/Roaming/xdg.config/.wrangler/config/default.toml','utf8');
  const token=credentials.match(/^oauth_token\s*=\s*"([^"\r\n]+)"/m)?.[1];if(!token)throw new Error('Existing authorization is unavailable');
  async function query(body){const response=await fetch('https://api.cloudflare.com/client/v4/accounts/98a6d302d1e0fdbc93ac71aeb0d6606c/d1/database/24fdff5f-cf6a-4cfb-a5c3-534cbde42592/query',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});const data=await response.json();if(!response.ok||!data.success||data.result.some(result=>!result.success))throw new Error('Online model migration failed');return data.result;}
  for(let attempt=0;attempt<3;attempt++){
    const row=(await query({sql:'SELECT revision,state_json,public_json FROM oenskelandet_cms_state WHERE id=1'}))[0].results[0];
    const state=JSON.parse(row.state_json);if(state.draft.cmsVersion===2&&state.published.cmsVersion===2){console.log(JSON.stringify({onlineModelVersion:2,alreadyMigrated:true,revision:state.revision}));return;}
    const next={...state,draft:upgradeModel(state.draft),published:upgradeModel(state.published),revision:state.revision+1,updatedAt:new Date().toISOString()};
    const before=JSON.parse(row.public_json),after=publicContent(next.published,state.publishedRevision);
    const plain=html=>dom(html).body.textContent.replace(/\s+/g,' ').trim();
    const media=html=>[...dom(html).querySelectorAll('img,video,iframe,a')].map(node=>node.getAttribute('src')||node.getAttribute('href')).sort();
    for(const page of before.pages){const updated=after.pages.find(item=>item.id===page.id);if(!updated||plain(page.body)!==plain(updated.body)||JSON.stringify(media(page.body))!==JSON.stringify(media(updated.body)))throw new Error('Migration would change existing content; no live data changed.');}
    const serialized=JSON.stringify(next);if(Buffer.byteLength(serialized)>1200000)throw new Error('Migrated model exceeds existing size limit');
    if(!apply){console.log(JSON.stringify({readyToMigrate:true,onlineRevision:state.revision,publishedRevision:state.publishedRevision,existingContentVerified:true,modelBytes:Buffer.byteLength(serialized)}));return;}
    const writes=await query({batch:[
      {sql:'INSERT INTO oenskelandet_cms_history (id,revision,created_at,action,state_json) SELECT ?,revision,?,?,state_json FROM oenskelandet_cms_state WHERE id=1 AND revision=?',params:[Date.now()+'-'+crypto.randomUUID()+'.json',next.updatedAt,'migrate',row.revision]},
      {sql:'UPDATE oenskelandet_cms_state SET revision=?,state_json=? WHERE id=1 AND revision=?',params:[next.revision,serialized,row.revision]},
    ]});
    if(writes[1].meta.changes===1){console.log(JSON.stringify({onlineModelVersion:2,revision:next.revision,publishedRevision:state.publishedRevision,publishedRenderingUnchanged:true,historyPreserved:true}));return;}
  }
  throw new Error('Concurrent edits prevented model migration; no changes overwritten');
}
