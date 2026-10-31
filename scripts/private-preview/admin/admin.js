'use strict';

// A new standalone client. Only the established protected CMS API/model is reused.
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const clone=value=>JSON.parse(JSON.stringify(value));
const node=html=>{const element=document.createElement('div');element.innerHTML=html||'';return element;};
const plain=html=>node(html).textContent.replace(/\s+/g,' ').trim();
const at=(object,path)=>path.split('.').reduce((value,key)=>value?.[key],object);
const put=(path,value)=>{const parts=path.split('.');let target=state.draft;for(let i=0;i<parts.length-1;i++)target=target[parts[i]]??=(/^\d+$/.test(parts[i+1])?[]:{});target[parts.at(-1)]=value;if(parts[0]==='people'&&parts.length>2)state.draft.people[Number(parts[1])].edited=true;};
const uid=()=>crypto.randomUUID();
const pageUrl=id=>'/oenskelandet/'+(id||'');
const pageById=id=>state.draft.pages.find(page=>page.id===id||page.aliases?.includes(id));
const pageByKey=key=>state.draft.pages.find(page=>page.key===key);
const sharedNames={openingHours:'Åbningstider',closingDays:'Lukkedage',prices:'Priser',visit:'Rundvisning'};
const blockNames={text:'Tekst',heading:'Overskrift',image:'Billede',video:'Video',documents:'Dokumenter',contact:'Kontakt',shared:'Fælles oplysninger'};
const homeNames={hero:'Velkomst',offers:'Vuggestue og børnehave',nature:'Legeplads og lokalområdet',videos:'Hverdagen',practical:'Praktiske oplysninger',visit:'Rundvisning',extra:'Ekstra indhold',source:'Øvrig tekst'};
let state=null,csrf='',dirty=false,pendingSave=null,saveTimer=null,saveError=null,publishing=false;
let editor=null,activeEdit=null,editInitial=null,editInitialModel=null,selectedPage='',descriptors=[],pickerCallback=null,pickerKind='image',confirmAction=null,frameScroll=0,frameGeneration=0,filesTrash=false;
let currentRoute='',listQuery='';

function message(text,error=false){const notice=$('#notice');notice.textContent=text;notice.hidden=!text;notice.className=error?'error':'';}
async function api(path,options={},retry=true){
  const response=await fetch('/oenskelandet/api/admin/'+path,{credentials:'same-origin',cache:'no-store',...options,headers:{...(typeof options.body==='string'?{'Content-Type':'application/json'}:{}),'X-CSRF-Token':csrf,...options.headers}});
  if(!(response.headers.get('content-type')||'').includes('application/json'))throw Object.assign(new Error('Log ind igen i en ny fane. Dine rettelser er bevaret her.'),{status:401});
  const data=await response.json();
  if(!response.ok){if(response.status===401&&retry&&path!=='session'){const session=await api('session',{},false);if(session.authenticated){csrf=session.csrf;return api(path,options,false);}}throw Object.assign(new Error(data.error||'Handlingen kunne ikke gennemføres.'),{status:response.status});}
  return data;
}
const comparable=value=>{
  if(typeof value==='string'&&/<[a-z][\s\S]*>/i.test(value)){const content=node(value);for(const element of content.querySelectorAll('*')){const attrs=[...element.attributes].map(attr=>[attr.name,attr.value]).sort(([a],[b])=>a.localeCompare(b));for(const attr of [...element.attributes])element.removeAttribute(attr.name);for(const [name,text]of attrs)element.setAttribute(name,text);}return content.innerHTML.replace(/>\s+</g,'><').replace(/\s+/g,' ').trim();}
  if(Array.isArray(value))return value.map(comparable);
  if(value&&typeof value==='object')return Object.keys(value).filter(key=>!['body','headings','originalHtml','baselineHtml','baselineTitle','activated','cmsVersion'].includes(key)).sort().map(key=>[key,comparable(value[key])]);return value;
};
const same=(a,b)=>JSON.stringify(comparable(a))===JSON.stringify(comparable(b));
function changes(){
  if(!state)return [];const result=[];
  for(const page of state.draft.pages){const old=state.published.pages.find(item=>item.key===page.key);if(!same(page,old)){const intro=p=>p?.blocks.find(block=>block.type==='text'&&node(block.html).querySelector('p'))?.html||'';const homeSource=['vuggestue','boernehave',state.draft.home.naturePage||'om/legeplads-og-lokalomraadet'].includes(page.id);result.push({label:page.navigationLabel||'Forsiden',note:homeSource&&(!same(old?.heading,page.heading)||!same(fragmentHtml(intro(old)),fragmentHtml(intro(page))))?'Vises også på forsiden.':'',before:old,after:page});}}
  for(const [key,label]of Object.entries(sharedNames))if(!same(state.draft.shared[key],state.published.shared[key])){const uses=state.draft.pages.filter(page=>page.blocks.some(block=>block.type==='shared'&&block.key===key)).map(page=>page.navigationLabel||'Forsiden');if(key==='visit')uses.push('Forsiden');result.push({label,note:'Opdaterer '+[...new Set(uses)].join(', ')+'.',before:state.published.shared[key],after:state.draft.shared[key]});}
  for(const [key,label]of Object.entries({home:'Forsiden',people:'Medarbejdere',documents:'Dokumenter',settings:'Menu og oplysninger',mediaDescriptions:'Billedbeskrivelser'}))if(!same(state.draft[key],state.published[key]))result.push({label,before:state.published[key],after:state.draft[key]});
  return result;
}
function status(){
  const text=saveError?'Kunne ikke gemme':publishing?'Udgiver…':pendingSave?'Gemmer…':dirty?'Gemmer snart…':changes().length?'Kladde gemt':'Alt er udgivet';
  $('#save-state').textContent=text;$('#save-state').className=saveError?'save-error':dirty?'unsaved':'';
  $('#publish').disabled=publishing||(!dirty&&!changes().length);$('#publish').textContent='Udgiv';
}
function markDirty(){dirty=true;saveError=null;status();clearTimeout(saveTimer);saveTimer=setTimeout(()=>persist(false,true),2500);saveTimer?.unref?.();}
function invalidDraft(){return state.draft.documents.some(doc=>doc.active!==false&&!doc.url)?'Vælg en PDF til dit nye dokument, før du gemmer.':'';}
async function persist(publish=false,quiet=false){
  clearTimeout(saveTimer);
  if(pendingSave){if(!await pendingSave)return false;if(!dirty&&!publish)return true;}
  if(!dirty&&!publish)return true;
  const invalid=invalidDraft();if(invalid){if(!quiet)editError(invalid);return false;}
  const snapshot=clone(state.draft),revision=state.revision;
  const task=(async()=>{
    publishing=publish;status();if(publish)$('#workspace').inert=true;
    try{
      const fresh=await api(publish?'publish':'save',{method:'POST',body:JSON.stringify({expectedRevision:revision,model:snapshot})});
      const latest=state.draft;dirty=JSON.stringify(latest)!==JSON.stringify(snapshot);state=dirty?{...fresh,draft:latest}:fresh;saveError=null;
      if(publish){message('Ændringerne er nu på hjemmesiden.');const link=document.createElement('a');link.href=pageUrl(selectedPage);link.target='_blank';link.rel='noopener';link.textContent='Se den opdaterede side ↗';$('#notice').append(' ',link);}
      return true;
    }catch(error){saveError=error;message(error.message,true);const button=document.createElement('button');button.className='text-button';button.dataset.retry='';button.textContent=error.status===401?'Log ind igen':error.status===409?'Åbn nyeste version':'Prøv igen';$('#notice').append(' ',button);return false;}
    finally{pendingSave=null;publishing=false;$('#workspace').inert=false;status();if(dirty&&!saveError){clearTimeout(saveTimer);saveTimer=setTimeout(()=>persist(false,true),2500);saveTimer?.unref?.();}}
  })();pendingSave=task;status();return task;
}
async function load(){
  const session=await api('session');if(!session.authenticated)throw new Error('Log ind med din e-mail for at åbne administrationen.');csrf=session.csrf;
  state=await api('state');$('#startup').hidden=true;$('#workspace').hidden=false;render();status();
  if(state.usage?.warning)message('Du nærmer dig grænsen for gratis forbrug. Se forbruget under Menu og oplysninger.',true);
}
function route(){const [section,...parts]=location.hash.slice(1).split('/');return {section:section||'home',id:decodeURIComponent(parts.join('/'))};}
function navigate(hash){location.hash=hash;render();}
function heading(title,text='',action=''){return `<div class="page-title"><div><h1>${esc(title)}</h1>${text?`<p>${esc(text)}</p>`:''}</div>${action}</div>`;}
function card(title,text,attributes='',image=''){return `<button class="item-card" ${attributes}>${image?`<img src="${esc(image)}" alt="" loading="lazy">`:'<span class="item-dot" aria-hidden="true">✎</span>'}<span><strong>${esc(title)}</strong><span>${esc(text)}</span></span><span aria-hidden="true">›</span></button>`;}
function linkCard(title,text,hash){return `<a class="item-card" href="${esc(hash)}"><span class="item-dot" aria-hidden="true">↗</span><span><strong>${esc(title)}</strong><span>${esc(text)}</span></span><span aria-hidden="true">›</span></a>`;}
function field(label,path,{type='text',area=false,required=false,hint=''}={}){return `<label class="field">${esc(label)}${area?`<textarea data-field="${esc(path)}" ${required?'required':''}>${esc(at(state.draft,path))}</textarea>`:`<input data-field="${esc(path)}" type="${type}" value="${esc(at(state.draft,path))}" ${required?'required':''}>`}${hint?`<span class="hint">${esc(hint)}</span>`:''}</label>`;}
function select(label,path,options){return `<label class="field">${esc(label)}<select data-field="${esc(path)}">${options.map(([value,title])=>`<option value="${esc(value)}" ${String(at(state.draft,path))===String(value)?'selected':''}>${esc(title)}</option>`).join('')}</select></label>`;}
function check(label,path){return `<label class="check"><input type="checkbox" data-field="${esc(path)}" ${at(state.draft,path)?'checked':''}><span>${esc(label)}</span></label>`;}
function asset(label,path,kind='image'){const url=at(state.draft,path)||'';return `<div class="field"><strong>${esc(label)}</strong>${url&&kind==='image'?`<img class="chosen-image" src="${esc(url)}" alt="Valgt billede">`:url?`<a class="file-link" href="${esc(url)}" target="_blank" rel="noopener">Åbn valgt ${kind==='pdf'?'PDF':'video'} ↗</a>`:''}<div class="asset-actions"><button class="secondary" data-pick="${esc(path)}" data-kind="${kind}">${url?'Skift':'Vælg'} ${kind==='image'?'billede':kind==='pdf'?'PDF':'video'}</button>${url?`<button class="text-button" data-clear="${esc(path)}">Fjern</button>`:''}</div><details><summary>Brug en linkadresse</summary>${field('Linkadresse',path)}</details></div>`;}
function rich(label,path,fragment=false){return `<div class="field rich-field"><label>${esc(label)}</label><div class="format-toolbar">${[['bold','Fed'],['italic','Kursiv'],['heading','Overskrift'],['bulletList','Liste'],['link','Link'],['image','Billede'],['undo','↶'],['redo','↷']].filter(([command])=>!fragment||!['heading','bulletList','image'].includes(command)).map(([command,title])=>`<button type="button" class="format-button" data-format="${command}" aria-label="${({undo:'Fortryd skrivning',redo:'Gentag skrivning'})[command]||title}">${title}</button>`).join('')}</div><div id="rich-editor" data-rich-path="${esc(path)}" data-fragment="${fragment?'firstParagraph':''}" data-editor-label="${esc(label)}"></div><p class="hint">${fragment?'Denne tekst vises også på den tilknyttede side.':'Du kan skrive overskrifter, indsætte links og ændre billeder direkte i teksten.'}</p></div>`;}
function firstParagraph(page){for(let index=0;index<page.blocks.length;index++){const block=page.blocks[index];if(block.type==='text'&&node(block.html).querySelector('p'))return `pages.${state.draft.pages.indexOf(page)}.blocks.${index}.html`;}return null;}
function fragmentHtml(html){return node(html).querySelector('p')?.outerHTML||'<p></p>';}
function replaceFragment(html,replacement){const content=node(html),paragraph=content.querySelector('p'),next=node(replacement);if(paragraph)paragraph.replaceWith(...next.childNodes);else content.prepend(...next.childNodes);return content.innerHTML;}
function blockTitle(block,index){if(block.type==='shared')return state.draft.shared[block.key]?.title||sharedNames[block.key];if(block.type==='text')return node(block.html).querySelector('h2,h3,h4')?.textContent||(index===0?'Introduktion':plain(block.html).slice(0,65)||'Tekst');return block.text||block.caption||blockNames[block.type];}

