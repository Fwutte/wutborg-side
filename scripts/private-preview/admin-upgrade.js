// Protected administration extensions. Original content lives only in the online model.
const sharedNames={openingHours:'Åbningstider',closingDays:'Lukkedage',prices:'Priser',visit:'Rundvisning'};
const blockNames={text:'Tekst',heading:'Overskrift',image:'Billede',video:'Video',documents:'Dokumentliste',contact:'Kontaktboks',shared:'Fælles oplysninger'};
const sectionNames={hero:'Introduktion og video',offers:'Vuggestue og børnehave',nature:'Naturafsnit',videos:'Videoklip',practical:'Praktiske links',visit:'Invitation til besøg',extra:'Ekstra indholdsafsnit',source:'Forsidens øvrige tekst'};
const editors=new Map();
const liveUrl=id=>'/oenskelandet/'+id;
const inertNode=html=>{if(typeof DOMParser==='function')return new DOMParser().parseFromString(html||'','text/html').body;const node=document.createElement('div');node.innerHTML=html||'';return node;};
const plain=html=>inertNode(html).textContent.replace(/\s+/g,' ').trim();
const clone=value=>JSON.parse(JSON.stringify(value));
function comparable(value){
  if(typeof value==='string'&&/<[a-z][\s\S]*>/i.test(value)){
    const node=inertNode(value);
    for(const element of node.querySelectorAll('*')){const attrs=[...element.attributes].map(attr=>[attr.name,attr.value]).sort(([a],[b])=>a.localeCompare(b));for(const attr of [...element.attributes])element.removeAttribute(attr.name);for(const [name,text]of attrs)element.setAttribute(name,text);}
    return node.innerHTML.replace(/>\s+</g,'><').replace(/\s+/g,' ').trim();
  }
  if(Array.isArray(value))return value.map(comparable);
  if(value&&typeof value==='object')return Object.keys(value).filter(key=>!['originalHtml','baselineHtml','baselineTitle','activated','cmsVersion'].includes(key)).sort().map(key=>[key,comparable(value[key])]);
  return value;
}
const same=(a,b)=>JSON.stringify(comparable(a))===JSON.stringify(comparable(b));
const reservedSlug=id=>!id||!/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/.test(id)||['admin','api','uploads','data','runtime-lib','index','styles','app','content'].includes(id.split('/')[0]);
const slugify=name=>name.toLowerCase().replaceAll('æ','ae').replaceAll('ø','oe').replaceAll('å','aa').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
function changedItems(){
  const items=[],draft=state.draft,published=state.published;
  const add=(label,before,after,pageId=null)=>{if(!same(before,after))items.push({label,before,after,pageId});};
  const fields={id:'Adresse',heading:'Overskrift',navigationLabel:'Menunavn',documentTitle:'Titel i browserfanen',active:'Synlighed',blocks:'Indhold',videos:'Video',images:'Billeder',peopleOrder:'Medarbejdernes rækkefølge'};
  for(const page of draft.pages){const old=published.pages.find(item=>item.key===page.key);if(!old){add('Ny side: '+page.navigationLabel,'',{Overskrift:page.heading,Adresse:liveUrl(page.id),Indhold:page.blocks},page.id);continue;}for(const [key,title]of Object.entries(fields))add((page.navigationLabel||'Forsiden')+' · '+title,old[key],page[key],page.id);}
  for(const key of Object.keys(sharedNames)){
    const before={title:published.shared?.[key]?.title,html:published.shared?.[key]?.html},after={title:draft.shared?.[key]?.title,html:draft.shared?.[key]?.html};
    if(!same(before,after)){
      add('Fælles · '+sharedNames[key],before,after);
      for(const page of draft.pages)if(page.blocks.some(block=>block.type==='shared'&&block.key===key||block.type==='text'&&block.html.includes('data-cms-shared="'+key+'"')))add((page.navigationLabel||'Forsiden')+' · Fælles '+sharedNames[key].toLowerCase(),before,after,page.id);
      if(key==='visit')add('Forsiden · Invitation til besøg',before,after,'');
    }
  }
  for(const key of ['home','settings','people','documents','mediaDescriptions'])add(({home:'Forsiden',settings:'Menu og kontaktoplysninger',people:'Medarbejdere',documents:'Dokumenter',mediaDescriptions:'Billedbeskrivelser'})[key],published[key],draft[key]);
  return items;
}
function diffText(value){
  if(value===undefined||value===null||value==='')return '—';if(typeof value==='boolean')return value?'Ja':'Nej';if(typeof value==='string')return plain(value)||value;
  if(Array.isArray(value))return value.map(diffText).join('\n\n');
  if(value.type){if(value.type==='shared')return 'Fælles oplysninger: '+sharedNames[value.key];if(value.type==='documents')return 'Dokumenter: '+value.ids.map(id=>state.draft.documents.find(doc=>doc.id===id)?.label||'Fjernet dokument').join(', ');return [blockNames[value.type],value.text||plain(value.html),value.alt,value.caption,value.url,value.title].filter(Boolean).join(' · ');}
  const labels={title:'Overskrift',html:'Indhold',name:'Navn',role:'Stilling',email:'E-mail',phone:'Telefon',image:'Billede',label:'Titel',url:'Link',year:'År',pages:'Vises på',active:'Synlig',address:'Adresse',postcode:'Postnummer og by',siteName:'Navn',contactLabel:'Kontaktknap',navigation:'Menu',footerLinks:'Links i sidefoden',sectionOrder:'Rækkefølge',blocks:'Afsnit',description:'Introduktion',visitHeading:'Invitationens overskrift',visitText:'Invitationens tekst'};
  return Object.entries(value).filter(([key])=>!['id','key','aliases','baselineHtml','baselineTitle','sourceHtml','edited','source','extraHtml'].includes(key)).map(([key,child])=>(labels[key]||sectionNames[key]||key)+': '+(key==='pages'&&Array.isArray(child)?child.map(id=>pageName(id)).join(', '):diffText(child))).join('\n');
}
const originalAsk=ask;
ask=function(...args){$('.publication-review')?.remove();originalAsk(...args);};
function reviewPublication(){
  const changes=changedItems();if(!changes.length){notice('Der er ingen ændringer at publicere.');return;}
  ask('Gennemgå ændringer før publicering',changes.length+(changes.length===1?' ændringspunkt bliver synligt.':' ændringspunkter bliver synlige.')+' Gemte kladder på andre sider er også med.',async()=>{await save('publish');},'Publicér ændringer');
  const list=document.createElement('div');list.className='publication-review';
  list.innerHTML=changes.map(item=>`<details><summary>${esc(item.label)}</summary>${item.pageId!==null?`<p class="hint">${esc(location.origin+liveUrl(item.pageId))}</p>`:''}<div class="diff-columns"><div><strong>På hjemmesiden nu</strong><p>${esc(diffText(item.before).slice(0,3500))}</p></div><div><strong>Efter publicering</strong><p>${esc(diffText(item.after).slice(0,3500))}</p></div></div></details>`).join('');
  $('#confirm-dialog .dialog-actions').before(list);
}
const oldSave=save;
save=async function(action='save'){
  const route=current(),affected=route.section==='page'?route.id:null;
  const success=await oldSave(action);
  if(success&&action==='publish'){
    const link=document.createElement('a');link.className='secondary';link.href=liveUrl(affected||'');link.target='_blank';link.rel='noopener';link.textContent=affected===null?'Åbn hjemmesiden ↗':'Åbn den opdaterede side ↗';$('#notice').append(' ',link);
  }
  return success;
};

