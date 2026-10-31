import vm from 'node:vm';
import {createRequire} from 'node:module';

export async function checkAdminClient({assets,worker,owner,viewer,call,check,png}){
  const {parseHTML}=createRequire('C:/Codex/oenskelandet/package.json')('linkedom');
  const {window}=parseHTML(assets['admin/'].body),{document,HTMLElement}=window;
  HTMLElement.prototype.focus=function(){};
  HTMLElement.prototype.checkValidity=function(){return true;};
  HTMLElement.prototype.reportValidity=function(){};
  HTMLElement.prototype.showModal=function(){this.open=true;};
  HTMLElement.prototype.close=function(){this.open=false;};
  window.scrollTo=()=>{};
  let cookie='';
  const context=vm.createContext({window,document,location:new URL('https://wutborg.dk/oenskelandet/admin/'),URL,URLSearchParams,crypto,console,Blob,File,FormData,setTimeout,clearTimeout,
    fetch:async(path,options={})=>{
      if(!path.startsWith('/oenskelandet/api/admin/'))throw new Error('Admin API request left its protected path.');
      const headers=new Headers(options.headers);headers.set('Cf-Access-Jwt-Assertion',owner);if(cookie)headers.set('cookie',cookie);if(options.method==='POST')headers.set('origin','https://wutborg.dk');if(options.body instanceof Blob)headers.set('content-length',String(options.body.size));
      const response=await worker.dispatchFetch('https://wutborg.dk'+path,{...options,headers});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return response;
    }
  });
  const run=code=>vm.runInContext(code,context);
  run(assets['admin/admin.js'].body);
  for(let attempt=0;attempt<60&&document.querySelector('#workspace').hidden;attempt++)await new Promise(resolve=>setTimeout(resolve,20));
  check(document.querySelector('#workspace').hidden,false,document.querySelector('#startup').textContent);
  check(document.querySelector('#site-frame').getAttribute('src'),'/oenskelandet/?preview=1');
  check(document.querySelector('#page-select').children.length,19);
  check(Boolean(document.querySelector('.sidebar')),false,'The old admin client must not be part of the new bundle.');
  check(document.querySelector('#publish').textContent,'Udgiv');
  check(run("same('<p>A&#160;B</p>','<p>A&nbsp;B</p>')"),true);
  const publicBefore=await(await call('api/content',{identity:viewer})).json();
  // The exact section the user could not find is editable from the homepage.
  run("openDescriptor(descriptors.find(item=>item.id==='nature'))");
  check(document.querySelector('#edit-context').textContent,'Forsiden');
  check(document.querySelector('[data-fragment="firstParagraph"]')!==null,true);
  check(run("activeEdit.paths.some(path=>path.startsWith('pages.'))"),true);
  check(document.querySelector('#edit-fields').textContent.includes('Du kan rette den her'),true);
  const naturePath=run("firstParagraph(pageByKey(descriptors.find(item=>item.id==='nature').pageKey))");
  const original=run('at(state.draft,'+JSON.stringify(naturePath)+')');
  context.fragmentBase=original;
  run("put("+JSON.stringify(naturePath)+",replaceFragment(fragmentBase,'<p>Ny indledning fra den synlige forside.</p>'));markDirty()");
  check(await run('persist()'),true);
  check(run('dirty'),false);
  const draft=run('at(state.draft,'+JSON.stringify(naturePath)+')');
  const source=nodeText(original,parseHTML),after=nodeText(draft,parseHTML);
  check(after.paragraphs.slice(1),source.paragraphs.slice(1),'Editing the homepage excerpt must preserve every subsequent paragraph.');
  check(after.paragraphs[0],'Ny indledning fra den synlige forside.');
  check((await(await call('api/content',{identity:viewer})).json()).revision,publicBefore.revision,'Saving must not publish.');
  check(await run('finishEdit()'),true);

  context.location.hash='#page/vuggestue';run('render()');
  check(document.querySelector('#site-frame').getAttribute('src'),'/oenskelandet/vuggestue?preview=1');
  run("openDescriptor(descriptors.find(item=>item.kind==='block'&&at(state.draft,item.path).type==='text'))");
  const mounted=document.querySelector('#rich-editor');
  run("state.draft.home.description+=' Autosave';markDirty()");
  for(let attempt=0;attempt<90&&run('dirty');attempt++)await new Promise(resolve=>setTimeout(resolve,50));
  check(run('dirty'),false);check(document.querySelector('#rich-editor')===mounted,true,'Saving must preserve the editor DOM.');
  const normalFetch=context.fetch;let release,started;
  const gate=new Promise(resolve=>{release=resolve;}),began=new Promise(resolve=>{started=resolve;});
  context.fetch=async(path,options)=>{if(path.endsWith('/save')){started();await gate;}return normalFetch(path,options);};
  run("state.draft.home.description+=' Første rettelse';markDirty()");const inFlight=run('persist()');await began;
  run("state.draft.home.description+=' Anden rettelse';markDirty()");release();check(await inFlight,true);
  check(run("dirty&&state.draft.home.description.endsWith('Anden rettelse')"),true,'A slow response must preserve newer local edits.');
  context.fetch=normalFetch;check(await run('persist()'),true);check(run('dirty'),false);check(document.querySelector('#rich-editor')===mounted,true);
  // Revert is scoped to this section and works even after autosave.
  const path=run('activeEdit.paths[0]'),before=run('clone(at(state.draft,'+JSON.stringify(path)+'))');
  run('at(state.draft,'+JSON.stringify(path)+").html='<p>Fortryd mig</p>';markDirty()");check(await run('persist()'),true);
  await run('revertEdit()');check(JSON.stringify(run('at(state.draft,'+JSON.stringify(path)+')')),JSON.stringify(before));

  context.testUpload=new File([png],'admin-test.png',{type:'image/png'});
  check((await run('upload(testUpload)'))?.name,'admin-test.png');
  run("openDescriptor(pageDescriptors('')[0],true)");
  check(document.querySelectorAll('input[type="url"]').length,0,'Relative protected media URLs must remain valid in asset fields.');
  await run('finishEdit()');
  run("renamePage(pageById('vuggestue'),'vuggestue-ny')");check(await run('persist()'),true);
  check(run("pageById('vuggestue-ny').aliases.includes('vuggestue')"),true);
  run("state.draft.shared.visit.title='Fælles besøgstest';markDirty()");
  check(run("changes().some(item=>item.label==='Rundvisning')"),true);
  await run('reviewPublication()');check(document.querySelector('#confirm-title').textContent,'Vis ændringerne på hjemmesiden');
  check(await run('persist(true)'),true);check((await call('vuggestue')).headers.get('location'),'/oenskelandet/vuggestue-ny');
  check(document.querySelector('#notice a').getAttribute('href'),'/oenskelandet/vuggestue-ny');
  for(const hash of ['#home','#people','#documents','#files','#settings','#history']){context.location.hash=hash;run('render()');check(Boolean(document.querySelector('#view h1')),true,'Missing title for '+hash);}
  for(const setting of ['contact','navigation','logos','pages','shared','layout','people-order','usage']){run('openSetting('+JSON.stringify(setting)+')');check(Boolean(document.querySelector('#edit-title').textContent),true,'Missing setting '+setting);}
  run("openSetting('contact')");check(document.querySelector('#edit-fields').textContent.includes('Hovedmenu'),false);await run('finishEdit()');
  run('newDocument()');check(await run('persist(false,true)'),false,'Incomplete PDFs must not be saved.');await run('revertEdit()');check(run('invalidDraft()'),'');
  run('newPerson()');const personId=run('state.draft.people.at(-1).id');await run('revertEdit()');check(run('state.draft.people.some(person=>person.id==='+JSON.stringify(personId)+')'),false);
  // A failed request keeps the draft and exposes retry, without replacing the UI.
  context.fetch=async(path,options)=>path.endsWith('/save')?new Response(JSON.stringify({error:'Offline afprøvning'}),{status:503,headers:{'content-type':'application/json'}}):normalFetch(path,options);
  run("state.draft.home.description+=' Bevar rettelsen';markDirty()");check(await run('persist()'),false);check(run('dirty'),true);check(document.querySelector('[data-retry]')!==null,true);
  context.fetch=normalFetch;check(await run('persist()'),true);
  run('clearTimeout(saveTimer)');
}
function nodeText(html,parseHTML){const {document}=parseHTML('<html><body>'+html+'</body></html>');return {paragraphs:[...document.querySelectorAll('p')].map(element=>element.textContent)};}