// Descriptors connect what is visibly on the website to its authoritative fields.
function pageDescriptors(id){
  const page=pageById(id);if(!page)return [];const index=state.draft.pages.indexOf(page),result=[];
  if(!id){
    const home=state.draft.home,nursery=pageById('vuggestue'),kindergarten=pageById('boernehave'),outside=pageById(home.naturePage||'om/legeplads-og-lokalomraadet');
    result.push({id:'hero',title:home.title,caption:'Velkomst øverst på forsiden',selector:'.hero-copy',kind:'hero',paths:['home.title','home.description','home.heroVideo']});
    for(const [key,source,selector,imagePath]of [['nursery',nursery,'.age-card:first-child .age-copy','home.nurseryImage'],['kindergarten',kindergarten,'.age-card:last-child .age-copy',null],['nature',outside,'.nature-copy','home.natureImage']])if(source){const i=state.draft.pages.indexOf(source),intro=firstParagraph(source);result.push({id:key,title:source.heading,caption:plain(intro?fragmentHtml(at(state.draft,intro)):''),selector,kind:'teaser',pageKey:source.key,imagePath,paths:[`pages.${i}.heading`,...(intro?[intro]:[]),imagePath||`pages.${i}.videos`]});}
    result.push({id:'videos',title:home.videoHeading||'Hverdagen',caption:'Overskrift og videoklip',selector:'.everyday .section-heading',kind:'videos',paths:['home.videoHeading','home.videoPages']},{id:'practical',title:home.practicalHeading||'Praktisk',caption:'Overskrift og links',selector:'[data-home-section="practical"] .section-heading',kind:'practical',paths:['home.practicalHeading','home.practicalPages']},{id:'visit',title:state.draft.shared.visit.title||'Rundvisning',caption:plain(state.draft.shared.visit.html),selector:'.visit-inner',kind:'shared',sharedKey:'visit',paths:['shared.visit']});
  }else{
    result.push({id:'title',title:page.heading,caption:'Sidens overskrift',selector:'.page-heading',kind:'title',pageKey:page.key,paths:[`pages.${index}.heading`]});
    if(page.videos?.length||page.id==='shelters')result.push({id:'page-media',title:page.id==='shelters'?'Billedet øverst':'Videoen øverst',caption:'Skift eller fjern',selector:'.article-film',kind:'page-media',pageKey:page.key,paths:[`pages.${index}.videos`,`pages.${index}.images`]});
  }
  const addBlocks=(blocks,path,sourcePage)=>blocks.forEach((block,i)=>result.push({id:'block-'+block.id,title:blockTitle(block,i),caption:block.type==='text'?plain(block.html).slice(0,250):blockNames[block.type],searchText:block.type==='text'?plain(block.html):'',kind:'block',blockId:block.id,path:path+'.'+i,listPath:path,pageKey:sourcePage?.key,paths:[...(block.type==='shared'?['shared.'+block.key]:[path+'.'+i]),...(block.type==='contact'?['settings']:[])],blockIndex:i}));
  if(!id)addBlocks(state.draft.home.blocks,'home.blocks');addBlocks(page.blocks,`pages.${index}.blocks`,page);
  return result;
}
function descriptor(id){return descriptors.find(item=>item.id===id);}
function websiteView(id){
  const page=pageById(id);selectedPage=page?.id||'';descriptors=pageDescriptors(selectedPage);
  return `<div class="site-toolbar"><label for="page-select">Du redigerer<select id="page-select">${state.draft.pages.map(p=>`<option value="${esc(p.id)}" ${p.id===selectedPage?'selected':''}>${esc(p.id?p.navigationLabel:'Forsiden')}${p.active===false?' (skjult)':''}</option>`).join('')}</select></label><button class="secondary" id="find-content">Find tekst</button><button class="icon-button" id="page-options" aria-label="Sideindstillinger">⋯</button><a class="desktop-link" href="${esc(pageUrl(selectedPage))}" target="_blank" rel="noopener">Se hjemmesiden ↗</a></div><div class="editing-tip"><span aria-hidden="true">✎</span><span>Tryk på <strong>Ret tekst</strong> dér, hvor du vil ændre noget.</span></div><h1 class="sr-only">Rediger ${esc(selectedPage?page?.navigationLabel:'forsiden')}</h1><div class="site-stage"><iframe id="site-frame" title="Hjemmesiden – vælg det, du vil rette" src="${esc(pageUrl(selectedPage))}?preview=1"></iframe><div id="frame-help" hidden><p>Kan du ikke se det, du vil ændre?</p><button class="secondary" data-content>Find tekst og billeder</button></div></div>`;
}
function render(){
  if(!state)return;const r=route(),key=r.section+'/'+r.id;if(currentRoute===key&&$('#site-frame'))return;currentRoute=key;listQuery='';
  $('#menu-dialog').close();const views={people:peopleView,documents:documentsView,files:filesView,settings:settingsView,history:historyView};
  const website=!views[r.section];$('#view').className=website?'website-view':'collection-view';
  $('#view').innerHTML=website?websiteView(r.section==='page'?r.id:''):views[r.section]();
  if(website)$('#site-frame').addEventListener('load',connectFrame);else if(r.section==='history')fillHistory();
  document.title=website?'Rediger '+(selectedPage?pageById(selectedPage)?.navigationLabel:'forsiden')+' · Ønskelandet':($('#view h1')?.textContent||'Administration')+' · Ønskelandet';status();
}
function refreshFrame(){const frame=$('#site-frame');if(!frame)return;try{frameScroll=frame.contentWindow.scrollY;}catch{}frame.src=pageUrl(selectedPage)+'?preview=1';}
function connectFrame(){
  const frame=$('#site-frame');if(!frame)return;let doc;try{doc=frame.contentDocument;if(!doc?.body)throw new Error();}catch{$('#frame-help').hidden=false;return;}
  const generation=++frameGeneration;let timer,connected=false;
  const decorate=()=>{
    if(generation!==frameGeneration)return;const main=doc.querySelector('main');if(!main?.querySelector('.hero,.page-heading'))return;
    observer?.disconnect();descriptors=pageDescriptors(selectedPage);
    if(!doc.getElementById('oenskelandet-edit-style')){const style=doc.createElement('link');style.id='oenskelandet-edit-style';style.rel='stylesheet';style.href='/oenskelandet/admin/frame.css';doc.head.append(style);}
    doc.querySelectorAll('.oe-edit-button').forEach(button=>button.remove());doc.querySelectorAll('.oe-editable').forEach(element=>element.classList.remove('oe-editable'));
    const add=(target,item,label='Ret tekst',image=false)=>{if(!target)return;target.classList.add('oe-editable');const button=doc.createElement('button');button.type='button';button.className='oe-edit-button'+(image?' oe-image-button':'');button.dataset.editId=item.id;button.dataset.imageOnly=image?'true':'';button.textContent='✎ '+label;button.setAttribute('aria-label',label+': '+item.title);target.prepend(button);};
    for(const item of descriptors){
      if(item.selector)add(doc.querySelector(item.selector),item,item.kind==='page-media'?'Skift '+(pageById(selectedPage)?.id==='shelters'?'billede':'video'):'Ret tekst');
      if(item.kind==='teaser')add(doc.querySelector(item.id==='nature'?'.nature-photo':item.id==='nursery'?'.age-card:first-child .age-photo':'.age-card:last-child .age-photo'),item,item.imagePath?'Skift billede':'Skift video',true);
      if(item.kind==='hero')add(doc.querySelector('.hero-visual'),item,'Skift video',true);
      if(item.kind==='block'){
        const block=at(state.draft,item.path),scope=doc.querySelector(!selectedPage?(item.listPath==='home.blocks'?'[data-home-section="extra"] .article-body':'.source-home-content .article-body'):'.article-main .article-body');if(!scope)continue;
        const heading=block.type==='shared'?(!state.draft.shared[block.key]?.activated&&block.originalHtml?node(block.originalHtml).querySelector('h2,h3,h4')?.textContent:state.draft.shared[block.key]?.title):node(block.html||'').querySelector('h2,h3,h4')?.textContent||block.text;
        const target=heading?[...scope.querySelectorAll('h2,h3,h4')].find(element=>element.textContent.trim()===heading.trim()):item.blockIndex===0?scope.firstElementChild:null;
        if(target)add(target,item,block.type==='image'?'Skift billede':block.type==='documents'?'Ret dokumenter':'Ret tekst');
      }
    }
    if(!connected){connected=true;doc.addEventListener('click',event=>{
      const edit=event.target.closest('[data-edit-id]');if(edit){event.preventDefault();event.stopImmediatePropagation();openDescriptor(descriptor(edit.dataset.editId),edit.dataset.imageOnly==='true');return;}
      const anchor=event.target.closest('a[href]');if(anchor){const url=new URL(anchor.href,location.href);if(url.origin===location.origin&&url.pathname.startsWith('/oenskelandet/')&&!url.pathname.includes('/uploads/')&&!url.pathname.includes('/admin')){const id=decodeURIComponent(url.pathname.slice('/oenskelandet/'.length)).replace(/\/$/,'');if(pageById(id)){event.preventDefault();event.stopImmediatePropagation();frameScroll=0;currentRoute='';navigate(id?'page/'+encodeURIComponent(id):'home');}}}
    },true);}
    if(frameScroll){frame.contentWindow.scrollTo(0,frameScroll);frameScroll=0;}
    $('#frame-help').hidden=true;
  };
  const observer=typeof MutationObserver==='function'?new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(decorate,60);}):null;
  observer?.observe(doc.body,{childList:true,subtree:true});decorate();
}