function richField(label,path){return `<div class="field rich-field"><label>${esc(label)}</label><div class="block-toolbar" data-editor-toolbar="${esc(path)}">${[['bold','Fed'],['italic','Kursiv'],['h2','Overskrift'],['bulletList','Punktliste'],['orderedList','Nummereret liste'],['link','Link'],['undo','Fortryd'],['redo','Gentag']].map(([command,title])=>`<button type="button" class="quiet" data-editor-command="${command}" data-editor-for="${esc(path)}">${title}</button>`).join('')}</div><div class="editor-mount" data-editor-path="${esc(path)}" data-editor-label="${esc(label)}"></div></div>`;}
function mountEditors(){
  if(!window.OenskelandetEditor)return;
  for(const element of document.querySelectorAll('[data-editor-path]')){
    const path=element.dataset.editorPath;
    const editor=window.OenskelandetEditor.mount(element,at(state.draft,path)||'',html=>{put(path,html);markDirty();});editors.set(path,editor);
  }
}
function blockFields(block,path){
  if(block.type==='text')return richField('Tekstafsnit',path+'.html');
  if(block.type==='heading')return field('Overskrift',path+'.text')+selectField('Niveau',path+'.level',[['2','Stor afsnitsoverskrift'],['3','Underoverskrift']]);
  if(block.type==='image')return assetField('Billede',path+'.url')+field('Billedbeskrivelse',path+'.alt',{hint:'Beskriv billedet for dem, som ikke kan se det.'})+field('Billedtekst',path+'.caption');
  if(block.type==='video')return assetField('Video',path+'.url','video')+field('Tekst under videoen',path+'.caption');
  if(block.type==='contact')return field('Overskrift',path+'.title')+'<p class="hint">Adresse, telefon og e-mail følger automatisk Menu og oplysninger.</p>';
  if(block.type==='shared')return selectField('Vis fælles oplysninger',path+'.key',Object.entries(sharedNames))+`<p class="hint">Oplysningerne redigeres ét sted under <a href="#shared">Fælles oplysninger</a>. Rettelser gælder alle placeringer.</p>`;
  if(block.type==='documents')return `<div class="field"><label>Vælg dokumenter</label>${state.draft.documents.filter(doc=>doc.active!==false).map(doc=>`<label class="check"><input type="checkbox" data-block-document="${esc(path)}" value="${esc(doc.id)}" ${block.ids.includes(doc.id)?'checked':''}><span>${esc(doc.label)}</span></label>`).join('')}</div>`;
  return '';
}
function blocksEditor(path){
  const blocks=at(state.draft,path)||[];
  return `<div class="blocks-editor"><p class="hint">Hvert afsnit kan redigeres og flyttes. Eksisterende tekst og indlejrede medarbejdere og dokumenter bevares.</p>${blocks.map((block,index)=>`<section class="block-card" id="block-${esc(block.id)}"><header><strong>${index+1}. ${esc(blockNames[block.type])}${block.type==='text'?' · '+esc(plain(block.html).slice(0,65)):block.type==='shared'?' · '+esc(sharedNames[block.key]):''}</strong><div class="row-actions"><button class="quiet" data-block-move="${path}" data-index="${index}" data-direction="-1" aria-label="Flyt afsnit op" ${index===0?'disabled':''}>↑</button><button class="quiet" data-block-move="${path}" data-index="${index}" data-direction="1" aria-label="Flyt afsnit ned" ${index===blocks.length-1?'disabled':''}>↓</button><button class="danger" data-block-remove="${path}" data-index="${index}">Fjern</button></div></header><details ${index===0?'open':''}><summary>Rediger afsnit</summary>${blockFields(block,path+'.'+index)}</details></section>`).join('')}<div class="add-block"><label>Tilføj afsnit<select data-block-type="${path}">${Object.entries(blockNames).map(([key,title])=>`<option value="${key}">${title}</option>`).join('')}</select></label><button class="secondary" data-block-add="${path}">Tilføj afsnit +</button></div></div>`;
}
bodyEditor=function(page,index){return `<div class="panel"><h2>Sidens indholdsafsnit</h2>${blocksEditor('pages.'+index+'.blocks')}</div>`;};
const oldPageView=pageView;
pageView=function(id){
  const page=state.draft.pages.find(page=>page.id===id);if(!page)return oldPageView(id);
  const context=`<div class="page-context"><div><strong>Du redigerer: ${esc(page.navigationLabel||'Forsiden')}</strong><span>${esc(location.origin+liveUrl(page.id))}</span></div><a class="secondary" href="${esc(liveUrl(page.id))}" target="_blank" rel="noopener">Se publiceret side ↗</a></div>`;
  const address=page.id?`<div class="panel"><h2>Sideadresse</h2><label>Adresse efter /oenskelandet/<input id="page-slug" value="${esc(page.id)}" autocomplete="off"></label><p class="hint">Tidligere adresser viderestiller automatisk efter publicering.</p><button class="secondary" data-rename-page="${esc(page.key)}">Anvend adresse</button>${page.aliases.length?`<p class="hint">Tidligere: ${page.aliases.map(esc).join(', ')}</p>`:''}</div>`:'';
  return oldPageView(id).replace('<div class="editor-layout">',context+'<div class="editor-layout">').replace('<aside class="editor-aside">','<aside class="editor-aside">'+address);
};
function sharedView(){return heading('Fælles oplysninger','Ret oplysningerne her, og brug dem på flere sider uden at kopiere teksten.')+Object.entries(sharedNames).map(([key,title])=>`<div class="panel"><h2>${title}</h2>${field('Overskrift','shared.'+key+'.title')}${richField('Indhold','shared.'+key+'.html')}<p class="hint">Bruges i de afsnit, der henviser til ${title.toLowerCase()}${key==='visit'?', og i fors idens invitation'.replace('fors idens','forsidens'):''}. Publicering opdaterer alle placeringer.</p></div>`).join('');}
const oldHomeView=homeView;
homeView=function(){
  const h=state.draft.home;
  const existing=oldHomeView().replace(/<div class="panel"><h2>Invitation til besøg<\/h2>[\s\S]*?<\/div>/,'<div class="panel"><h2>Invitation til besøg</h2><p>Invitationen vedligeholdes samlet under <a href="#shared">Fælles oplysninger → Rundvisning</a>.</p></div>');
  return existing+`<div class="panel"><h2>Rækkefølge på forsiden</h2>${h.sectionOrder.map((key,index)=>`<div class="section-row"><span>${esc(sectionNames[key])}</span><div><button class="quiet" data-section-move="${index}" data-direction="-1" ${index===0?'disabled':''}>↑</button><button class="quiet" data-section-move="${index}" data-direction="1" ${index===h.sectionOrder.length-1?'disabled':''}>↓</button></div></div>`).join('')}</div>${['videoPages','practicalPages'].map(key=>`<div class="panel"><h2>${key==='videoPages'?'Sider under videoklip':'Praktiske links på forsiden'}</h2>${state.draft.pages.filter(page=>page.id).map(page=>`<label class="check"><input type="checkbox" data-home-page="${key}" value="${esc(page.id)}" ${h[key].includes(page.id)?'checked':''}><span>${esc(page.navigationLabel)}</span></label>`).join('')}</div>`).join('')}<div class="panel"><h2>Ekstra indholdsafsnit på forsiden</h2>${blocksEditor('home.blocks')}</div>`;
};
function newPageDialog(){
  let dialog=$('#new-page-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='new-page-dialog';dialog.className='dialog';document.body.append(dialog);}
  dialog.innerHTML=`<h2>Opret en side</h2><form id="new-page-form"><p id="new-page-error" role="alert"></p><label>Sidens navn<input id="new-page-title" required></label><label>Adresse efter /oenskelandet/<input id="new-page-slug" required></label><label>Sidetype<select id="new-page-template" aria-label="Sidetype"><option value="standard">Almindelig side</option><option value="information">Informationsside</option><option value="documents">Dokumentoversigt</option><option value="contact">Kontaktside</option></select></label><label>Placering i menuen<select id="new-page-menu" aria-label="Placering i menuen"><option value="none">Ingen placering endnu</option><option value="main">Hovedmenuen</option>${state.draft.settings.navigation.map((item,index)=>item.children?`<option value="${index}">${esc(item.label)}</option>`:'').join('')}</select></label><div class="dialog-actions"><button type="button" class="secondary" data-close="new-page-dialog">Annuller</button><button class="primary">Opret som kladde</button></div></form>`;
  dialog.showModal();$('#new-page-title').focus();
}
newPage=newPageDialog;
function renamePage(page,id){
  if(reservedSlug(id)||state.draft.pages.some(other=>other.key!==page.key&&(other.id===id||other.aliases.includes(id))))throw new Error('Adressen er ugyldig, reserveret eller allerede i brug.');
  const old=page.id;if(old===id)return;
  page.aliases=[...new Set([...page.aliases.filter(alias=>alias!==id),old])];page.id=id;
  const remap=value=>value===old?id:value;
  for(const kind of ['people','documents'])for(const item of state.draft[kind])item.pages=item.pages.map(remap);
  const walkMenu=items=>items.forEach(item=>{if(item.children)walkMenu(item.children);else item.pageId=remap(item.pageId);});walkMenu(state.draft.settings.navigation);
  state.draft.settings.footerLinks=state.draft.settings.footerLinks.map(remap);state.draft.home.naturePage=remap(state.draft.home.naturePage);
  for(const key of ['videoPages','practicalPages'])state.draft.home[key]=state.draft.home[key].map(remap);
  for(const other of state.draft.pages)for(const block of other.blocks)if(block.type==='text'){
    const node=document.createElement('div');node.innerHTML=block.html;
    for(const a of node.querySelectorAll('a[href]')){const href=a.getAttribute('href');if(href.startsWith('?side=')||href.startsWith('/oenskelandet/')){const url=new URL(href,location.origin+'/oenskelandet/');if(url.searchParams.get('side')===old){url.searchParams.set('side',id);a.setAttribute('href','?'+url.searchParams+url.hash);}else if(url.pathname===liveUrl(old))a.setAttribute('href',liveUrl(id)+url.search+url.hash);}}
    block.html=node.innerHTML;
  }
  markDirty();location.hash='page/'+encodeURIComponent(id);render();notice('Adressen er ændret i kladden. Den gamle adresse viderestiller efter publicering.');
}

let trashView=false;
const oldLibrary=library;
library=function(){
  const files=oldLibrary().filter(item=>!item.trashedAt&&!item.deletedAt&&!item.purgingAt),seen=new Set(files.map(item=>item.url));
  const scan=value=>{if(typeof value==='string'){for(const match of value.matchAll(/https?:[^\s"<>]+\.(?:png|jpe?g|gif|webp|svg|pdf|mp4|webm)(?:\?[^\s"<>]*)?/gi))if(!seen.has(match[0])){seen.add(match[0]);files.push({url:match[0],name:decodeURIComponent(match[0].split('/').pop()),type:/\.pdf/i.test(match[0])?'application/pdf':/\.(mp4|webm)/i.test(match[0])?'video/mp4':'image/png',original:true});}}else if(value&&typeof value==='object')for(const child of Object.values(value))scan(child);};
  scan(state.draft);return files;
};
mediaView=function(){return heading('Mediebibliotek','Se hvor filer bruges, ret beskrivelser, og gem egne kopier af de oprindelige medier.',`<label class="upload-button primary">Upload fil +<input type="file" data-library-upload accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4,video/webm" hidden></label>`)+`<div class="list-tools"><input type="search" data-search placeholder="Find en fil…" value="${esc(query)}" aria-label="Find en fil"><button class="secondary" data-media-trash-view>${trashView?'Vis aktive filer':'Papirkurv'}</button><button class="secondary" data-import-originals>Gem egne kopier af oprindelige medier</button></div><p class="hint">Egne kopier opdaterer kladden. Publicér bagefter for at tage kopierne i brug. Grænserne for gratis forbrug gælder også import. Filer i brug kan ikke fjernes.</p><div id="media-list" class="media-grid"></div>`;};
const oldFillRows=fillRows;
fillRows=function(){
  if(current().section!=='media')return oldFillRows();
  const files=(trashView?state.media.filter(file=>file.trashedAt&&!file.deletedAt):library()).filter(file=>file.name.toLocaleLowerCase('da').includes(query.toLocaleLowerCase('da')));
  $('#media-list').innerHTML=files.map(file=>`<article class="media-card">${mediaTile(file)}<div class="media-card-actions">${file.original?`<button class="secondary" data-import-one="${esc(file.url)}">Gem egen kopi</button>`:`<button class="secondary" data-media-details="${esc(file.id)}">Oplysninger og anvendelse</button>`}</div></article>`).join('')||'<p class="empty">Ingen filer her.</p>';
};
async function mediaDetails(id){
  const details=await api('media-info',{method:'POST',body:JSON.stringify({id})});let dialog=$('#media-details-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='media-details-dialog';dialog.className='dialog';document.body.append(dialog);}
  dialog.innerHTML=`<h2>Filoplysninger</h2><p class="hint">${esc(details.file.url)}</p><label>Navn i mediebiblioteket<input id="media-name" value="${esc(details.file.name)}"></label><label>Billedbeskrivelse<textarea id="media-alt">${esc(details.file.alt||'')}</textarea></label><h3>Anvendelse</h3><p>Publiceret: ${details.published.map(use=>esc(use.label)).join(', ')||'Ingen placeringer'}</p><p>Kladde: ${details.draft.map(use=>esc(use.label)).join(', ')||'Ingen placeringer'}</p><p class="hint">Billedbeskrivelsen lægges også i kladden og vises på hjemmesiden efter publicering. Papirkurven kan gendannes. Permanent sletning kræver mindst syv dage og ingen referencer i historikken.</p><div class="dialog-actions"><button class="secondary" data-close="media-details-dialog">Luk</button><button class="primary" data-media-update="${esc(id)}">Gem oplysninger</button>${details.file.trashedAt?`<button class="secondary" data-media-restore="${esc(id)}">Gendan fil</button><button class="danger" data-media-purge="${esc(id)}">Slet permanent</button>`:`<button class="danger" data-media-trash="${esc(id)}" ${details.draft.length||details.published.length?'disabled':''}>Flyt til papirkurv</button>`}</div>`;dialog.showModal();
}
async function importOriginal(url){
  const record=await api('media-import',{method:'POST',body:JSON.stringify({url})});
  state.media=[record,...state.media.filter(item=>item.id!==record.id)];
  state.draft=JSON.parse(JSON.stringify(state.draft).split(url).join(record.url));state.usage=await api('usage');markDirty();return record;
}
const originalRender=render;
render=function(){
  for(const editor of editors.values())editor.destroy();editors.clear();
  if(current().section==='shared'){
    $('#view').innerHTML=sharedView();document.querySelectorAll('.sidebar nav a').forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#shared'));
  }else originalRender();
  if(!$('.sidebar a[href="#shared"]')){const link=document.createElement('a');link.href='#shared';link.dataset.section='shared';link.textContent='◈ Fælles oplysninger';$('.sidebar a[href="#settings"]').before(link);}
  mountEditors();
};

document.addEventListener('input',event=>{
  if(event.target.id==='new-page-title'&&!$('#new-page-slug').dataset.edited)$('#new-page-slug').value=slugify(event.target.value);
  if(event.target.id==='new-page-slug')event.target.dataset.edited='true';
});
document.addEventListener('change',event=>{
  const input=event.target;
  if(input.dataset.blockDocument){const block=at(state.draft,input.dataset.blockDocument);block.ids=input.checked?[...new Set([...block.ids,input.value])]:block.ids.filter(id=>id!==input.value);markDirty();}
  if(input.dataset.homePage){const list=state.draft.home[input.dataset.homePage];state.draft.home[input.dataset.homePage]=input.checked?[...new Set([...list,input.value])]:list.filter(id=>id!==input.value);markDirty();}
});
document.addEventListener('submit',event=>{
  if(event.target.id!=='new-page-form')return;event.preventDefault();
  const name=$('#new-page-title').value.trim(),id=$('#new-page-slug').value.trim(),template=$('#new-page-template').value;
  if(!name||reservedSlug(id)||state.draft.pages.some(page=>page.id===id||page.aliases.includes(id))){$('#new-page-error').textContent='Vælg et navn og en ledig adresse uden mellemrum eller reserverede navne.';return;}
  const block=template==='contact'?{id:uid(),type:'contact',title:'Kontakt os'}:template==='documents'?{id:uid(),type:'documents',ids:[]}:{id:uid(),type:'text',html:'<p></p>'};
  const blocks=template==='information'?[{id:uid(),type:'heading',level:'2',text:'Om '+name},block]:[block];
  state.draft.pages.push({key:uid(),id,aliases:[],template,heading:name,title:name,documentTitle:name+' · Ønskelandet',navigationLabel:name,body:'',blocks,videos:[],images:[],headings:[],active:true,source:''});
  const placement=$('#new-page-menu').value;
  if(placement!=='none'){const list=placement==='main'?state.draft.settings.navigation:state.draft.settings.navigation[Number(placement)].children;list.push({id:uid(),label:name,pageId:id,active:true});}
  $('#new-page-dialog').close();markDirty();location.hash='page/'+encodeURIComponent(id);render();
});
document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;const d=button.dataset;
  try{
    if(d.editorCommand){event.preventDefault();const editor=editors.get(d.editorFor);if(!editor)return;
      const commands={bold:()=>editor.chain().focus().toggleBold().run(),italic:()=>editor.chain().focus().toggleItalic().run(),h2:()=>editor.chain().focus().toggleHeading({level:2}).run(),bulletList:()=>editor.chain().focus().toggleBulletList().run(),orderedList:()=>editor.chain().focus().toggleOrderedList().run(),undo:()=>editor.chain().focus().undo().run(),redo:()=>editor.chain().focus().redo().run(),link:()=>{const url=prompt('Linkadresse (https://…, mailto:… eller /oenskelandet/…)');if(url&&/^(https?:\/\/|mailto:|tel:|\/oenskelandet\/|#)/i.test(url))editor.chain().focus().extendMarkRange('link').setLink({href:url}).run();}};commands[d.editorCommand]?.();return;}
    if(d.blockAdd){const type=document.querySelector('[data-block-type="'+d.blockAdd+'"]').value;const block={id:uid(),type,...({text:{html:'<p></p>'},heading:{text:'Ny overskrift',level:'2'},image:{url:'',alt:'',caption:''},video:{url:'',caption:''},documents:{ids:[]},contact:{title:'Kontakt os'},shared:{key:'openingHours'}}[type])};at(state.draft,d.blockAdd).push(block);markDirty();render();document.getElementById('block-'+block.id)?.scrollIntoView({block:'center'});return;}
    if(d.blockMove){const blocks=at(state.draft,d.blockMove),i=Number(d.index),j=i+Number(d.direction);if(j<0||j>=blocks.length)return;[blocks[i],blocks[j]]=[blocks[j],blocks[i]];markDirty();render();return;}
    if(d.blockRemove){ask('Fjern afsnittet fra kladden?','Den publicerede side ændres først, når du publicerer.',()=>{at(state.draft,d.blockRemove).splice(Number(d.index),1);markDirty();render();},'Fjern afsnit');return;}
    if(d.sectionMove!==undefined){const list=state.draft.home.sectionOrder,i=Number(d.sectionMove),j=i+Number(d.direction);if(j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];markDirty();render();return;}
    if(d.renamePage){renamePage(state.draft.pages.find(page=>page.key===d.renamePage),$('#page-slug').value.trim());return;}
    if(d.mediaTrashView!==undefined){trashView=!trashView;render();return;}
    if(d.mediaDetails){await mediaDetails(d.mediaDetails);return;}
    if(d.mediaUpdate){const record=await api('media-update',{method:'POST',body:JSON.stringify({id:d.mediaUpdate,name:$('#media-name').value,alt:$('#media-alt').value})});state.media=state.media.map(item=>item.id===record.id?record:item);state.draft.mediaDescriptions||={};state.draft.mediaDescriptions[record.url]={alt:record.alt};markDirty();$('#media-details-dialog').close();render();notice('Filoplysninger gemt. Publicér kladden for at vise billedbeskrivelsen.');return;}
    for(const action of ['trash','restore','purge'])if(d['media'+action[0].toUpperCase()+action.slice(1)]){
      if(dirty){notice('Gem kladden før du rydder op i filer.',true);return;}
      const id=d['media'+action[0].toUpperCase()+action.slice(1)];
      const perform=async()=>{await api('media-'+action,{method:'POST',body:JSON.stringify({id})});state.media=(await api('state')).media;$('#media-details-dialog').close();render();notice(action==='restore'?'Filen er gendannet.':action==='trash'?'Filen er flyttet til papirkurven.':'Filen er slettet permanent.');};
      if(action==='purge')ask('Slet filen permanent?','Filen kan ikke gendannes efter denne handling.',perform,'Slet permanent');else await perform();return;
    }
    if(d.importOne){setBusy(true);await importOriginal(d.importOne);render();notice('En egen kopi er gemt. Gem og publicér kladden for at bruge kopien.');setBusy(false);return;}
    if(d.importOriginals!==undefined){const files=library().filter(file=>file.original&&/^https:\/\/(?:www\.)?onskelandet\.dk\/wp-content\/uploads\//.test(file.url));if(!files.length){notice('Der er ingen oprindelige medier, der mangler en egen kopi.');return;}setBusy(true);let copied=0;const errors=[];for(const [index,file]of files.entries()){notice('Gemmer egen kopi '+(index+1)+' af '+files.length+' · '+file.name);try{await importOriginal(file.url);copied++;}catch(error){errors.push(file.name+': '+error.message);if(/gratis|forbrug|sikkerhedsgrænse/i.test(error.message))break;}}render();notice(copied+' egne kopier er gemt. Gem og publicér kladden for at bruge dem.'+(errors.length?' '+errors.length+' filer kunne ikke hentes: '+errors.slice(0,3).join(' · '):''),Boolean(errors.length));setBusy(false);return;}
  }catch(error){setBusy(false);notice(error.message,true);}
});
