// A page-first editing experience. The existing model, permissions and publication API stay authoritative.
let simpleAutosaveTimer=null,simpleSaving=null,simpleSaveError=null,simpleOrganise=false,simpleAllPages=false;
let simpleLastRoute='',simplePublishing=false;
const simpleIcons={pages:'M4 3h11l5 5v13H4z M14 3v6h6 M8 13h8 M8 17h6',people:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',files:'M3 7h7l2-3h9v16H3z',settings:'M4 7h16 M4 17h16 M8 4v6 M16 14v6',arrow:'M9 5l7 7-7 7',back:'M15 5l-7 7 7 7',plus:'M12 5v14 M5 12h14',eye:'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',check:'M5 12l4 4L20 5',text:'M4 5h16 M12 5v15 M8 20h8',image:'M3 3h18v18H3z M3 16l5-5 4 4 4-6 5 7 M8 7h.01',shared:'M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l2-2',more:'M5 12h.01 M12 12h.01 M19 12h.01'};
const si=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${simpleIcons[name]||simpleIcons.pages}"/></svg>`;
const sr=()=>current();
const smallScreen=()=>typeof matchMedia==='function'?matchMedia('(max-width:760px)').matches:true;
const simpleHeading=(title,description='',action='')=>`<div class="simple-heading"><div><h1>${esc(title)}</h1>${description?`<p>${esc(description)}</p>`:''}</div>${action}</div>`;
const simplePage=id=>state.draft.pages.find(page=>page.id===id||page.aliases?.includes(id));
function simpleContext(){const r=sr();if(r.section==='page')return simplePage(r.id);if(['section','page-options'].includes(r.section))return state.draft.pages.find(page=>page.key===r.id.split('/')[0]);if(['home','home-edit','home-layout'].includes(r.section))return simplePage('');return null;}
function simpleBack(){const r=sr();if(['section','page-options'].includes(r.section)){const p=simpleContext();return p?(p.id?'#page/'+encodeURIComponent(p.id):'#home'):'#pages';}if(['home-edit','home-layout'].includes(r.section))return '#home';if(r.section==='shared-edit')return '#shared';if(['person','people-order'].includes(r.section))return '#people';if(r.section==='document')return '#documents';if(r.section==='site-edit')return '#site-settings';if(['site-settings','history','usage'].includes(r.section))return '#settings';return '#pages';}
function simpleNavigate(hash){location.hash=hash.slice(1);render();}
function simpleStatus(text,error=false){$('#save-state').textContent=text;$('#save-dot').className=error?'error':dirty?'dirty':'';}
function simpleUpdateStatus(){if(!state)return;if(simpleSaveError){simpleStatus('Kunne ikke gemme',true);return;}if(simpleSaving){simpleStatus('Gemmer…');return;}simpleStatus(dirty?'Ikke gemt endnu':changedItems().length?'Kladde gemt':'Alt er udgivet');const publish=$('#publish');if(publish)publish.disabled=busy||simplePublishing||(!dirty&&!changedItems().length);}

// A failed login must not replace the editor with an unrelated password form.
api=async function(path,options={},retry=true){
  const headers={...(options.body&&typeof options.body==='string'?{'Content-Type':'application/json'}:{}),'X-CSRF-Token':csrf,...options.headers};
  const response=await fetch('/oenskelandet/api/admin/'+path,{credentials:'same-origin',cache:'no-store',...options,headers});
  const type=response.headers.get('content-type')||'';
  if(!type.includes('application/json')){const error=new Error('Log ind igen i en ny fane. Dine rettelser er bevaret her.');error.status=401;throw error;}
  const data=await response.json();
  if(!response.ok){
    if(response.status===401&&retry&&path!=='session'){
      const renewed=await api('session',{},false);if(renewed.authenticated){csrf=renewed.csrf;return api(path,options,false);}
    }
    const error=new Error(data.error||'Handlingen kunne ikke gennemføres.');error.status=response.status;throw error;
  }
  return data;
};
function simpleScheduleSave(){clearTimeout(simpleAutosaveTimer);if(!state||!dirty||simpleSaveError?.status===409)return;simpleAutosaveTimer=setTimeout(()=>{simplePersist(false,true);},2500);simpleAutosaveTimer?.unref?.();}
const simpleOriginalDirty=markDirty;
markDirty=function(){simpleOriginalDirty();simpleSaveError=null;$('#publish').disabled=false;simpleStatus('Ikke gemt endnu');simpleScheduleSave();};
async function simplePersist(publish=false,quiet=false){
  clearTimeout(simpleAutosaveTimer);
  if(simpleSaving){const success=await simpleSaving;if(!success)return false;if(!dirty&&!publish)return true;}
  if(!state||(!dirty&&!publish))return true;
  if(busy&&!publish){simpleScheduleSave();return false;}
  const invalid=[...$('#view').querySelectorAll('input,textarea,select')].find(input=>typeof input.checkValidity==='function'&&!input.checkValidity());
  const incomplete=state.draft.documents.some(doc=>doc.active!==false&&!doc.url);
  if(invalid||incomplete){simpleStatus(incomplete?'Vælg en fil for at gemme':'Udfyld de tomme felter');if(!quiet){invalid?.reportValidity?.();notice(incomplete?'Vælg en PDF, før dokumentet kan gemmes.':'Udfyld det markerede felt.',true);}return false;}
  const snapshot=clone(state.draft),revision=state.revision,context=simpleContext();
  const task=(async()=>{
    if(publish){simplePublishing=true;setBusy(true);}simpleStatus(publish?'Udgiver…':'Gemmer…');
    try{
      const fresh=await api(publish?'publish':'save',{method:'POST',body:JSON.stringify({expectedRevision:revision,model:snapshot})});
      const latest=state.draft,changedDuringSave=JSON.stringify(latest)!==JSON.stringify(snapshot);
      state=changedDuringSave?{...fresh,draft:latest}:fresh;dirty=changedDuringSave;simpleSaveError=null;
      if(publish){render();notice('Dine ændringer er udgivet.');const link=document.createElement('a');link.href=liveUrl(context?.id||'');link.target='_blank';link.rel='noopener';link.className='secondary';link.textContent='Se den opdaterede side ↗';$('#notice').append(' ',link);}
      return true;
    }catch(error){simpleSaveError=error;simpleStatus('Kunne ikke gemme',true);notice(error.message,true);const retry=document.createElement('button');retry.className='secondary';retry.dataset.simpleRetry='';retry.textContent=error.status===401?'Log ind igen':error.status===409?'Se nyeste version':'Prøv igen';$('#notice').append(' ',retry);return false;}
    finally{if(publish){simplePublishing=false;setBusy(false);}simpleSaving=null;simpleUpdateStatus();if(dirty&&!simpleSaveError)simpleScheduleSave();}
  })();
  simpleSaving=task;return task;
}
save=async function(action='save'){return simplePersist(action==='publish',false);};
preview=async function(){
  if(dirty&&!await simplePersist())return;
  const page=simpleContext(),r=sr();const id=page?.id??(r.section==='person'?'om/medarbejdere':r.section==='document'?'tilsyn':'');
  const url=liveUrl(id)+'?preview=1';$('#preview-frame').src=url;$('#preview-external').href=url;$('#preview-frame').classList.toggle('mobile',smallScreen());$('#preview-dialog').showModal();
};
reviewPublication=async function(){
  if(dirty&&!await simplePersist())return;
  const items=changedItems();if(!items.length){notice('Alt er allerede udgivet.');return;}
  const groups=new Map();for(const item of items){const title=item.pageId!==null?(state.draft.pages.find(page=>page.id===item.pageId)?.navigationLabel||'Forsiden'):item.label;const key=item.pageId!==null?'page:'+item.pageId:title;if(!groups.has(key))groups.set(key,{title,items:[]});groups.get(key).items.push(item);}
  ask('Udgiv dine ændringer',groups.size===1?'Denne ændring bliver synlig på hjemmesiden.':'Ændringerne nedenfor bliver synlige på hjemmesiden.',()=>save('publish'),'Udgiv nu');
  const review=document.createElement('div');review.className='publication-review simple-publication';
  review.innerHTML=[...groups.values()].map(group=>`<section><div class="review-title">${si('check')}<strong>${esc(group.title)}</strong></div><details><summary>Se rettelser</summary>${group.items.map(item=>`<div class="simple-diff"><span>${esc(item.label.split(' · ').slice(1).join(' · ')||'Indhold')}</span><div class="diff-columns"><div><strong>Før</strong><p>${esc(diffText(item.before).slice(0,1600))}</p></div><div><strong>Efter</strong><p>${esc(diffText(item.after).slice(0,1600))}</p></div></div></div>`).join('')}</details></section>`).join('');
  $('#confirm-dialog .dialog-actions').before(review);
};

function simpleLink(title,description,hash,icon='pages',extra=''){return `<a class="simple-card ${extra}" href="${esc(hash)}"><span class="card-icon">${si(icon)}</span><span><strong>${esc(title)}</strong>${description?`<span>${esc(description)}</span>`:''}</span><span class="card-arrow">${si('arrow')}</span></a>`;}
function simplePages(){
  const popular=['','vuggestue','boernehave'].map(simplePage).filter(Boolean),practical=['praktisk/aabningstider','praktisk/priser','praktisk/kontakt'].map(simplePage).filter(Boolean);
  return simpleHeading('Din hjemmeside','Vælg den side, du vil ændre.')+`<label class="simple-search">${si('pages')}<input type="search" data-search value="${esc(query)}" placeholder="Find en side eller oplysning…" aria-label="Find en side"></label><div id="simple-list">${simplePageResults(popular,practical)}</div>`;
}
function simplePageResults(popular,practical){
  const matches=state.draft.pages.filter(page=>`${page.navigationLabel} ${page.heading}`.toLocaleLowerCase('da').includes(query.toLocaleLowerCase('da')));
  if(query.trim()||simpleAllPages)return `<div class="list-caption"><h2>${query?'Søgeresultater':'Alle sider'}</h2>${!query?'<button class="text-button" data-simple-all-pages>Vis ofte brugte</button>':''}</div><div class="simple-card-list">${matches.map(page=>simpleLink(page.navigationLabel||'Forsiden',page.active===false?'Skjult på hjemmesiden':'Ret tekst, billeder og afsnit',page.id?'#page/'+encodeURIComponent(page.id):'#home')).join('')||'<p class="simple-empty">Ingen sider matcher. Prøv et andet ord.</p>'}</div><button class="secondary add-page-button" data-new-page>${si('plus')} Tilføj en side</button>`;
  return `<div class="popular-pages">${popular.map(page=>simpleLink(page.id?page.navigationLabel:'Forsiden',page.id==='vuggestue'?'Tekster og billeder i vuggestuen':page.id==='boernehave'?'Tekster og billeder i børnehaven':'Det første, besøgende ser',page.id?'#page/'+encodeURIComponent(page.id):'#home','pages',page.id?'':'frontpage-card')).join('')}</div><div class="list-caption"><h2>Praktiske oplysninger</h2></div><div class="practical-shortcuts">${practical.map(page=>simpleLink(page.navigationLabel,'','#page/'+encodeURIComponent(page.id),'shared')).join('')}</div><div class="all-pages-footer"><button class="secondary" data-simple-all-pages>Se alle ${state.draft.pages.length} sider ${si('arrow')}</button><button class="text-button" data-new-page>Tilføj en side</button></div>`;
}
function simpleBlockTitle(block,index){
  if(block.type==='shared')return sharedNames[block.key];if(block.type==='heading')return block.text||'Overskrift';if(block.type==='text'){const heading=inertNode(block.html).querySelector('h2,h3,h4');return heading?.textContent.trim()||(index===0?'Introduktion':plain(block.html).slice(0,48)||'Tekstafsnit');}return block.caption||({image:'Billede',video:'Video',documents:'Dokumenter',contact:'Kontaktoplysninger'})[block.type]||'Afsnit';
}
function simpleBlockSummary(block){if(block.type==='shared')return 'Fælles tekst · ret den ét sted';if(block.type==='text'){const node=inertNode(block.html);node.querySelectorAll('h2,h3,h4').forEach(heading=>heading.remove());const text=node.textContent.replace(/\s+/g,' ').trim();return text.length>105?text.slice(0,105).replace(/\s+\S*$/,'')+'…':text||'Åbn for at redigere';}if(block.type==='image')return block.alt||'Vælg eller skift billedet';if(block.type==='documents')return block.ids.length+' dokumenter';return block.type==='contact'?'Adresse, telefon og e-mail':'Åbn for at redigere';}
function simpleSections(page){
  return `<div class="simple-section-list">${page.blocks.map((block,index)=>`<div class="section-row-card">${simpleLink(simpleBlockTitle(block,index),simpleBlockSummary(block),'#section/'+page.key+'/'+block.id,block.type==='image'?'image':block.type==='shared'?'shared':'text')}${simpleOrganise?`<div class="organise-actions"><button class="quiet" data-block-move="pages.${state.draft.pages.indexOf(page)}.blocks" data-index="${index}" data-direction="-1" aria-label="Flyt afsnit op" ${index===0?'disabled':''}>↑</button><button class="quiet" data-block-move="pages.${state.draft.pages.indexOf(page)}.blocks" data-index="${index}" data-direction="1" aria-label="Flyt afsnit ned" ${index===page.blocks.length-1?'disabled':''}>↓</button><button class="danger" data-block-remove="pages.${state.draft.pages.indexOf(page)}.blocks" data-index="${index}">Fjern</button></div>`:''}</div>`).join('')||'<p class="simple-empty">Siden er tom. Tilføj dit første afsnit nedenfor.</p>'}</div>`;
}
function simplePageView(page){
  return simpleHeading(page.navigationLabel||'Forsiden','Hvad vil du ændre på denne side?',`<a class="quiet page-options-link" href="#page-options/${page.key}" aria-label="Sideindstillinger">${si('more')}<span>Sideindstillinger</span></a>`)+`<div class="simple-page-line"><span>${page.active===false?'Skjult på hjemmesiden':si('check')+' Synlig på hjemmesiden'}</span><a href="${esc(liveUrl(page.id))}" target="_blank" rel="noopener">Se siden ↗</a></div><div class="list-caption"><h2>Sidens afsnit</h2><button class="text-button" data-simple-organise>${simpleOrganise?'Færdig med rækkefølge':'Ret rækkefølge'}</button></div>${simpleLink('Sidens overskrift',page.heading,'#page-options/'+page.key,'text')}${simpleSections(page)}<button class="secondary add-section-button" data-simple-add-page="${page.key}">${si('plus')} Tilføj et afsnit</button>`;
}
function simpleRichField(label,path){
  return `<div class="field rich-field"><label>${esc(label)}</label><div class="block-toolbar" data-editor-toolbar="${esc(path)}">${[['bold','Fed'],['italic','Kursiv'],['bulletList','Punktliste'],['link','Link']].map(([command,title])=>`<button type="button" class="quiet" data-editor-command="${command}" data-editor-for="${esc(path)}">${title}</button>`).join('')}<details class="editor-more"><summary>Flere ${si('more')}</summary><div>${[['h2','Overskrift'],['orderedList','Nummereret liste'],['undo','Fortryd'],['redo','Gentag']].map(([command,title])=>`<button type="button" data-editor-command="${command}" data-editor-for="${esc(path)}">${title}</button>`).join('')}<button type="button" data-simple-image="${esc(path)}">Indsæt billede</button></div></details></div><div class="editor-mount" data-editor-path="${esc(path)}" data-editor-label="${esc(label)}"></div><div class="selected-image-tools" data-image-tools="${esc(path)}" hidden><span>Billede valgt</span><button class="secondary" data-simple-image="${esc(path)}">Skift billede</button></div></div>`;
}
function simpleSectionView(page,block){
  if(!page||!block)return simpleHeading('Afsnittet findes ikke','Gå tilbage og vælg et andet afsnit.');
  const index=state.draft.pages.indexOf(page),blockIndex=page.blocks.indexOf(block),path=`pages.${index}.blocks.${blockIndex}`;
  let fields=block.type==='text'?simpleRichField('Tekst',path+'.html'):blockFields(block,path),note='';
  if(block.type==='shared'){
    const sharedPath='shared.'+block.key,used=state.draft.pages.filter(item=>item.blocks.some(b=>b.type==='shared'&&b.key===block.key)).map(item=>item.navigationLabel||'Forsiden');
    if(block.key==='visit')used.push('Forsiden');
    note=`<div class="shared-context">${si('shared')}<p>Denne tekst bruges på ${esc([...new Set(used)].join(', '))}. Din rettelse opdaterer alle placeringer.</p></div>`;
    fields=field('Overskrift',sharedPath+'.title')+simpleRichField('Tekst',sharedPath+'.html')+`<details class="simple-advanced"><summary>Vis en anden fælles oplysning</summary>${selectField('Vælg oplysning',path+'.key',Object.entries(sharedNames))}<button class="secondary" data-simple-refresh>Åbn den valgte oplysning</button></details>`;
  }
  return `<a class="simple-breadcrumb" href="#page/${encodeURIComponent(page.id)}">${si('back')}${esc(page.navigationLabel||'Forsiden')}</a>${simpleHeading(simpleBlockTitle(block,blockIndex),'Ret indholdet nedenfor. Vi gemmer kladden for dig.')}<div class="focus-card">${note}${fields}</div><div class="focus-footer"><span>Bliver synligt, når du udgiver</span><button class="primary" data-simple-finish>Færdig ${si('check')}</button></div>`;
}
function simpleHome(){
  const cards=[['hero','Velkomst','Overskrift, introduktion og video'],['offers','Vuggestue og børnehave','Billeder og genveje til afdelingerne'],['nature','Naturafsnittet','Billede og tekst fra en side'],['videos','Hverdagen','Vælg de videoer, der skal vises'],['practical','Praktiske links','Genveje til åbningstider, priser og andet'],['visit','Invitation til rundvisning','Den fælles invitation til at komme på besøg']];
  const extra=state.draft.home.blocks.map((block,index)=>`<div class="section-row-card">${simpleLink(simpleBlockTitle(block,index),simpleBlockSummary(block),'#home-edit/block-'+block.id,'text')}${simpleOrganise?`<div class="organise-actions"><button class="quiet" data-block-move="home.blocks" data-index="${index}" data-direction="-1" aria-label="Flyt afsnit op" ${index===0?'disabled':''}>↑</button><button class="quiet" data-block-move="home.blocks" data-index="${index}" data-direction="1" aria-label="Flyt afsnit ned" ${index===state.draft.home.blocks.length-1?'disabled':''}>↓</button><button class="danger" data-block-remove="home.blocks" data-index="${index}">Fjern</button></div>`:''}</div>`).join('');
  return simpleHeading('Forsiden','Vælg den del af forsiden, du vil ændre.')+`<div class="simple-card-list">${cards.map(([id,title,text])=>simpleLink(title,text,id==='visit'?'#shared-edit/visit':'#home-edit/'+id,id==='hero'?'image':'pages')).join('')}</div><div class="list-caption"><h2>Ekstra indhold</h2><button class="text-button" data-simple-organise>${simpleOrganise?'Færdig med rækkefølge':'Ret rækkefølge'}</button></div>${extra}${simplePage('')?simpleSections(simplePage('')):''}<div class="home-actions"><button class="secondary" data-simple-add-home>${si('plus')} Tilføj et afsnit</button><a class="text-button" href="#home-layout">Flere muligheder: rækkefølge og synlighed</a></div>`;
}
function simpleChecks(key){const list=state.draft.home[key];return `<div class="simple-check-list">${state.draft.pages.filter(page=>page.id).map(page=>`<label class="check"><input type="checkbox" data-home-page="${key}" value="${esc(page.id)}" ${list.includes(page.id)?'checked':''}><span>${esc(page.navigationLabel)}</span></label>`).join('')}</div>`;}
function simpleHomeEdit(id){
  const h=state.draft.home;
  const fields={hero:[['Velkomst',field('Overskrift','home.title',{required:true})+field('Kort introduktion','home.description',{area:true})+assetField('Video','home.heroVideo','video')]],offers:[['Vuggestue og børnehave',assetField('Billede af vuggestuen','home.nurseryImage')+'<p class="hint">Kortene bruger afdelingernes egne tekster. Ret dem under Vuggestue eller Børnehave.</p>']],nature:[['Naturafsnittet',assetField('Billede','home.natureImage')+selectField('Hent tekst fra siden','home.naturePage',state.draft.pages.filter(page=>page.id).map(page=>[page.id,page.navigationLabel]))]],videos:[['Hverdagen',field('Overskrift','home.videoHeading')+'<label>Vælg videoer fra disse sider</label>'+simpleChecks('videoPages')]],practical:[['Praktiske links',field('Overskrift','home.practicalHeading')+'<label>Vælg de sider, du vil vise</label>'+simpleChecks('practicalPages')]]};
  let item=fields[id]?.[0];
  if(id.startsWith('block-')){const index=h.blocks.findIndex(block=>block.id===id.slice(6));const block=h.blocks[index];if(block)item=[simpleBlockTitle(block,index),block.type==='text'?simpleRichField('Tekst','home.blocks.'+index+'.html'):blockFields(block,'home.blocks.'+index)];}
  if(!item)return simpleHeading('Afsnittet findes ikke');
  return `<a class="simple-breadcrumb" href="#home">${si('back')}Forsiden</a>${simpleHeading(item[0],'Ret indholdet. Kladden gemmes automatisk.')}<div class="focus-card">${item[1]}</div><div class="focus-footer"><span>Bliver synligt, når du udgiver</span><button class="primary" data-simple-finish>Færdig ${si('check')}</button></div>`;
}
function simpleShared(){return simpleHeading('Fælles oplysninger','Ret oplysninger ét sted. De følger med på de sider, hvor de bruges.')+`<div class="simple-card-list">${Object.entries(sharedNames).map(([key,title])=>simpleLink(title,key==='visit'?'Invitationen på afdelingssiderne og forsiden':'Teksten, der vises på hjemmesiden','#shared-edit/'+key,'shared')).join('')}</div>`;}
function simpleSharedEdit(key){if(!sharedNames[key])return simpleShared();return `<a class="simple-breadcrumb" href="#shared">${si('back')}Fælles oplysninger</a>${simpleHeading(sharedNames[key],'Rettelserne gælder alle sider, der bruger denne oplysning.')}<div class="focus-card">${field('Overskrift','shared.'+key+'.title')}${simpleRichField('Tekst','shared.'+key+'.html')}</div><div class="focus-footer"><span>Gemmes som kladde</span><button class="primary" data-simple-finish>Færdig ${si('check')}</button></div>`;}
function simpleSettings(){return simpleHeading('Indstillinger','Her finder du de muligheder, du bruger en gang imellem.')+`<div class="simple-card-list">${simpleLink('Kontakt og menu','Adresse, telefon, logo og navigation','#site-settings','settings')}${simpleLink('Fælles oplysninger','Åbningstider, lukkedage, priser og rundvisning','#shared','shared')}${simpleLink('Dokumenter','Tilsyn, læreplaner og andre PDF-filer','#documents','files')}${simpleLink('Historik og backup','Se tidligere versioner og gendan en kladde','#history','pages')}${simpleLink('Forbrug og filkopier','Se lagerplads og grænser for gratis forbrug','#usage','settings')}</div>`;}
function simpleSiteSettings(){return simpleHeading('Kontakt og menu','Vælg det, du vil ændre.')+[['contact','Kontaktoplysninger','Navn, adresse, telefon og e-mail'],['logos','Logoer','Logo øverst og nederst på hjemmesiden'],['menu','Hovedmenu','Menupunkter og deres rækkefølge'],['footer','Sidefod','Teksten og links nederst på hjemmesiden']].map(([id,title,hint])=>simpleLink(title,hint,'#site-edit/'+id,'settings')).join('');}
function simpleSiteEdit(id){
  const settings=state.draft.settings,fields={contact:['Kontaktoplysninger',field('Børnehusets navn','settings.siteName',{required:true})+field('Adresse','settings.address')+field('Postnummer og by','settings.postcode')+field('Telefon','settings.phone',{type:'tel'})+field('E-mail','settings.email',{type:'email'})+field('Tekst på kontaktknappen','settings.contactLabel')],logos:['Logoer',assetField('Logo øverst','settings.logo')+assetField('Logo nederst','settings.footerLogo')],menu:['Hovedmenu','<p class="hint">Ret navn, vælg side, eller brug pilene til at flytte et menupunkt.</p>'+menuEditor()+'<button class="secondary" data-menu-add="root">Tilføj menupunkt</button> <button class="secondary" data-menu-group>Tilføj en gruppe</button>'],footer:['Sidefod',field('Tekst nederst','settings.copyright')+'<h2>Vis disse links</h2>'+state.draft.pages.filter(p=>p.id).map(p=>`<label class="check"><input type="checkbox" data-footer-page="${esc(p.id)}" ${settings.footerLinks.includes(p.id)?'checked':''}><span>${esc(p.navigationLabel)}</span></label>`).join('')]};
  const item=fields[id];if(!item)return simpleSiteSettings();return `<a class="simple-breadcrumb" href="#site-settings">${si('back')}Kontakt og menu</a>${simpleHeading(item[0],'Kladden gemmes automatisk.')}<div class="focus-card">${item[1]}</div><div class="focus-footer"><span>Bliver synligt, når du udgiver</span><button class="primary" data-simple-finish>Færdig ${si('check')}</button></div>`;
}
function simplePeople(){return simpleHeading('Medarbejdere','Vælg en person for at rette navn, billede eller oplysninger.',`<button class="secondary" data-new-person>${si('plus')} Tilføj medarbejder</button>`)+`<label class="simple-search">${si('people')}<input type="search" data-search value="${esc(query)}" placeholder="Find en medarbejder…" aria-label="Find en medarbejder"></label><div id="simple-list"></div><a class="text-button" href="#people-order">Flere muligheder: ændr rækkefølge</a>`;}
function simpleDocuments(){return simpleHeading('Dokumenter','Vælg et dokument for at udskifte filen eller rette titlen.',`<button class="secondary" data-new-document>${si('plus')} Tilføj dokument</button>`)+`<label class="simple-search">${si('files')}<input type="search" data-search value="${esc(query)}" placeholder="Find et dokument…" aria-label="Find et dokument"></label><div class="simple-tabs">${[['all','Alle'],['tilsyn','Tilsyn'],['laereplaner','Læreplaner']].map(([key,title])=>`<button data-simple-category="${key}" class="${docCategory===key?'selected':''}">${title}</button>`).join('')}</div><div id="simple-list"></div>`;}
function simpleDocumentEdit(id){
  const index=state.draft.documents.findIndex(doc=>doc.id===id),doc=state.draft.documents[index];if(!doc)return simpleHeading('Dokumentet findes ikke');
  return `<a class="simple-breadcrumb" href="#documents">${si('back')}Dokumenter</a>${simpleHeading(doc.label,'Vælg PDF-filen, og giv den en titel, forældrene kan genkende.')}<div class="focus-card">${field('Titel på hjemmesiden',`documents.${index}.label`,{required:true})}${assetField('PDF-fil',`documents.${index}.url`,'pdf')}${doc.url?`<p><a class="text-button" href="${esc(doc.url)}" target="_blank" rel="noopener">Åbn den valgte PDF ↗</a></p>`:''}${field('År',`documents.${index}.year`)}${selectField('Type',`documents.${index}.category`,[['tilsyn','Tilsynsrapport'],['laereplaner','Læreplan eller evaluering'],['other','Andet dokument']])}<details class="simple-advanced"><summary>Placering og flere muligheder</summary><h2>Vis dokumentet på</h2>${placements(doc,'documents',index)}<button class="danger" data-remove-document="${esc(doc.id)}">Fjern dokument</button></details></div><div class="focus-footer"><span>Gemmes, når du har valgt en PDF</span><button class="primary" data-simple-finish>Færdig ${si('check')}</button></div>`;
}
function simpleFiles(){return simpleHeading('Billeder og filer','Upload en fil, eller vælg en eksisterende fil.',`<label class="upload-button secondary">${si('plus')} Upload fil<input type="file" data-library-upload accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4,video/webm" hidden></label>`)+`<label class="simple-search">${si('files')}<input type="search" data-search value="${esc(query)}" placeholder="Find et billede eller en fil…" aria-label="Find en fil"></label><details class="simple-advanced"><summary>Flere muligheder</summary><button class="secondary" data-media-trash-view>${trashView?'Vis aktive filer':'Papirkurv'}</button><button class="secondary" data-import-originals>Gem egne kopier af oprindelige medier</button><p class="hint">Import til egne kopier ændrer kun kladden. Filer i brug bliver beskyttet mod sletning.</p></details><div id="media-list" class="media-grid"></div>`;}
function simplePageOptions(page){if(!page)return simplePages();const index=state.draft.pages.indexOf(page);return `<a class="simple-breadcrumb" href="#page/${encodeURIComponent(page.id)}">${si('back')}${esc(page.navigationLabel)}</a>${simpleHeading('Sideindstillinger','Du behøver normalt kun at rette indholdet på siden.')}<div class="focus-card">${field('Sidens overskrift',`pages.${index}.heading`,{required:true})}${field('Navn i menuen',`pages.${index}.navigationLabel`,{required:true})}${check('Vis siden på hjemmesiden',`pages.${index}.active`)}<details class="simple-advanced"><summary>Adresse og titel i browseren</summary>${field('Titel i browserfanen',`pages.${index}.documentTitle`)}<label>Adresse på hjemmesiden<input id="page-slug" value="${esc(page.id)}" aria-label="Adresse på hjemmesiden"></label><button class="secondary" data-rename-page="${esc(page.key)}">Anvend adresse</button><p class="hint">Tidligere adresser bliver sendt videre til den nye adresse.</p></details><details class="simple-advanced"><summary>Video øverst og andre medier</summary>${calendarField(page,index)}${assetField('Video',`pages.${index}.videos.0`,'video')}${page.id==='shelters'?assetField('Billede',`pages.${index}.images.0`):''}</details></div>`;}
function simpleHomeLayout(){const h=state.draft.home;return `<a class="simple-breadcrumb" href="#home">${si('back')}Forsiden</a>${simpleHeading('Rækkefølge og synlighed','Vælg hvilke dele af forsiden, der skal vises.')}<div class="focus-card">${h.sectionOrder.map((key,index)=>`<div class="section-row"><span>${esc(sectionNames[key])}</span><div><button class="quiet" data-section-move="${index}" data-direction="-1" aria-label="Flyt ${esc(sectionNames[key])} op" ${index===0?'disabled':''}>↑</button><button class="quiet" data-section-move="${index}" data-direction="1" aria-label="Flyt ${esc(sectionNames[key])} ned" ${index===h.sectionOrder.length-1?'disabled':''}>↓</button></div></div>`).join('')}<h2>Vis på forsiden</h2>${[['showOffers','Vuggestue og børnehave'],['showNature','Naturafsnit'],['showVideos','Videoklip'],['showPractical','Praktiske links'],['showVisit','Invitation til besøg'],['showSource','Forsidens øvrige tekst']].map(([key,title])=>check(title,'home.'+key)).join('')}</div>`;}

// Keep the original controls and listeners, and give navigation four clear destinations.
document.body.classList.add('admin-simple');
const simpleNav=[['pages','Sider','pages'],['people','Medarbejdere','people'],['media','Filer','files'],['settings','Indstillinger','settings']];
$('.sidebar nav').innerHTML=simpleNav.map(([key,title,icon])=>`<a href="#${key}" data-section="${key}">${si(icon)}<span>${title}</span></a>`).join('');
$('.sidebar nav').setAttribute('aria-label','Administration');
$('.admin-brand').href='#pages';$('.admin-brand span').textContent='Din hjemmeside';
$('#publish').textContent='Udgiv';$('#preview').innerHTML=si('eye')+'<span>Se kladde</span>';$('#preview').setAttribute('aria-label','Se kladde');$('#preview').title='Se kladden, som den vil se ud på hjemmesiden';
$('#save').hidden=true;$('#nav-toggle').hidden=true;
const simpleBackLink=document.createElement('a');simpleBackLink.className='simple-top-back';simpleBackLink.innerHTML=si('back')+'<span>Tilbage</span>';
simpleBackLink.setAttribute('aria-label','Tilbage');
$('.topbar').prepend(simpleBackLink);
const simpleBottom=document.createElement('nav');simpleBottom.className='simple-bottom-nav';simpleBottom.setAttribute('aria-label','Administration på mobil');simpleBottom.innerHTML=$('.sidebar nav').innerHTML;$('#workspace').append(simpleBottom);

const simpleLegacyFill=fillRows;
fillRows=function(){
  const {section}=sr(),q=query.toLocaleLowerCase('da'),list=$('#simple-list');
  if(['pages','overview'].includes(section)&&list){list.innerHTML=simplePageResults(['','vuggestue','boernehave'].map(simplePage).filter(Boolean),['praktisk/aabningstider','praktisk/priser','praktisk/kontakt'].map(simplePage).filter(Boolean));return;}
  if(section==='people'&&list){list.innerHTML=state.draft.people.filter(p=>p.active!==false&&(p.name+' '+p.role).toLocaleLowerCase('da').includes(q)).map(p=>simpleLink(p.name,p.role||'Medarbejder','#person/'+p.id,'people')).join('')||'<p class="simple-empty">Ingen medarbejdere fundet.</p>';return;}
  if(section==='documents'&&list){list.innerHTML=state.draft.documents.filter(p=>p.active!==false&&(docCategory==='all'||p.category===docCategory)&&p.label.toLocaleLowerCase('da').includes(q)).sort((a,b)=>a.order-b.order).map(p=>`<div class="document-card">${simpleLink(p.label,[p.year,p.pages.map(pageName).join(', ')].filter(Boolean).join(' · '),'#document/'+p.id,'files')}<div class="document-order"><button class="quiet" data-document-move="${p.id}" data-direction="-1" aria-label="Flyt ${esc(p.label)} op">↑</button><button class="quiet" data-document-move="${p.id}" data-direction="1" aria-label="Flyt ${esc(p.label)} ned">↓</button></div></div>`).join('')||'<p class="simple-empty">Ingen dokumenter fundet.</p>';return;}
  if(section==='people-order'){
    const records=orderedPeople();$('#rows').innerHTML=records.filter(p=>(p.name+' '+p.role).toLocaleLowerCase('da').includes(q)).map((p,index)=>`<tr><td>${esc(p.name)}</td><td><button class="quiet" data-person-move="${p.id}" data-direction="-1" aria-label="Flyt ${esc(p.name)} op" ${!peopleOrderPage||q||index===0?'disabled':''}>↑</button><button class="quiet" data-person-move="${p.id}" data-direction="1" aria-label="Flyt ${esc(p.name)} ned" ${!peopleOrderPage||q||index===records.length-1?'disabled':''}>↓</button></td></tr>`).join('');return;
  }
  if(section==='media')simpleLegacyFill();
};
richField=simpleRichField;
const simpleLegacyMount=mountEditors;
mountEditors=function(){simpleLegacyMount();for(const [path,editor]of editors){const sync=()=>{const tools=[...document.querySelectorAll('[data-image-tools]')].find(node=>node.dataset.imageTools===path);if(tools)tools.hidden=!editor.isActive('image');};editor.on('selectionUpdate',sync);sync();}};

function simpleLeaf(html){
  const node=inertNode(html);for(const aside of node.querySelectorAll('.editor-aside')){const detail=document.createElement('details');detail.className='simple-advanced';detail.innerHTML='<summary>Placering og flere muligheder</summary>'+aside.innerHTML;aside.replaceWith(detail);}
  return node.innerHTML+'<div class="focus-footer"><span>Gemmes som kladde</span><button class="primary" data-simple-finish>Færdig '+si('check')+'</button></div>';
}
render=function(){
  if(!state)return;for(const editor of editors.values())editor.destroy();editors.clear();
  const {section,id}=sr(),[key,blockId]=id.split('/'),page=state.draft.pages.find(p=>p.key===key);
  if(simpleLastRoute!==section+'/'+id)simpleOrganise=false;simpleLastRoute=section+'/'+id;
  const views={overview:simplePages,pages:simplePages,page:()=>{const p=simplePage(id);return p?(p.id?simplePageView(p):simpleHome()):simpleHeading('Siden findes ikke');},section:()=>simpleSectionView(page,page?.blocks.find(b=>b.id===blockId)),home:simpleHome,'home-edit':()=>simpleHomeEdit(id),'home-layout':simpleHomeLayout,shared:simpleShared,'shared-edit':()=>simpleSharedEdit(id),settings:simpleSettings,'site-settings':simpleSiteSettings,'site-edit':()=>simpleSiteEdit(id),usage:()=>simpleHeading('Forbrug og filkopier')+usagePanel(),people:simplePeople,'people-order':peopleView,person:()=>simpleLeaf(personView(id)),documents:simpleDocuments,document:()=>simpleDocumentEdit(id),media:simpleFiles,history:historyView,'page-options':()=>simpleLeaf(simplePageOptions(page))};
  $('#view').innerHTML=(views[section]||simplePages)();fillRows();if(section==='history')fillHistory();mountEditors();
  const focused=['section','home-edit','shared-edit','person','document','page-options','site-edit'].includes(section);
  document.body.classList.toggle('simple-focused',focused);simpleBackLink.href=simpleBack();simpleBackLink.hidden=['pages','overview','people','media','settings'].includes(section);
  const navKey=['people','person','people-order'].includes(section)?'people':section==='media'?'media':['settings','site-settings','site-edit','history','usage','shared','shared-edit','documents','document'].includes(section)?'settings':'pages';
  document.querySelectorAll('[data-section]').forEach(link=>{const active=link.dataset.section===navKey;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
  document.title=($('#view h1')?.textContent||'Administration')+' · Ønskelandet';$('#view').inert=busy;simpleUpdateStatus();
};

// Reuse the validated page creation flow; advanced choices can wait until needed.
const simpleNewPage=newPage;
newPage=function(){simpleNewPage();const form=$('#new-page-form'),advanced=document.createElement('details');advanced.className='simple-advanced';advanced.innerHTML='<summary>Sideadresse</summary>';$('#new-page-menu').value='main';advanced.append($('#new-page-slug').closest('label'));form.querySelector('.dialog-actions').before(advanced);};
function simpleAddSection(pageKey){
  let dialog=$('#simple-add-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='simple-add-dialog';dialog.className='dialog';document.body.append(dialog);}
  dialog.innerHTML=`<div class="dialog-heading"><h2>Hvad vil du tilføje?</h2><button class="quiet" data-close="simple-add-dialog" aria-label="Luk">✕</button></div><p>Vælg det, du har brug for. Du kan flytte afsnittet bagefter.</p><div class="simple-add-types">${[['text','Tekst','Overskrift, tekst og billeder'],['image','Billede','Et billede med billedtekst'],['video','Video','Vælg eller upload en video'],['shared','Fælles oplysninger','Åbningstider, priser eller rundvisning'],['documents','Dokumenter','Links til dine PDF-filer'],['contact','Kontakt','Telefon, e-mail og adresse']].map(([type,title,hint])=>`<button class="simple-card" data-simple-new-block="${type}" data-page-key="${esc(pageKey||'')}"><span class="card-icon">${si(type==='image'?'image':type==='shared'?'shared':'text')}</span><span><strong>${title}</strong><span>${hint}</span></span>${si('plus')}</button>`).join('')}</div>`;dialog.showModal();
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;const d=button.dataset;
  try{
    if(d.simpleRefresh!==undefined){render();return;}
    if(d.simpleAllPages!==undefined){simpleAllPages=!simpleAllPages;render();return;}
    if(d.simpleOrganise!==undefined){simpleOrganise=!simpleOrganise;render();return;}
    if(d.simpleCategory){docCategory=d.simpleCategory;render();return;}
    if(d.simpleAddPage!==undefined||d.simpleAddHome!==undefined){simpleAddSection(d.simpleAddPage);return;}
    if(d.simpleNewBlock){const type=d.simpleNewBlock,block={id:uid(),type,...({text:{html:'<p></p>'},image:{url:'',alt:'',caption:''},video:{url:'',caption:''},documents:{ids:[]},contact:{title:'Kontakt os'},shared:{key:'openingHours'}}[type])};const page=state.draft.pages.find(p=>p.key===d.pageKey);(page?page.blocks:state.draft.home.blocks).push(block);$('#simple-add-dialog').close();markDirty();simpleNavigate(page?'#section/'+page.key+'/'+block.id:'#home-edit/block-'+block.id);return;}
    if(d.simpleFinish!==undefined){if(await simplePersist())simpleNavigate(simpleBack());return;}
    if(d.simpleImage){const editor=editors.get(d.simpleImage);if(!editor)return;const replace=editor.isActive('image');picker('image',file=>{const attrs={src:file.url,alt:file.alt||''};if(replace)editor.chain().focus().updateAttributes('image',attrs).run();else editor.chain().focus().setImage(attrs).run();});return;}
    if(d.simpleRetry!==undefined){if([401,409].includes(simpleSaveError?.status)){window.open('/oenskelandet/admin/','_blank','noopener');return;}simpleSaveError=null;await simplePersist();}
  }catch(error){notice(error.message,true);}
});
// Opening a stale session in another tab must leave the local editor intact.
window.addEventListener('focus',()=>{if(dirty&&simpleSaveError?.status===401){simpleSaveError=null;simplePersist(false,true);}});
load=async function(){
  const session=await api('session');csrf=session.csrf||'';localMode=session.localMode;
  if(!session.authenticated)throw new Error('Din session er udløbet. Åbn administrationen igen for at logge ind med e-mail.');
  const fresh=await api('state');if(state&&dirty)state.media=fresh.media;else state=fresh;
  $('#login').hidden=true;$('#workspace').hidden=false;$('#mode-label').textContent='Ønskelandet · Administration';$('#logout').hidden=localMode;
  if(dirty)markDirty();else savedStatus();render();if(state.usage?.warning)notice('Du nærmer dig grænsen for gratis forbrug. Se forbruget under Indstillinger.',true);
};