function pageChecks(label,key){const values=state.draft.home[key];return `<fieldset><legend>${esc(label)}</legend>${state.draft.pages.filter(page=>page.id).map(page=>`<label class="check"><input type="checkbox" data-home-list="${key}" value="${esc(page.id)}" ${values.includes(page.id)?'checked':''}><span>${esc(page.navigationLabel)}</span></label>`).join('')}</fieldset>`;}
function blockFields(item){
  const block=at(state.draft,item.path),path=item.path;
  if(block.type==='text')return rich('Tekst',path+'.html');
  if(block.type==='heading')return field('Overskrift',path+'.text')+select('Størrelse',path+'.level',[['2','Overskrift'],['3','Underoverskrift']]);
  if(block.type==='image')return asset('Billede',path+'.url')+field('Beskriv billedet',path+'.alt',{hint:'Beskrivelsen hjælper besøgende, der ikke kan se billedet.'})+field('Tekst under billedet',path+'.caption');
  if(block.type==='video')return asset('Video',path+'.url','video')+field('Tekst under videoen',path+'.caption');
  if(block.type==='shared')return sharedFields(block.key);
  if(block.type==='contact')return field('Overskrift',path+'.title')+contactFields();
  if(block.type==='documents')return `<fieldset><legend>Vis disse dokumenter</legend>${state.draft.documents.filter(doc=>doc.active!==false).map(doc=>`<label class="check"><input type="checkbox" data-document-list="${esc(path)}" value="${esc(doc.id)}" ${block.ids.includes(doc.id)?'checked':''}><span>${esc(doc.label)}</span></label>`).join('')}</fieldset>`;
  return '';
}
function sharedFields(key){return field('Overskrift','shared.'+key+'.title')+rich('Tekst','shared.'+key+'.html');}
function contactFields(){return field('Navn','settings.siteName',{required:true})+field('Adresse','settings.address')+field('Postnummer og by','settings.postcode')+field('Telefon','settings.phone',{type:'tel'})+field('E-mail','settings.email',{type:'email'});}
function descriptorFields(item,imageOnly=false){
  const page=item.pageKey?pageByKey(item.pageKey):null,index=page?state.draft.pages.indexOf(page):-1;
  if(item.kind==='teaser'){
    if(imageOnly)return item.imagePath?asset('Billede',item.imagePath):asset('Video',`pages.${index}.videos.0`,'video');
    const intro=firstParagraph(page);return field('Overskrift',`pages.${index}.heading`,{required:true})+(intro?rich('Teksten på forsiden',intro,true):'<p>Denne side har endnu ingen introduktion.</p>')+`<p class="linked-note">Teksten vises også på siden “${esc(page.navigationLabel)}”. Du kan rette den her.</p>`;
  }
  if(item.kind==='hero')return imageOnly?asset('Video','home.heroVideo','video'):field('Overskrift','home.title',{required:true})+field('Kort introduktion','home.description',{area:true});
  if(item.kind==='videos')return field('Overskrift','home.videoHeading')+pageChecks('Vis videoer fra','videoPages');
  if(item.kind==='practical')return field('Overskrift','home.practicalHeading')+pageChecks('Vis disse links','practicalPages');
  if(item.kind==='shared')return sharedFields(item.sharedKey);
  if(item.kind==='title')return field('Overskrift',`pages.${index}.heading`,{required:true});
  if(item.kind==='page-media')return page.id==='shelters'?asset('Billede',`pages.${index}.images.0`):asset('Video',`pages.${index}.videos.0`,'video');
  if(item.kind==='block')return blockFields(item);
  return '';
}
function editError(text){$('#edit-error').textContent=text;$('#edit-error').hidden=!text;}
function openEdit(title,html,{context='',explanation='Dine rettelser gemmes som kladde. Tryk Udgiv for at vise dem på hjemmesiden.',paths=[],onDone=null,onRevert=null}={}){
  editor?.destroy();editor=null;activeEdit={paths,onDone,onRevert,revision:state.revision};editInitial=paths.map(path=>[path,clone(at(state.draft,path)??null)]);editInitialModel=clone(state.draft);
  $('#edit-title').textContent=title;$('#edit-context').textContent=context;$('#edit-explanation').textContent=explanation;$('#edit-fields').innerHTML=html;editError('');$('#edit-revert').hidden=!paths.length&&!onRevert;
  const mount=$('#rich-editor');if(mount&&window.OenskelandetEditor){const path=mount.dataset.richPath,fragment=mount.dataset.fragment==='firstParagraph',original=at(state.draft,path);editor=window.OenskelandetEditor.mount(mount,fragment?fragmentHtml(original):original,html=>{put(path,fragment?replaceFragment(original,html):html);markDirty();},{singleParagraph:fragment});}
  if($('#new-block-shared'))$('#new-block-shared').closest('label').hidden=$('#new-block-type').value!=='shared';
  if(!$('#edit-dialog').open)$('#edit-dialog').showModal();$('#edit-dialog').scrollTop=0;
}
function openDescriptor(item,imageOnly=false){if(!item)return;const title=imageOnly?(item.kind==='hero'||item.id==='kindergarten'?'Skift video':'Skift billede'):item.kind==='teaser'||item.kind==='hero'?'Ret teksten':'Ret '+item.title;openEdit(title,descriptorFields(item,imageOnly),{context:selectedPage?(pageById(selectedPage)?.navigationLabel||'Side'):'Forsiden',paths:item.paths,explanation:item.kind==='shared'||item.kind==='block'&&at(state.draft,item.path)?.type==='shared'?'Denne oplysning bruges flere steder. Din rettelse opdaterer alle placeringer efter udgivelse.':undefined});}
async function finishEdit(){
  const invalid=[...$('#edit-fields').querySelectorAll('input,textarea,select')].find(input=>!input.checkValidity());if(invalid){invalid.reportValidity();return false;}
  if(activeEdit?.onDone){if(!await activeEdit.onDone())return false;activeEdit.onDone=null;}
  const changed=dirty||state.revision!==activeEdit?.revision;if(!await persist())return false;editor?.destroy();editor=null;$('#edit-dialog').close();activeEdit=null;if(changed)refreshFrame();if(!$('#site-frame')){currentRoute='';render();}return true;
}
async function revertEdit(){
  if(activeEdit?.onRevert)await activeEdit.onRevert();else for(const [path,value]of editInitial||[])put(path,value);
  markDirty();editor?.destroy();editor=null;$('#edit-dialog').close();activeEdit=null;await persist();refreshFrame();if(!$('#site-frame')){currentRoute='';render();}
}
function contentResults(){const query=$('#content-search').value.toLocaleLowerCase('da');descriptors=pageDescriptors(selectedPage);const matches=descriptors.filter(item=>(item.title+' '+item.caption+' '+(item.searchText||'')).toLocaleLowerCase('da').includes(query));$('#content-results').innerHTML=matches.map(item=>card(item.title,item.caption,`data-edit="${esc(item.id)}"`)).join('')||'<p>Ingen resultater. Prøv et andet ord fra siden.</p>';$('#content-results').innerHTML+=`<div class="content-bottom"><button class="secondary" data-add-section>Tilføj tekst eller billede</button><button class="text-button" data-arrange>Flyt eller fjern afsnit</button></div>`;}
function openContent(){ $('#content-search').value='';contentResults();$('#content-dialog').showModal();}

function ask(title,html,action,label='Fortsæt'){confirmAction=action;$('#confirm-title').textContent=title;$('#confirm-content').innerHTML=html;$('#confirm-action').textContent=label;$('#confirm-error').hidden=true;$('#confirm-dialog').showModal();}
function readable(value){if(value==null)return '';if(typeof value==='string')return plain(value);if(Array.isArray(value))return value.map(readable).join('\n');if(typeof value==='object')return Object.entries(value).filter(([key])=>!['id','key','body','headings','baselineHtml','baselineTitle','originalHtml','source','sourceHtml','aliases','activated','edited'].includes(key)).map(([,child])=>readable(child)).filter(Boolean).join('\n');return String(value);}
async function reviewPublication(){
  if(!await persist())return;const items=changes();if(!items.length){message('Alt er allerede udgivet.');return;}
  ask('Vis ændringerne på hjemmesiden',`<p>Følgende bliver opdateret, når du udgiver:</p><ul class="change-list">${items.map(item=>`<li><strong>${esc(item.label)}</strong>${item.note?`<p class="hint">${esc(item.note)}</p>`:''}<details><summary>Se ændringen</summary><div class="comparison"><div><h3>Før</h3><p>${esc(readable(item.before).slice(0,2400))}</p></div><div><h3>Efter</h3><p>${esc(readable(item.after).slice(0,2400))}</p></div></div></details></li>`).join('')}</ul>`,async()=>{if(!await persist(true))return false;refreshFrame();return true;},'Udgiv nu');
}

function peopleView(){return heading('Medarbejdere','Vælg den medarbejder, du vil ændre.','<button class="primary" data-new-person>Tilføj medarbejder</button>')+'<label class="search"><span class="sr-only">Find medarbejder</span><input data-search type="search" placeholder="Søg efter navn eller rolle…"></label><div id="collection-results">'+peopleResults()+'</div>'+card('Rækkefølge på hjemmesiden','Vælg en side, og flyt medarbejderne','data-setting="people-order"');}
function peopleResults(){return state.draft.people.filter(person=>person.active!==false&&(person.name+' '+person.role).toLocaleLowerCase('da').includes(listQuery.toLocaleLowerCase('da'))).map(person=>card(person.name,person.role||'Medarbejder',`data-person="${esc(person.id)}"`,person.image)).join('')||'<p class="empty">Ingen medarbejdere fundet.</p>';}
function placements(record,kind,index){return `<fieldset><legend>Vis på disse sider</legend>${state.draft.pages.filter(page=>page.id).map(page=>`<label class="check"><input type="checkbox" data-placement="${kind}.${index}.pages" value="${esc(page.id)}" ${record.pages.includes(page.id)?'checked':''}><span>${esc(page.navigationLabel)}</span></label>`).join('')}</fieldset>`;}
function openPerson(id,isNew=false){
  const index=state.draft.people.findIndex(person=>person.id===id),person=state.draft.people[index],path='people.'+index;if(!person)return;
  openEdit(isNew?'Tilføj medarbejder':person.name,field('Navn',path+'.name',{required:true})+field('Stilling eller rolle',path+'.role')+asset('Billede',path+'.image')+select('Afdeling',path+'.group',['Ledelse','Vuggestue','Børnehave','Drift','Medarbejdere'].map(group=>[group,group]))+`<details><summary>Kontakt og placering</summary>${field('E-mail',path+'.email',{type:'email'})}${field('Telefon',path+'.phone',{type:'tel'})}${placements(person,'people',index)}</details>${!isNew?`<details class="danger-zone"><summary>Fjern medarbejder</summary><button class="danger" data-remove-person="${esc(id)}">Fjern fra hjemmesiden</button></details>`:''}`,{context:'Medarbejdere',paths:[path],onRevert:isNew?()=>{state.draft.people=state.draft.people.filter(p=>p.id!==id);}:null});
}
function newPerson(){const id=uid();state.draft.people.push({id,name:'Ny medarbejder',role:'',email:'',phone:'',group:'Medarbejdere',image:'',pages:['om/medarbejdere'],order:state.draft.people.length,active:true,edited:true});openPerson(id,true);markDirty();}
function documentsView(){return heading('Dokumenter','Vælg en PDF for at ændre titel eller udskifte filen.','<button class="primary" data-new-document>Tilføj dokument</button>')+'<label class="search"><span class="sr-only">Find dokument</span><input data-search type="search" placeholder="Søg efter titel…"></label><div id="collection-results">'+documentResults()+'</div>';}
function documentResults(){return state.draft.documents.filter(doc=>doc.active!==false&&doc.label.toLocaleLowerCase('da').includes(listQuery.toLocaleLowerCase('da'))).sort((a,b)=>a.order-b.order).map(doc=>card(doc.label,[doc.year,doc.category==='tilsyn'?'Tilsyn':doc.category==='laereplaner'?'Læreplan':'Dokument'].filter(Boolean).join(' · '),`data-document="${esc(doc.id)}"`)).join('')||'<p class="empty">Ingen dokumenter fundet.</p>';}
function openDocument(id,isNew=false){const index=state.draft.documents.findIndex(doc=>doc.id===id),doc=state.draft.documents[index],path='documents.'+index;if(!doc)return;
  const html=field('Titel',path+'.label',{required:true})+asset('PDF-fil',path+'.url','pdf')+field('År',path+'.year')+select('Type',path+'.category',[['tilsyn','Tilsynsrapport'],['laereplaner','Læreplan eller evaluering'],['other','Andet dokument']])+`<details><summary>Vis på bestemte sider</summary>${placements(doc,'documents',index)}</details><details><summary>Rækkefølge og flere muligheder</summary>${field('Placering i dokumentlisten (laveste tal først)',path+'.order',{type:'number'})}${!isNew?`<button class="danger" data-remove-document="${esc(id)}">Fjern dokument</button>`:''}</details>`;
  openEdit(isNew?'Tilføj dokument':doc.label,html,{context:'Dokumenter',paths:[path],onRevert:isNew?()=>{state.draft.documents=state.draft.documents.filter(p=>p.id!==id);}:null});
}
function newDocument(){const id=uid();state.draft.documents.push({id,label:'Nyt dokument',year:String(new Date().getFullYear()),url:'',category:'tilsyn',pages:['tilsyn'],order:0,active:true});openDocument(id,true);dirty=true;status();}
function library(){
  const files=state.media.filter(file=>!file.trashedAt&&!file.deletedAt&&!file.purgingAt),seen=new Set(files.map(file=>file.url));
  const scan=value=>{if(typeof value==='string'){for(const match of value.matchAll(/https?:[^\s"<>]+\.(?:png|jpe?g|gif|webp|svg|pdf|mp4|webm)(?:\?[^\s"<>]*)?/gi))if(!seen.has(match[0])){seen.add(match[0]);let name;try{name=decodeURIComponent(match[0].split('/').pop());}catch{name='Oprindelig fil';}files.push({url:match[0],name,original:true,type:/\.pdf/i.test(match[0])?'application/pdf':/\.(mp4|webm)/i.test(match[0])?'video/mp4':'image/png'});}}else if(value&&typeof value==='object')for(const child of Object.values(value))scan(child);};scan(state.draft);return files;
}
const fileKind=file=>file.type?.startsWith('image/')?'image':file.type?.startsWith('video/')?'video':'pdf';
function fileTile(file,pick=false){return `<article class="file-card"><button class="file-choice" ${pick?`data-choose="${esc(file.url)}"`:`data-file="${esc(file.id||file.url)}"`}><span class="file-thumb">${fileKind(file)==='image'?`<img src="${esc(file.url)}" alt="" loading="lazy">`:fileKind(file)==='pdf'?'PDF':'▶'}</span><strong>${esc(file.name)}</strong><span>${file.original?'Oprindelig fil':file.trashedAt?'I papirkurven':fileKind(file)==='image'?'Billede':fileKind(file)==='pdf'?'PDF':'Video'}</span></button></article>`;}
function filesView(){return heading(filesTrash?'Papirkurv':'Billeder og filer','Vælg en fil for at se oplysninger eller ændre dens navn.','<label class="primary upload">Upload fil<input id="library-upload" type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4,video/webm" hidden></label>')+'<label class="search"><span class="sr-only">Find fil</span><input data-search type="search" placeholder="Søg efter navn…"></label><div id="collection-results" class="file-grid">'+fileResults()+'</div><details class="collection-options"><summary>Filkopier og papirkurv</summary><button class="secondary" data-trash-view>'+ (filesTrash?'Vis aktive filer':'Åbn papirkurven')+'</button><button class="secondary" data-import-files>Gem egne kopier af oprindelige filer</button><p class="hint">Filer i brug bliver beskyttet mod sletning. Grænserne for gratis forbrug gælder også filkopier.</p></details>';}
function fileResults(){return (filesTrash?state.media.filter(file=>file.trashedAt&&!file.deletedAt):library()).filter(file=>file.name.toLocaleLowerCase('da').includes(listQuery.toLocaleLowerCase('da'))).map(file=>fileTile(file)).join('')||'<p class="empty">Ingen filer fundet.</p>';}
function picker(kind,callback){pickerKind=kind;pickerCallback=callback;$('#media-title').textContent=kind==='image'?'Vælg et billede':kind==='video'?'Vælg en video':'Vælg en PDF';$('#picker-search').value='';$('#picker-status').textContent='';$('#picker-upload').accept=kind==='image'?'image/jpeg,image/png,image/webp,image/gif':kind==='video'?'video/mp4,video/webm':'application/pdf';fillPicker();$('#media-dialog').showModal();}
function fillPicker(){const query=$('#picker-search').value.toLocaleLowerCase('da');$('#picker-list').innerHTML=library().filter(file=>fileKind(file)===pickerKind&&file.name.toLocaleLowerCase('da').includes(query)).map(file=>fileTile(file,true)).join('')||'<p class="empty">Ingen filer fundet. Upload en ny fil ovenfor.</p>';}
async function upload(file){if(!file)return null;try{const record=await api('upload',{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream','X-File-Name':encodeURIComponent(file.name)},body:file});state.media.unshift(record);state.usage=await api('usage');return record;}catch(error){message(error.message,true);$('#picker-status').textContent=error.message;return null;}}
async function fileDetails(id){
  const file=library().find(item=>item.id===id||item.url===id)||state.media.find(item=>item.id===id);if(!file)return;
  if(file.original){ask(file.name,`<p>Dette er en fil fra den oprindelige hjemmeside.</p><a class="secondary" href="${esc(file.url)}" target="_blank" rel="noopener">Åbn filen ↗</a><p>Du kan gemme en egen kopi i dit filbibliotek. Kladden bliver opdateret til at bruge kopien.</p>`,async()=>{await importFile(file.url);message('Egen kopi gemt i kladden. Udgiv for at bruge den på hjemmesiden.');currentRoute='';render();return true;},'Gem egen kopi');return;}
  const info=await api('media-info',{method:'POST',body:JSON.stringify({id:file.id})});
  ask('Filoplysninger',`${fileKind(file)==='image'?`<img class="chosen-image" src="${esc(file.url)}" alt="">`:''}<label class="field">Navn<input id="file-name" value="${esc(file.name)}" required></label><label class="field">Billedbeskrivelse<textarea id="file-alt">${esc(file.alt||'')}</textarea></label><p class="hint">I brug på hjemmesiden: ${info.published.map(use=>esc(use.label)).join(', ')||'Ingen placeringer'}</p><p class="hint">I brug i kladden: ${info.draft.map(use=>esc(use.label)).join(', ')||'Ingen placeringer'}</p><details><summary>Fjern eller gendan fil</summary>${file.trashedAt?`<button class="secondary" data-media-action="restore" data-id="${esc(file.id)}">Gendan fil</button><button class="danger" data-media-action="purge" data-id="${esc(file.id)}">Slet permanent</button>`:`<button class="danger" data-media-action="trash" data-id="${esc(file.id)}" ${info.draft.length||info.published.length?'disabled':''}>Flyt til papirkurv</button>`}<p class="hint">Filer i brug kan ikke slettes. Permanent sletning kræver mindst syv dage i papirkurven og ingen historikreferencer.</p></details>`,async()=>{const updated=await api('media-update',{method:'POST',body:JSON.stringify({id:file.id,name:$('#file-name').value,alt:$('#file-alt').value})});state.media=state.media.map(item=>item.id===updated.id?updated:item);state.draft.mediaDescriptions||={};state.draft.mediaDescriptions[file.url]={alt:updated.alt};markDirty();await persist();currentRoute='';render();return true;},'Gem oplysninger');
}
async function importFile(url){const record=await api('media-import',{method:'POST',body:JSON.stringify({url})});state.media=[record,...state.media.filter(file=>file.id!==record.id)];state.draft=JSON.parse(JSON.stringify(state.draft).split(url).join(record.url));markDirty();state.usage=await api('usage');return record;}
function settingsView(){return heading('Menu og oplysninger','Vælg det, du vil ændre.')+[
  ['contact','Kontaktoplysninger','Adresse, telefon og e-mail'],['navigation','Hovedmenu','Menupunkter og rækkefølge'],['logos','Logoer og sidefod','Logoer, tekst og links nederst'],['pages','Alle sider','Tilføj sider eller ændr adresse og synlighed'],['shared','Fælles oplysninger','Åbningstider, lukkedage, priser og rundvisning'],['layout','Forsidens opbygning','Flyt, vis eller skjul afsnit'],['people-order','Medarbejdernes rækkefølge','Bestem rækkefølgen på hver side'],['usage','Forbrug','Lagerplads og gratis grænser']
].map(([key,title,text])=>card(title,text,`data-setting="${key}"`)).join('');}
function menuFields(items=state.draft.settings.navigation,path='settings.navigation'){
  return items.map((item,index)=>`<div class="menu-row">${field(item.children?'Gruppens navn':'Navn i menuen',path+'.'+index+'.label')}${!item.children?select('Åbn siden',path+'.'+index+'.pageId',state.draft.pages.map(page=>[page.id,page.id?page.navigationLabel:'Forsiden'])):''}${check('Vis menupunkt',path+'.'+index+'.active')}<div class="row-actions"><button class="secondary" data-menu-move="${path}" data-index="${index}" data-direction="-1" aria-label="Flyt menupunkt op" ${index===0?'disabled':''}>↑</button><button class="secondary" data-menu-move="${path}" data-index="${index}" data-direction="1" aria-label="Flyt menupunkt ned" ${index===items.length-1?'disabled':''}>↓</button><button class="text-button" data-menu-remove="${path}" data-index="${index}">Fjern</button></div>${item.children?`<div class="menu-children">${menuFields(item.children,path+'.'+index+'.children')}<button class="secondary" data-menu-add="${path}.${index}.children">Tilføj i gruppen</button></div>`:''}</div>`).join('');
}
function openSetting(key){
  const titles={contact:'Kontaktoplysninger',navigation:'Hovedmenu',logos:'Logoer og sidefod',pages:'Alle sider',shared:'Fælles oplysninger',layout:'Forsidens opbygning','people-order':'Medarbejdernes rækkefølge',usage:'Forbrug'};
  let html='',paths=[];
  if(key==='contact'){html=contactFields()+field('Tekst på kontaktknappen','settings.contactLabel');paths=['settings'];}
  if(key==='logos'){html=asset('Logo øverst','settings.logo')+asset('Logo nederst','settings.footerLogo')+field('Tekst i sidefoden','settings.copyright')+'<fieldset><legend>Links i sidefoden</legend>'+state.draft.pages.filter(page=>page.id).map(page=>`<label class="check"><input type="checkbox" data-footer-page="${esc(page.id)}" ${state.draft.settings.footerLinks.includes(page.id)?'checked':''}><span>${esc(page.navigationLabel)}</span></label>`).join('')+'</fieldset>';paths=['settings'];}
  if(key==='navigation'){html=menuFields()+'<button class="secondary" data-menu-add="settings.navigation">Tilføj menupunkt</button> <button class="secondary" data-menu-group>Tilføj gruppe</button>';paths=['settings.navigation'];}
  if(key==='pages'){html=state.draft.pages.map(page=>card(page.id?page.navigationLabel:'Forsiden',pageUrl(page.id),`data-page-settings="${esc(page.key)}"`)).join('')+'<button class="primary" data-new-page>Tilføj side</button>';}
  if(key==='shared')html=Object.entries(sharedNames).map(([id,title])=>card(title,'Ret oplysningen alle steder, hvor den bruges',`data-shared="${id}"`)).join('');
  if(key==='layout'){html='<p>Flyt afsnit op eller ned med pilene.</p>'+state.draft.home.sectionOrder.map((id,index)=>`<div class="order-row"><strong>${homeNames[id]}</strong><div><button class="secondary" data-home-move="${index}" data-direction="-1" aria-label="Flyt ${homeNames[id]} op" ${index===0?'disabled':''}>↑</button><button class="secondary" data-home-move="${index}" data-direction="1" aria-label="Flyt ${homeNames[id]} ned" ${index===state.draft.home.sectionOrder.length-1?'disabled':''}>↓</button></div></div>`).join('')+'<h3>Vis på forsiden</h3>'+[['showOffers','Vuggestue og børnehave'],['showNature','Legeplads og lokalområdet'],['showVideos','Hverdagen'],['showPractical','Praktiske links'],['showVisit','Rundvisning'],['showSource','Øvrig tekst']].map(([path,title])=>check(title,'home.'+path)).join('');paths=['home'];}
  if(key==='people-order'){html=`<label class="field">Vælg side<select id="people-order-page">${state.draft.pages.filter(page=>page.id&&state.draft.people.some(person=>person.pages.includes(page.id))).map(page=>`<option value="${esc(page.id)}">${esc(page.navigationLabel)}</option>`).join('')}</select></label><div id="people-order-list"></div>`;paths=state.draft.pages.map((page,index)=>`pages.${index}.peopleOrder`);}
  if(key==='usage')html=`<p>${esc(state.usage?.note)}</p>${(state.usage?.metrics||[]).map(metric=>`<div class="usage-row"><strong>${esc(metric.label)}</strong><span>${metric.unit==='bytes'?(metric.used/1000000).toFixed(1)+' / '+metric.limit/1000000+' MB':metric.used.toLocaleString('da')+' / '+metric.limit.toLocaleString('da')}</span></div>`).join('')}`;
  openEdit(titles[key],html,{context:'Menu og oplysninger',paths});activeEdit.setting=key;if(key==='people-order')fillPeopleOrder();
}
function redrawSetting(key){const initial=editInitial,model=editInitialModel,scroll=$('#edit-dialog').scrollTop;openSetting(key);editInitial=initial;editInitialModel=model;$('#edit-dialog').scrollTop=scroll;}
function fillPeopleOrder(){const page=pageById($('#people-order-page').value);if(!page)return;const records=state.draft.people.filter(person=>person.active!==false&&person.pages.includes(page.id));const order=page.peopleOrder||[];records.sort((a,b)=>(order.includes(a.id)?order.indexOf(a.id):10000+a.order)-(order.includes(b.id)?order.indexOf(b.id):10000+b.order));$('#people-order-list').innerHTML=records.map((person,index)=>`<div class="order-row"><strong>${esc(person.name)}</strong><div><button class="secondary" data-person-move="${esc(person.id)}" data-direction="-1" aria-label="Flyt ${esc(person.name)} op" ${index===0?'disabled':''}>↑</button><button class="secondary" data-person-move="${esc(person.id)}" data-direction="1" aria-label="Flyt ${esc(person.name)} ned" ${index===records.length-1?'disabled':''}>↓</button></div></div>`).join('');}
function validSlug(id){return /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/.test(id)&&!['api','admin','uploads','data','runtime-lib','index','styles','app','content'].includes(id.split('/')[0]);}
function slugify(value){return value.toLowerCase().replaceAll('æ','ae').replaceAll('ø','oe').replaceAll('å','aa').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
function renamePage(page,id){
  if(!validSlug(id)||state.draft.pages.some(other=>other.key!==page.key&&(other.id===id||other.aliases.includes(id))))throw new Error('Adressen er ugyldig eller allerede i brug. Brug små bogstaver og bindestreger.');
  const old=page.id;if(old===id)return;page.id=id;page.aliases=[...new Set([...page.aliases.filter(alias=>alias!==id),old])];
  const replace=value=>value===old?id:value;
  for(const kind of ['people','documents'])for(const item of state.draft[kind])item.pages=item.pages.map(replace);
  const menu=items=>items.forEach(item=>item.children?menu(item.children):item.pageId=replace(item.pageId));menu(state.draft.settings.navigation);
  state.draft.settings.footerLinks=state.draft.settings.footerLinks.map(replace);state.draft.home.naturePage=replace(state.draft.home.naturePage);for(const key of ['videoPages','practicalPages'])state.draft.home[key]=state.draft.home[key].map(replace);
  for(const p of state.draft.pages)for(const block of p.blocks)if(block.type==='text'){const content=node(block.html);for(const anchor of content.querySelectorAll('a[href]')){const href=anchor.getAttribute('href');if(href.startsWith('/oenskelandet/')||href.startsWith('?side=')){const url=new URL(href,location.origin+'/oenskelandet/');if(url.searchParams.get('side')===old){url.searchParams.set('side',id);anchor.setAttribute('href','?'+url.searchParams+url.hash);}else if(url.pathname===pageUrl(old))anchor.setAttribute('href',pageUrl(id)+url.search+url.hash);}}block.html=content.innerHTML;}
  if(selectedPage===old)selectedPage=id;markDirty();
}
function openPageSettings(key){const page=pageByKey(key);if(!page)return;const index=state.draft.pages.indexOf(page),path='pages.'+index;
  openEdit('Sideindstillinger',field('Sidens overskrift',path+'.heading',{required:true})+field('Navn i menuen',path+'.navigationLabel',{required:true})+check('Vis siden på hjemmesiden',path+'.active')+(page.id?`<details><summary>Adresse og titel i browseren</summary><label class="field">Sideadresse<input id="page-address" value="${esc(page.id)}"></label><p class="hint">Den gamle adresse virker fortsat efter udgivelse.</p>${field('Titel i browserfanen',path+'.documentTitle')}</details>`:'')+(page.id?asset(page.id==='shelters'?'Billede øverst':'Video øverst',path+(page.id==='shelters'?'.images.0':'.videos.0'),page.id==='shelters'?'image':'video'):'')+'<details><summary>Flere muligheder</summary>'+select('Forsidens naturafsnit henter tekst fra','home.naturePage',state.draft.pages.filter(p=>p.id).map(p=>[p.id,p.navigationLabel]))+'</details>',{context:page.id?page.navigationLabel:'Forsiden',paths:[path,'home.naturePage'],onDone:async()=>{const id=$('#page-address')?.value.trim();if(id&&id!==page.id)renamePage(page,id);return true;}});
}
function newPage(){openEdit('Tilføj side','<label class="field">Hvad skal siden hedde?<input id="new-page-name" required placeholder="F.eks. Sommerfest"></label><label class="field">Hvad vil du starte med?<select id="new-page-kind"><option value="standard">En tekstside</option><option value="information">Information med afsnit</option><option value="documents">Dokumenter</option><option value="contact">Kontaktoplysninger</option></select></label><label class="check"><input id="new-page-in-menu" type="checkbox" checked><span>Tilføj i hjemmesidens menu</span></label>',{context:'Ny side',explanation:'Siden oprettes som kladde. Den vises på hjemmesiden, når du udgiver.',onDone:async()=>{const title=$('#new-page-name').value.trim(),template=$('#new-page-kind').value;let id=slugify(title),base=id,number=2;if(!validSlug(id)){editError('Vælg et navn med bogstaver eller tal.');return false;}while(state.draft.pages.some(page=>page.id===id||page.aliases.includes(id)))id=base+'-'+number++;
    const block={id:uid(),type:template==='documents'?'documents':template==='contact'?'contact':'text',...(template==='documents'?{ids:[]}:template==='contact'?{title:'Kontakt os'}:{html:'<p>Skriv din tekst her.</p>'})};
    state.draft.pages.push({key:uid(),id,aliases:[],template,heading:title,title,documentTitle:title+' · Ønskelandet',navigationLabel:title,body:'',blocks:[block],videos:[],images:[],headings:[],active:true,source:''});if($('#new-page-in-menu').checked)state.draft.settings.navigation.push({id:uid(),label:title,pageId:id,active:true});markDirty();selectedPage=id;currentRoute='';location.hash='page/'+encodeURIComponent(id);return true;}});}
function addSection(){openEdit('Tilføj indhold','<label class="field">Vælg indhold<select id="new-block-type"><option value="text">Tekst med overskrifter og billeder</option><option value="image">Et billede med billedtekst</option><option value="video">En video</option><option value="documents">En liste med dokumenter</option><option value="shared">En fælles oplysning</option><option value="contact">Kontaktoplysninger</option></select></label><label class="field">Fælles oplysning<select id="new-block-shared">'+Object.entries(sharedNames).map(([key,title])=>`<option value="${key}">${title}</option>`).join('')+'</select></label>',{context:selectedPage?pageById(selectedPage)?.navigationLabel:'Forsiden',onDone:async()=>{const type=$('#new-block-type').value,block={id:uid(),type,...({text:{html:'<p>Skriv din tekst her.</p>'},image:{url:'',alt:'',caption:''},video:{url:'',caption:''},documents:{ids:[]},shared:{key:$('#new-block-shared').value},contact:{title:'Kontakt os'}}[type])};const list=selectedPage?pageById(selectedPage).blocks:state.draft.home.blocks;list.push(block);markDirty();return true;}});}
function arrange(){const path=selectedPage?'pages.'+state.draft.pages.indexOf(pageById(selectedPage))+'.blocks':'home.blocks',blocks=at(state.draft,path);openEdit('Flyt eller fjern afsnit',blocks.map((block,index)=>`<div class="order-row"><strong>${esc(blockTitle(block,index))}</strong><div><button class="secondary" data-block-move="${path}" data-index="${index}" data-direction="-1" aria-label="Flyt afsnit op" ${index===0?'disabled':''}>↑</button><button class="secondary" data-block-move="${path}" data-index="${index}" data-direction="1" aria-label="Flyt afsnit ned" ${index===blocks.length-1?'disabled':''}>↓</button><button class="danger" data-block-remove="${path}" data-index="${index}">Fjern</button></div></div>`).join('')||'<p>Der er ingen ekstra afsnit at flytte.</p>',{context:selectedPage?pageById(selectedPage)?.navigationLabel:'Forsidens ekstra indhold',paths:[path]});activeEdit.arrange=true;}
function historyView(){return heading('Tidligere versioner','Du kan hente en tidligere version som kladde og kontrollere den, før du udgiver.')+'<div class="backup-actions"><button class="secondary" data-export>Hent backup</button><button class="text-button" data-import-backup>Indlæs backup</button></div><div id="history-list"><p>Henter versioner…</p></div>';}
async function fillHistory(){try{const items=await api('history');if(!$('#history-list'))return;$('#history-list').innerHTML=items.map(item=>card('Version '+item.revision,new Date(item.createdAt).toLocaleString('da-DK'),`data-restore="${esc(item.id)}"`)).join('')||'<p>Her vises dine tidligere gemninger.</p>';}catch(error){message(error.message,true);}}

// Input handlers update the draft only. No browser navigation publishes content.
document.addEventListener('input',event=>{
  const input=event.target;if(input.dataset.field){put(input.dataset.field,input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value);if(input.dataset.field.startsWith('people.'))at(state.draft,input.dataset.field.split('.').slice(0,2).join('.')).edited=true;markDirty();}
  if(input.id==='content-search')contentResults();
  if(input.id==='picker-search')fillPicker();
  if(input.matches('[data-search]')){listQuery=input.value;const section=route().section;$('#collection-results').innerHTML=section==='people'?peopleResults():section==='documents'?documentResults():fileResults();}
});
document.addEventListener('change',async event=>{
  const input=event.target,d=input.dataset;
  if(input.id==='new-block-type'){$('#new-block-shared').closest('label').hidden=input.value!=='shared';return;}
  if(input.id==='page-select'){if(await persist()){frameScroll=0;currentRoute='';navigate(input.value?'page/'+encodeURIComponent(input.value):'home');}return;}
  if(input.id==='people-order-page'){fillPeopleOrder();return;}
  const listPath=d.placement||(d.homeList?'home.'+d.homeList:null)||(d.footerPage?'settings.footerLinks':null)||(d.documentList?d.documentList+'.ids':null);
  if(listPath){const value=d.footerPage||input.value,list=at(state.draft,listPath);put(listPath,input.checked?[...new Set([...list,value])]:list.filter(item=>item!==value));markDirty();}
  if(['picker-upload','library-upload'].includes(input.id)){
    $('#picker-status').textContent='Uploader…';const file=await upload(input.files[0]);input.value='';if(!file)return;
    if(input.id==='picker-upload'){if(fileKind(file)!==pickerKind){$('#picker-status').textContent='Vælg en fil af den viste type.';fillPicker();return;}pickerCallback?.(file);$('#media-dialog').close();}else{message('Filen er uploadet.');$('#collection-results').innerHTML=fileResults();}
  }
  if(input.id==='backup-import')try{const parsed=JSON.parse(await input.files[0].text()),model=parsed.draft||parsed;ask('Indlæs backup som kladde?','<p>Backupen erstatter din kladde. Hjemmesiden ændres først, når du udgiver.</p>',async()=>{const previous=state.draft;state.draft=model;dirty=true;if(!await persist()){state.draft=previous;dirty=false;status();return false;}refreshFrame();return true;},'Indlæs kladde');}catch{message('Filen kunne ikke læses som en backup.',true);}
});
document.addEventListener('click',async event=>{
  const button=event.target.closest('button'),d=button?.dataset||{};
  try{
    const nav=event.target.closest('#menu-dialog a[href^="#"]');if(nav){$('#menu-dialog').close();return;}
    if(!button)return;
    if(d.close){$('#'+d.close).close();return;}
    if(button.id==='menu-button'){$('#menu-dialog').showModal();return;}
    if(button.id==='publish'){await reviewPublication();return;}
    if(button.id==='find-content'||d.content!==undefined){openContent();return;}
    if(button.id==='page-options'){openPageSettings(pageById(selectedPage).key);return;}
    if(button.id==='edit-done'||button.id==='edit-close'){await finishEdit();return;}
    if(button.id==='edit-revert'){await revertEdit();return;}
    if(button.id==='confirm-action'){button.disabled=true;try{if(await confirmAction()!==false)$('#confirm-dialog').close();}finally{button.disabled=false;}return;}
    if(button.id==='logout'){if(!await persist())return;await api('logout',{method:'POST',body:'{}'});location.href='/cdn-cgi/access/logout';return;}
    if(d.retry!==undefined){if([401,409].includes(saveError?.status))window.open('/oenskelandet/admin/','_blank','noopener');else{saveError=null;await persist();}return;}
    if(d.edit){$('#content-dialog').close();openDescriptor(descriptor(d.edit));return;}
    if(d.pick){picker(d.kind,file=>{put(d.pick,file.url);markDirty();const initial=editInitial,model=editInitialModel,active=activeEdit;const fieldNode=button.closest('.field');fieldNode.outerHTML=asset(fieldNode.querySelector('strong')?.textContent||'Fil',d.pick,d.kind);editInitial=initial;editInitialModel=model;activeEdit=active;});return;}
    if(d.choose){const file=library().find(item=>item.url===d.choose);pickerCallback?.(file);$('#media-dialog').close();return;}
    if(d.clear){put(d.clear,'');markDirty();const fieldNode=button.closest('.field'),label=fieldNode.querySelector('strong')?.textContent||'Fil',kind=fieldNode.querySelector('[data-kind]')?.dataset.kind||'image';fieldNode.outerHTML=asset(label,d.clear,kind);return;}
    if(d.format&&editor){
      const commands={bold:()=>editor.chain().focus().toggleBold().run(),italic:()=>editor.chain().focus().toggleItalic().run(),heading:()=>editor.chain().focus().toggleHeading({level:2}).run(),bulletList:()=>editor.chain().focus().toggleBulletList().run(),undo:()=>editor.chain().focus().undo().run(),redo:()=>editor.chain().focus().redo().run(),image:()=>{const replace=editor.isActive('image');picker('image',file=>{if(replace)editor.chain().focus().updateAttributes('image',{src:file.url,alt:file.alt||''}).run();else editor.chain().focus().setImage({src:file.url,alt:file.alt||''}).run();});},link:()=>ask('Indsæt link','<label class="field">Linkadresse<input id="link-address" type="text" placeholder="https://… eller /oenskelandet/…"></label>',async()=>{const url=$('#link-address').value.trim();if(!/^(https?:\/\/|mailto:|tel:|\/oenskelandet\/|#)/i.test(url))throw new Error('Brug en gyldig webadresse, e-mail eller et link til hjemmesiden.');editor.chain().focus().extendMarkRange('link').setLink({href:url}).run();return true;},'Indsæt link')};commands[d.format]?.();return;
    }
    if(d.newPerson!==undefined){newPerson();return;}
    if(d.person){openPerson(d.person);return;}
    if(d.newDocument!==undefined){newDocument();return;}
    if(d.document){openDocument(d.document);return;}
    if(d.removePerson||d.removeDocument){const kind=d.removePerson?'people':'documents',id=d.removePerson||d.removeDocument;ask('Fjern fra hjemmesiden?','<p>Elementet fjernes fra kladden. Ændringen bliver synlig, når du udgiver.</p>',async()=>{state.draft[kind]=state.draft[kind].filter(record=>record.id!==id);if(kind==='documents')for(const page of [...state.draft.pages,state.draft.home])for(const block of page.blocks)if(block.type==='documents')block.ids=block.ids.filter(value=>value!==id);dirty=true;if(!await persist())return false;editor?.destroy();editor=null;$('#edit-dialog').close();currentRoute='';render();return true;},'Fjern');return;}
    if(d.setting){openSetting(d.setting);return;}
    if(d.shared){openEdit(sharedNames[d.shared],sharedFields(d.shared),{context:'Fælles oplysninger',paths:['shared.'+d.shared],explanation:'Rettelsen opdaterer alle sider, der bruger denne oplysning, når du udgiver.'});return;}
    if(d.pageSettings){openPageSettings(d.pageSettings);return;}
    if(d.newPage!==undefined){newPage();return;}
    if(d.addSection!==undefined){$('#content-dialog').close();addSection();return;}
    if(d.arrange!==undefined){$('#content-dialog').close();arrange();return;}
    if(d.homeMove!==undefined){const i=Number(d.homeMove),j=i+Number(d.direction),list=state.draft.home.sectionOrder;if(j>=0&&j<list.length){[list[i],list[j]]=[list[j],list[i]];markDirty();redrawSetting('layout');}return;}
    if(d.personMove){const page=pageById($('#people-order-page').value),list=[...$('#people-order-list').querySelectorAll('[data-person-move][data-direction="-1"]')].map(item=>item.dataset.personMove),i=list.indexOf(d.personMove),j=i+Number(d.direction);if(j>=0&&j<list.length){[list[i],list[j]]=[list[j],list[i]];page.peopleOrder=list;markDirty();fillPeopleOrder();}return;}
    if(d.menuMove||d.menuRemove||d.menuAdd||d.menuGroup!==undefined){
      if(d.menuMove){const list=at(state.draft,d.menuMove),i=Number(d.index),j=i+Number(d.direction);if(j>=0&&j<list.length)[list[i],list[j]]=[list[j],list[i]];}
      if(d.menuRemove)at(state.draft,d.menuRemove).splice(Number(d.index),1);
      if(d.menuAdd)at(state.draft,d.menuAdd).push({id:uid(),label:'Nyt menupunkt',pageId:'',active:true});
      if(d.menuGroup!==undefined)state.draft.settings.navigation.push({id:uid(),label:'Ny gruppe',children:[],active:true});markDirty();redrawSetting('navigation');return;
    }
    if(d.blockMove||d.blockRemove){const path=d.blockMove||d.blockRemove,list=at(state.draft,path),i=Number(d.index);if(d.blockRemove){ask('Fjern afsnittet?','<p>Afsnittet fjernes fra kladden. Den aktuelle hjemmeside bevares, indtil du udgiver.</p>',async()=>{list.splice(i,1);markDirty();const initial=editInitial;arrange();editInitial=initial;return true;},'Fjern afsnit');}else{const j=i+Number(d.direction);if(j>=0&&j<list.length){[list[i],list[j]]=[list[j],list[i]];markDirty();const initial=editInitial;arrange();editInitial=initial;}}return;}
    if(d.file){await fileDetails(d.file);return;}
    if(d.trashView!==undefined){filesTrash=!filesTrash;currentRoute='';render();return;}
    if(d.mediaAction){const action=d.mediaAction,id=d.id;const perform=async()=>{if(!await persist())return false;await api('media-'+action,{method:'POST',body:JSON.stringify({id})});state.media=(await api('state')).media;currentRoute='';render();return true;};if(action==='purge')ask('Slet filen permanent?','<p>Filen kan ikke gendannes efter denne handling.</p>',perform,'Slet permanent');else if(await perform())$('#confirm-dialog').close();return;}
    if(d.importFiles!==undefined){ask('Gem egne filkopier?','<p>De oprindelige billeder, videoer og PDF-filer kopieres til dit filbibliotek. Kladden opdateres til at bruge dem. Grænserne for gratis forbrug gælder.</p>',async()=>{const files=library().filter(file=>file.original&&/^https:\/\/(?:www\.)?onskelandet\.dk\/wp-content\/uploads\//.test(file.url));for(const [index,file]of files.entries()){message('Kopierer fil '+(index+1)+' af '+files.length+'…');await importFile(file.url);}await persist();message('Filkopierne er gemt i kladden.');currentRoute='';render();return true;},'Gem kopier');return;}
    if(d.restore){ask('Hent versionen som kladde?','<p>Din nuværende kladde erstattes. Du kan se resultatet, før du udgiver.</p>',async()=>{if(!await persist())return false;state=await api('restore',{method:'POST',body:JSON.stringify({expectedRevision:state.revision,historyId:d.restore})});dirty=false;status();navigate('home');return true;},'Hent som kladde');return;}
    if(d.export!==undefined){const blob=new Blob([JSON.stringify({draft:state.draft},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='oenskelandet-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
    if(d.importBackup!==undefined){$('#backup-import').click();return;}
  }catch(error){if($('#confirm-dialog').open){$('#confirm-error').textContent=error.message;$('#confirm-error').hidden=false;}else if($('#edit-dialog').open)editError(error.message);else message(error.message,true);}
});
$('#edit-dialog').addEventListener('cancel',event=>{event.preventDefault();finishEdit().catch(error=>editError(error.message));});
window.addEventListener('hashchange',()=>{render();window.scrollTo(0,0);});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
window.addEventListener('focus',()=>{if(dirty&&saveError?.status===401){saveError=null;persist(false,true);}});
load().catch(error=>{const startup=$('#startup');startup.innerHTML='<h1>Administrationen kunne ikke åbnes</h1><p>'+esc(error.message)+'</p><a class="primary" href="/oenskelandet/admin/">Prøv igen</a>';});
