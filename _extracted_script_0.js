
/* ============================================================
   DATALAG  (Cloudflare Pages Functions + D1)
   --------------------------------------------------------
   Render-funktionerne læser synkront fra cachen. Hver mutation
   gemmes i API'et og henter derefter den berørte del igen, så
   alle familiens enheder ser de samme data.
   ============================================================ */
const API = "/api";
const cache = {plan:{}, dishes:[], shopping:[], freezer:[]};
const FREEZER_DRAWERS = [
  {name:"Oksekød", label:"Skuffe 1"},
  {name:"Andet", label:"Skuffe 2"},
  {name:"Gris", label:"Skuffe 3"},
  {name:"Kylling", label:"Skuffe 4"},
  {name:"Brød", label:"Skuffe 5"},
  {name:"Blandet", label:"Skuffe 6"},
];

async function apiResult(response){
  if(response.ok) return response.json();
  const payload = await response.json().catch(()=>({}));
  throw new Error(payload.error || "API-kaldet fejlede");
}

const jget = (path) =>
  fetch(API+path, {headers:{"accept":"application/json"}}).then(apiResult);

const jsend = (method, path, body) => {
  const options = {method, headers:{"accept":"application/json"}};
  if(body !== undefined){
    options.headers["content-type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  return fetch(API+path, options).then(apiResult);
};

function planRowsToMap(rows){
  const plan={};
  rows.filter(r=>r.meal_type==="aftensmad").forEach(r=>{
    plan[r.plan_date]={
      dishId:r.dish_id,
      name:r.dish_name,
      cook:r.cook || "",
      notes:r.notes || "",
      done:Number(r.is_done),
    };
  });
  return plan;
}

async function fetchWeekPlan(startDate){
  const from=iso(startDate), to=iso(addDays(startDate,6));
  return planRowsToMap(await jget(`/plan?from=${from}&to=${to}`));
}

async function loadWeek(){
  cache.plan=await fetchWeekPlan(weekStart);
}

async function loadDishes(){
  const rows=await jget("/dishes");
  cache.dishes=rows.map(d=>({
    id:Number(d.id),
    name:d.name,
    cat:d.category || "",
    fav:Number(d.is_favorite),
  }));
}

async function loadShopping(){
  const rows=await jget("/shopping");
  cache.shopping=rows.map(s=>({
    id:Number(s.id),
    name:s.name,
    qty:s.quantity || "",
    done:Number(s.is_checked),
  }));
}

async function loadFreezer(){
  const rows=await jget("/freezer");
  cache.freezer=rows.map(f=>({
    id:Number(f.id),
    drawer:f.drawer,
    name:f.name,
    amount:f.amount == null ? null : Number(f.amount),
    unit:f.unit || "",
    notes:f.notes || "",
  }));
}

const store = {
  init(){ return Promise.all([loadWeek(),loadDishes(),loadShopping(),loadFreezer()]); },
  loadWeek,
  async loadView(view){
    if(view==="plan") return loadWeek();
    if(view==="dishes") return loadDishes();
    if(view==="shopping") return loadShopping();
    return loadFreezer();
  },
  getPlan(dateISO){ return cache.plan[dateISO] ? {...cache.plan[dateISO]} : null; },

  /* ---- plan: optimistic ---- */
  async setPlan(dateISO,data){
    const prev=cache.plan[dateISO] ? {...cache.plan[dateISO]} : null;
    cache.plan[dateISO]={dishId:data.dishId ?? null,name:data.name,cook:data.cook||"",notes:data.notes||"",done:data.done?1:0};
    try{
      await jsend("PUT","/plan/"+encodeURIComponent(dateISO),{
        meal_type:"aftensmad",
        dish_id:data.dishId ?? null,
        dish_name:data.name,
        cook:data.cook || "",
        notes:data.notes || "",
        is_done:data.done ? 1 : 0,
      });
      await loadWeek();
    }catch(error){ if(prev===null) delete cache.plan[dateISO]; else cache.plan[dateISO]=prev; await loadWeek(); throw error; }
  },
  async clearPlan(dateISO){
    const prev=cache.plan[dateISO] ? {...cache.plan[dateISO]} : null;
    delete cache.plan[dateISO];
    try{
      await jsend("DELETE","/plan/"+encodeURIComponent(dateISO)+"?meal_type=aftensmad");
      await loadWeek();
    }catch(error){ if(prev) cache.plan[dateISO]=prev; await loadWeek(); throw error; }
  },
  getWeekPlan(startDate){ return fetchWeekPlan(startDate); },
  async movePlan(fromISO,toISO,planOverride=null){
    const plan=planOverride || this.getPlan(fromISO);
    if(!plan || fromISO===toISO) return;
    const prevTo=cache.plan[toISO] ? {...cache.plan[toISO]} : null;
    const prevFrom=cache.plan[fromISO] ? {...cache.plan[fromISO]} : null;
    cache.plan[toISO]={...plan};
    delete cache.plan[fromISO];
    try{
      await jsend("PUT","/plan/"+encodeURIComponent(toISO),{
        meal_type:"aftensmad",
        dish_id:plan.dishId ?? null,
        dish_name:plan.name,
        cook:plan.cook || "",
        notes:plan.notes || "",
        is_done:plan.done ? 1 : 0,
      });
      await jsend("DELETE","/plan/"+encodeURIComponent(fromISO)+"?meal_type=aftensmad");
      await loadWeek();
    }catch(error){ if(prevTo===null) delete cache.plan[toISO]; else cache.plan[toISO]=prevTo; if(prevFrom===null) delete cache.plan[fromISO]; else cache.plan[fromISO]=prevFrom; await loadWeek(); throw error; }
  },
  /* ---- dishes: optimistic ---- */
  getDishes(){ return cache.dishes.map(d=>({...d})); },
  async addDish(name,cat){
    await jsend("POST","/dishes",{name,category:cat || ""});
    await loadDishes();
  },
  async toggleFav(id){
    const dish=cache.dishes.find(d=>d.id===id);
    if(!dish) return;
    const prev=dish.fav;
    dish.fav=dish.fav?0:1;
    try{
      await jsend("PATCH","/dishes/"+id,{is_favorite:dish.fav});
      await loadDishes();
    }catch(error){ dish.fav=prev; await loadDishes(); throw error; }
  },
  /* ---- shopping: optimistic ---- */
  getShopping(){ return cache.shopping.map(s=>({...s})); },
  async addShop(name,quantity){
    await jsend("POST","/shopping",{name,quantity:quantity || ""});
    await loadShopping();
  },
  async toggleShop(id){
    const item=cache.shopping.find(s=>s.id===id);
    if(!item) return;
    const prev=item.done;
    item.done=item.done?0:1;
    try{
      await jsend("PATCH","/shopping/"+id,{is_checked:item.done});
      await loadShopping();
    }catch(error){ item.done=prev; await loadShopping(); throw error; }
  },
  async updateShop(id,{name,quantity}){
    const item=cache.shopping.find(s=>s.id===id);
    if(!item) return;
    const prev={name:item.name,qty:item.qty};
    if(name!=null) item.name=name;
    if(quantity!=null) item.qty=quantity;
    try{
      const patch={};
      if(name!=null) patch.name=name;
      if(quantity!=null) patch.quantity=quantity;
      await jsend("PATCH","/shopping/"+id,patch);
      await loadShopping();
    }catch(error){ item.name=prev.name; item.qty=prev.qty; await loadShopping(); throw error; }
  },
  async deleteShop(id){
    const idx=cache.shopping.findIndex(s=>s.id===id);
    if(idx<0) return;
    const prev=cache.shopping.splice(idx,1)[0];
    try{
      await jsend("DELETE","/shopping/"+id);
      await loadShopping();
    }catch(error){ cache.shopping.splice(idx,0,prev); await loadShopping(); throw error; }
  },
  async clearChecked(){
    const prev=cache.shopping.slice();
    cache.shopping=cache.shopping.filter(s=>!s.done);
    try{
      await jsend("DELETE","/shopping");
      await loadShopping();
    }catch(error){ cache.shopping=prev; await loadShopping(); throw error; }
  },
  /* ---- freezer: optimistic ---- */
  getFreezer(){ return cache.freezer.map(f=>({...f})); },
  async addFreezer(item){
    await jsend("POST","/freezer",item);
    await loadFreezer();
  },
  async updateFreezer(id,patch){
    const item=cache.freezer.find(f=>f.id===id);
    if(!item) return;
    const prev={drawer:item.drawer,name:item.name,amount:item.amount,unit:item.unit,notes:item.notes};
    if(patch.drawer!=null) item.drawer=patch.drawer;
    if(patch.name!=null) item.name=patch.name;
    if(patch.amount!=null) item.amount=Number(patch.amount);
    if(patch.unit!=null) item.unit=patch.unit;
    if(patch.notes!=null) item.notes=patch.notes;
    try{
      await jsend("PATCH","/freezer/"+id,patch);
      await loadFreezer();
    }catch(error){ Object.assign(item,prev); await loadFreezer(); throw error; }
  },
  async deleteFreezer(id){
    const idx=cache.freezer.findIndex(f=>f.id===id);
    if(idx<0) return;
    const prev=cache.freezer.splice(idx,1)[0];
    try{
      await jsend("DELETE","/freezer/"+id);
      await loadFreezer();
    }catch(error){ cache.freezer.splice(idx,0,prev); await loadFreezer(); throw error; }
  },
  async clearEmptyFreezer(){
    const prev=cache.freezer.slice();
    cache.freezer=cache.freezer.filter(f=>Number(f.amount)!==0);
    try{
      await jsend("DELETE","/freezer?empty=1");
      await loadFreezer();
    }catch(error){ cache.freezer=prev; await loadFreezer(); throw error; }
  },
};

/* ---------------- dato-hjælpere ---------------- */
const WD_SHORT=["Man","Tir","Ons","Tor","Fre","Lør","Søn"];
const WD_LONG =["mandag","tirsdag","onsdag","torsdag","fredag","lørdag","søndag"];
const MONTHS  =["januar","februar","marts","april","maj","juni","juli","august","september","oktober","november","december"];

function mondayOf(date){ const d=new Date(date); const day=(d.getDay()+6)%7; d.setHours(0,0,0,0); d.setDate(d.getDate()-day); return d; }
function addDays(date,n){ const d=new Date(date); d.setDate(d.getDate()+n); return d; }
function iso(date){ const d=new Date(date); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function isoWeek(date){
  const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));
  const day=(d.getUTCDay()+6)%7; d.setUTCDate(d.getUTCDate()-day+3);
  const firstThu=new Date(Date.UTC(d.getUTCFullYear(),0,4));
  const firstDay=(firstThu.getUTCDay()+6)%7; firstThu.setUTCDate(firstThu.getUTCDate()-firstDay+3);
  return 1+Math.round((d-firstThu)/(7*864e5));
}

/* ---------------- app-tilstand ---------------- */
let weekStart = mondayOf(new Date());
let currentView = "plan";
let freezerQuery = "";
let freezerDrawer = "Oksekød";
const todayISO = iso(new Date());

const $ = (s,root=document)=>root.querySelector(s);
const el = (html)=>{ const t=document.createElement("template"); t.innerHTML=html.trim(); return t.content.firstElementChild; };
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove("show"),1900); }
function reportError(error,msg="Kunne ikke gemme"){ console.error(error); toast(msg); }

/* ---------------- render ---------------- */
function render(){
  $("#weekLabel").textContent = "Uge "+isoWeek(weekStart);
  $("#wordmarkLabel").textContent = currentView==="freezer" ? "Fryser" : "Madplan";
  $(".weeknav").hidden = currentView !== "plan";
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active", b.dataset.view===currentView));
  const view = $("#view");
  if(currentView==="plan")     view.innerHTML="", view.append(...renderPlan());
  if(currentView==="dishes")   view.innerHTML="", view.append(...renderDishes());
  if(currentView==="shopping") view.innerHTML="", view.append(...renderShopping());
  if(currentView==="freezer")  view.innerHTML="", view.append(...renderFreezer());
}

function renderPlan(){
  const out=[];
  const today = new Date();
  const inThisWeek = iso(mondayOf(today))===iso(weekStart);
  const heroDate = inThisWeek ? today : weekStart;
  const heroISO = iso(heroDate);
  const heroPlan = store.getPlan(heroISO);

  out.push(el(`<p class="eyebrow">${inThisWeek?"I dag":"Mandag"} · ${WD_LONG[(heroDate.getDay()+6)%7]} ${heroDate.getDate()}. ${MONTHS[heroDate.getMonth()]}</p>`));

  const hero = el(`
    <section class="hero"><div class="hero-inner">
      <div class="hero-top">
        <span class="tag">Aftensmad</span>
        <span class="date">${inThisWeek?"i dag":"ugens start"}</span>
        <span class="done-pill ${heroPlan&&heroPlan.done?"on":""}">${heroPlan&&heroPlan.done?"Klaret ✓":"Ikke lavet"}</span>
      </div>
      <div class="hero-dish ${heroPlan?"":"empty"}">${heroPlan?escape(heroPlan.name):"Ingen ret planlagt — tryk for at vælge"}</div>
      <div class="hero-meta">
        ${heroPlan&&heroPlan.cook?`<span><span class="ic">👩‍🍳</span>${escape(heroPlan.cook)}</span>`:`<span class="ic" style="color:var(--muted)">Tilføj hvem der laver mad</span>`}
        ${heroPlan&&heroPlan.notes?`<span><span class="ic">📝</span>${escape(heroPlan.notes)}</span>`:""}
      </div>
    </div></section>`);
  hero.querySelector(".hero-inner").addEventListener("click",()=>openSheet(heroISO));
  if(heroPlan){
    hero.querySelector(".hero-dish").addEventListener("click",e=>{
      e.stopPropagation();
      openMoveSheet(heroISO);
    });
  }
  out.push(hero);

  out.push(el(`<p class="eyebrow">Hele ugen</p>`));
  const week = el(`<div class="week"></div>`);
  for(let i=0;i<7;i++){
    const d=addDays(weekStart,i), di=iso(d), p=store.getPlan(di);
    const isToday = di===todayISO;
    const row = el(`
      <div class="day ${isToday?"is-today":""}">
        <div class="wd"><b>${WD_SHORT[i]}</b><small>${d.getDate()}/${d.getMonth()+1}</small></div>
        <div class="body">
          <div class="dish ${p?"":"empty"}">${p?escape(p.name):"Planlæg ret"}</div>
          ${p&&p.cook?`<div class="sub">${escape(p.cook)}</div>`:""}
        </div>
        ${p&&p.done?`<span class="check">✓</span>`:""}
        <span class="chev">›</span>
      </div>`);
    row.addEventListener("click",()=>openSheet(di));
    if(p){
      row.querySelector(".dish").addEventListener("click",e=>{
        e.stopPropagation();
        openMoveSheet(di);
      });
    }
    week.append(row);
  }
  out.push(week);
  return out;
}

function renderDishes(){
  const out=[];
  out.push(el(`<p class="eyebrow row"><span>Mine retter</span></p>`));
  const bar = el(`<div class="addbar"><input id="newDish" placeholder="Ny ret, fx Tomatsuppe" maxlength="80"><button class="btn" id="addDish">Tilføj</button></div>`);
  bar.querySelector("#addDish").addEventListener("click",async()=>{
    const inp=bar.querySelector("#newDish"); const v=inp.value.trim();
    if(!v) return;
    const button=bar.querySelector("#addDish"); button.disabled=true;
    try{
      await store.addDish(v); inp.value=""; render(); toast("Ret tilføjet");
    }catch(error){
      button.disabled=false; reportError(error);
    }
  });
  bar.querySelector("#newDish").addEventListener("keydown",e=>{ if(e.key==="Enter") bar.querySelector("#addDish").click(); });
  out.push(bar);

  const list = el(`<div class="list"></div>`);
  store.getDishes().forEach(d=>{
    const row = el(`
      <div class="card-row tap">
        <button class="star ${d.fav?"on":""}" aria-label="Favorit">★</button>
        <div class="name">${escape(d.name)}${d.cat?`<span class="cat">${escape(d.cat)}</span>`:""}</div>
        <span class="chev" style="color:var(--muted);opacity:.5">›</span>
      </div>`);
    row.querySelector(".star").addEventListener("click",async e=>{
      e.stopPropagation();
      try{ await store.toggleFav(d.id); render(); }
      catch(error){ reportError(error); }
    });
    row.querySelector(".name").addEventListener("click",()=>openDayPicker(d));
    row.querySelector(".chev").addEventListener("click",()=>openDayPicker(d));
    list.append(row);
  });
  out.push(list);
  return out;
}

function renderShopping(){
  const out=[];
  out.push(el(`<p class="eyebrow row"><span>Indkøbsliste</span><span class="link" id="clearChecked">Ryd afkrydsede</span></p>`));
  const bar = el(`<div class="addbar"><input id="newItem" placeholder="Tilføj vare" maxlength="80"><button class="btn" id="addItem">Tilføj</button></div>`);
  bar.querySelector("#addItem").addEventListener("click",async()=>{
    const inp=bar.querySelector("#newItem"); const v=inp.value.trim();
    if(!v) return;
    const button=bar.querySelector("#addItem"); button.disabled=true;
    try{
      await store.addShop(v); inp.value=""; render();
    }catch(error){
      button.disabled=false; reportError(error);
    }
  });
  bar.querySelector("#newItem").addEventListener("keydown",e=>{ if(e.key==="Enter") bar.querySelector("#addItem").click(); });
  out.push(bar);

  const items = store.getShopping();
  if(items.length===0){
    out.push(el(`<div class="empty-note">Listen er tom. Tilføj de varer, I mangler.</div>`));
    setTimeout(()=>{ const c=$("#clearChecked"); if(c) c.style.display="none"; });
    return out;
  }
  const list = el(`<div class="list"></div>`);
  items.sort((a,b)=>a.done-b.done).forEach(s=>{
    const row = el(`
      <div class="card-row check-row ${s.done?"done":""}">
        <div class="box">${s.done?"✓":""}</div>
        <div class="name">${escape(s.name)}</div>
        ${s.qty?`<span class="qty">${escape(s.qty)}</span>`:""}
        <div class="shop-actions">
          <button class="shop-edit" aria-label="Rediger ${escapeAttr(s.name)}">✎</button>
          <button class="shop-del" aria-label="Slet ${escapeAttr(s.name)}">×</button>
        </div>
      </div>`);
    row.querySelector(".box").addEventListener("click",async()=>{
      try{ await store.toggleShop(s.id); render(); }
      catch(error){ reportError(error); }
    });
    row.querySelector(".shop-edit").addEventListener("click",e=>{ e.stopPropagation(); openShoppingSheet(s); });
    row.querySelector(".shop-del").addEventListener("click",async e=>{
      e.stopPropagation();
      try{ await store.deleteShop(s.id); render(); toast("Slettet"); }
      catch(error){ reportError(error,"Kunne ikke slette"); }
    });
    list.append(row);
  });
  out.push(list);
  setTimeout(()=>{
    const c=$("#clearChecked");
    if(c) c.addEventListener("click",async()=>{
      try{ await store.clearChecked(); render(); }
      catch(error){ reportError(error); }
    });
  });
  return out;
}

function splitFreezerInput(raw){
  const value=raw.trim().replace(/\s+/g," ");
  if(!value) return {name:"", quantity:"", amount:null, unit:""};

  const patterns=[
    /^(\d+\s*x\s+\d+\s*(?:g|kg|stk\.?|ps|pose|poser|pakke|pakker))\s+(.+)$/i,
    /^(\d+\s*x)\s+(.+)$/i,
    /^(\d+\/\d+\s+(?:pose|poser|ps|pakke|pakker|glas|boks))\s+(.+)$/i,
    /^(\d+\/\d+)\s+(.+)$/i,
    /^(\d+\s*(?:g|kg|stk\.?|ps|pose|poser|pakke|pakker|glas|boks))\s+(.+)$/i,
    /^(\d+)\s+(.+)$/i,
  ];

  for(const pattern of patterns){
    const match=value.match(pattern);
    if(match){
      const parsed=parseAmountUnit(match[1].trim());
      return {
        quantity:match[1].trim(),
        amount:parsed.amount,
        unit:parsed.unit,
        name:match[2].trim(),
      };
    }
  }
  return {name:value, quantity:"", amount:1, unit:""};
}

function parseAmountUnit(value){
  const text=String(value || "").trim().replace(/\s+/g," ");
  const fraction=text.match(/^(\d+)\/(\d+)(?:\s+(.+))?$/);
  if(fraction){
    const top=Number(fraction[1]), bottom=Number(fraction[2]);
    return {amount:bottom?top/bottom:null, unit:(fraction[3] || "").trim()};
  }
  const xPack=text.match(/^(\d+(?:[,.]\d+)?)\s*x\s*(.+)$/i);
  if(xPack) return {amount:Number(xPack[1].replace(",",".")), unit:xPack[2].trim()};
  const xOnly=text.match(/^(\d+(?:[,.]\d+)?)\s*x$/i);
  if(xOnly) return {amount:Number(xOnly[1].replace(",",".")), unit:""};
  const compactUnit=text.match(/^(\d+(?:[,.]\d+)?)(g|kg|stk\.?|ps|pose|poser|pakke|pakker|glas|boks)$/i);
  if(compactUnit) return {amount:Number(compactUnit[1].replace(",",".")), unit:compactUnit[2].trim()};
  const numberUnit=text.match(/^(\d+(?:[,.]\d+)?)(?:\s+(.+))?$/);
  if(numberUnit) return {amount:Number(numberUnit[1].replace(",",".")), unit:(numberUnit[2] || "").trim()};
  return {amount:null, unit:text};
}

function formatFreezerAmount(amount){
  if(amount == null || Number.isNaN(Number(amount))) return "?";
  const rounded=Math.round(Number(amount)*100)/100;
  const fractions=new Map([[0.25,"1/4"],[0.5,"1/2"],[0.75,"3/4"]]);
  if(fractions.has(rounded)) return fractions.get(rounded);
  return String(rounded).replace(".",",");
}

function freezerQuantityLabel(item){
  const amount=formatFreezerAmount(item.amount);
  return item.unit ? `${amount} ${item.unit}` : amount;
}

function freezerStep(item){
  const amount=Number(item.amount);
  return amount > 0 && amount < 1 ? 0.25 : 1;
}

async function bumpFreezerAmount(item,direction){
  const current=item.amount == null || Number.isNaN(Number(item.amount)) ? 0 : Number(item.amount);
  const next=Math.max(0,Math.round((current + direction*freezerStep(item))*100)/100);
  await store.updateFreezer(item.id,{amount:next});
}

function drawerMeta(drawer){
  return FREEZER_DRAWERS.find(d=>d.name===drawer) || {name:drawer,label:"Skuffe"};
}

function applyFreezerFilter(query, root=document){
  const q=String(query||"").toLowerCase().trim();
  root.querySelectorAll(".freezer-drawer").forEach(section=>{
    const rows=section.querySelectorAll(".freezer-item");
    let visible=0;
    rows.forEach(row=>{
      const match=!q || (row.dataset.search||"").includes(q);
      row.hidden=!match;
      if(match) visible++;
    });
    const empty=section.querySelector(".freezer-empty");
    if(empty){
      if(visible>0){ empty.hidden=true; }
      else{ empty.hidden=false; empty.textContent=q?"Ingen match i denne skuffe":"Tom skuffe"; }
    }
    section.hidden = q && visible===0;
  });
}

function renderFreezer(){
  const out=[];
  const items=store.getFreezer();
  const drawerCounts=FREEZER_DRAWERS.map(drawer=>({
    ...drawer,
    count:items.filter(item=>item.drawer===drawer.name).length,
  }));
  const fullest=drawerCounts.reduce((best,drawer)=>drawer.count>best.count?drawer:best,drawerCounts[0]);

  const emptyCount=items.filter(i=>Number(i.amount)===0).length;
  const eyebrow=el(`<p class="eyebrow row"><span>Fryseroverblik</span><span>${items.length} linjer${emptyCount?` · <span class="link" id="clearEmptyFreezer">Ryd ${emptyCount} tomme</span>`:""}</span></p>`);
  out.push(eyebrow);
  if(emptyCount){
    eyebrow.querySelector("#clearEmptyFreezer").addEventListener("click",async()=>{
      try{ await store.clearEmptyFreezer(); render(); toast("Tomme linjer ryddet"); }
      catch(error){ reportError(error,"Kunne ikke rydde"); }
    });
  }
  out.push(el(`
    <section class="freezer-summary">
      <b>${items.length} fryserlinjer</b>
      <span>${drawerCounts.filter(d=>d.count).length}/6 skuffer · mest i ${escape(fullest.name)}</span>
    </section>`));

  const search=el(`<div class="freezer-search"><input id="freezerSearch" placeholder="Søg i fryseren" value="${escapeAttr(freezerQuery)}"></div>`);
  search.querySelector("#freezerSearch").addEventListener("input",e=>{
    freezerQuery=e.currentTarget.value;
    applyFreezerFilter(freezerQuery);
  });
  out.push(search);

  const add=el(`
    <div class="freezer-add">
      <select id="freezerDrawer" aria-label="Vælg skuffe">
        ${FREEZER_DRAWERS.map(d=>`<option value="${escapeAttr(d.name)}" ${d.name===freezerDrawer?"selected":""}>${escape(d.name)}</option>`).join("")}
      </select>
      <input id="newFreezerAmountUnit" placeholder="Antal/enhed" maxlength="40" aria-label="Antal og enhed">
      <input id="newFreezerItem" placeholder="fx lasagne" maxlength="120" aria-label="Tekst">
      <button class="btn" id="addFreezerItem">Tilføj</button>
    </div>`);
  add.querySelector("#freezerDrawer").addEventListener("change",e=>{ freezerDrawer=e.currentTarget.value; });
  add.querySelector("#addFreezerItem").addEventListener("click",async()=>{
    const amountInput=add.querySelector("#newFreezerAmountUnit");
    const nameInput=add.querySelector("#newFreezerItem");
    const name=nameInput.value.trim();
    if(!name) return;
    const quantity=amountInput.value.trim();
    const parsed=quantity ? parseAmountUnit(quantity) : {amount:1,unit:""};
    const button=add.querySelector("#addFreezerItem");
    button.disabled=true;
    try{
      await store.addFreezer({drawer:freezerDrawer,name,amount:parsed.amount,unit:parsed.unit,notes:""});
      amountInput.value="";
      nameInput.value="";
      render();
      toast("Lagt i fryseren");
    }catch(error){
      button.disabled=false;
      reportError(error,"Kunne ikke tilføje");
    }
  });
  add.querySelectorAll("input").forEach(input=>input.addEventListener("keydown",e=>{
    if(e.key==="Enter") add.querySelector("#addFreezerItem").click();
  }));
  out.push(add);

  const drawerWrap=el(`<div class="freezer-drawers"></div>`);
  FREEZER_DRAWERS.forEach(drawer=>{
    const drawerItems=items.filter(item=>item.drawer===drawer.name);
    const totalInDrawer=drawerItems.length;
    const section=el(`
      <section class="freezer-drawer">
        <div class="freezer-drawer-head">
          <div><h3>${escape(drawer.name)}</h3><small>${escape(drawer.label)}</small></div>
          <span class="freezer-count">${totalInDrawer} ting</span>
        </div>
        <div class="freezer-items"></div>
      </section>`);
    const list=section.querySelector(".freezer-items");
    list.append(el(`<div class="freezer-empty"${totalInDrawer?" hidden":""}>${totalInDrawer?"":"Tom skuffe"}</div>`));
    drawerItems.forEach(item=>{
      const isEmpty=Number(item.amount)===0;
      const amountLabel=isEmpty?"Tom":formatFreezerAmount(item.amount);
      const haystack=`${item.drawer} ${item.name} ${freezerQuantityLabel(item)} ${item.notes}`.toLowerCase();
      const row=el(`
          <div class="freezer-item${isEmpty?" is-empty":""}" data-search="${escapeAttr(haystack)}">
            <div class="freezer-stepper" aria-label="Antal ${escapeAttr(item.name)}">
              <button class="freezer-dec" aria-label="Træk fra">−</button>
              <div class="freezer-amount">${escape(amountLabel)}${item.unit&&!isEmpty?`<small>${escape(item.unit)}</small>`:""}</div>
              <button class="freezer-inc" aria-label="Læg til">+</button>
            </div>
            <div class="freezer-name">
              <b>${escape(item.name)}</b>
              ${item.notes?`<small>${escape(item.notes)}</small>`:""}
            </div>
            <button class="freezer-delete" aria-label="Slet ${escapeAttr(item.name)}">×</button>
          </div>`);
      row.addEventListener("click",()=>openFreezerSheet(item));
      row.querySelector(".freezer-dec").addEventListener("click",async e=>{
        e.stopPropagation();
        e.currentTarget.disabled=true;
        try{
          await bumpFreezerAmount(item,-1);
          render();
        }catch(error){
          e.currentTarget.disabled=false;
          reportError(error,"Kunne ikke ændre antal");
        }
      });
      row.querySelector(".freezer-inc").addEventListener("click",async e=>{
        e.stopPropagation();
        e.currentTarget.disabled=true;
        try{
          await bumpFreezerAmount(item,1);
          render();
        }catch(error){
          e.currentTarget.disabled=false;
          reportError(error,"Kunne ikke ændre antal");
        }
      });
      row.querySelector(".freezer-delete").addEventListener("click",async e=>{
        e.stopPropagation();
        e.currentTarget.disabled=true;
        try{
          await store.deleteFreezer(item.id);
          render();
          toast("Slettet fra fryseren");
        }catch(error){
          e.currentTarget.disabled=false;
          reportError(error,"Kunne ikke slette");
        }
      });
      list.append(row);
    });
    drawerWrap.append(section);
  });
  out.push(drawerWrap);
  applyFreezerFilter(freezerQuery, drawerWrap);
  return out;
}

/* ---------------- bottom sheet: rediger indkøbsvare ---------------- */
function openShoppingSheet(item){
  const sheet=$("#sheet");
  sheet.innerHTML=`
    <div class="grabber"></div>
    <h2>Rediger vare</h2>
    <p class="sub">Ret navn eller mængde, eller slet varen.</p>
    <div class="field">
      <label>Navn</label>
      <input id="shopName" maxlength="80" value="${escapeAttr(item.name)}">
    </div>
    <div class="field">
      <label>Mængde</label>
      <input id="shopQty" maxlength="60" placeholder="fx 2 poser, 500g" value="${escapeAttr(item.qty)}">
    </div>
    <div class="sheet-actions">
      <button class="btn block" id="shopSave">Gem</button>
    </div>
    <span class="link-danger" id="shopDelete">Slet vare</span>
  `;

  sheet.querySelector("#shopSave").addEventListener("click",async e=>{
    const name=sheet.querySelector("#shopName").value.trim();
    if(!name) return;
    e.currentTarget.disabled=true;
    try{
      await store.updateShop(item.id,{name,quantity:sheet.querySelector("#shopQty").value.trim()});
      closeSheet();
      render();
      toast("Vare opdateret");
    }catch(error){
      e.currentTarget.disabled=false;
      reportError(error,"Kunne ikke gemme");
    }
  });

  sheet.querySelector("#shopDelete").addEventListener("click",async()=>{
    try{
      await store.deleteShop(item.id);
      closeSheet();
      render();
      toast("Vare slettet");
    }catch(error){
      reportError(error,"Kunne ikke slette");
    }
  });

  showSheet();
}

/* ---------------- bottom sheet: rediger fryserlinje ---------------- */
function openFreezerSheet(item){
  const sheet=$("#sheet");
  const meta=drawerMeta(item.drawer);
  sheet.innerHTML=`
    <div class="grabber"></div>
    <h2>${escape(item.name)}</h2>
    <p class="sub">${escape(meta.label)} · ${escape(item.drawer)}</p>
    <div class="field">
      <label>Navn</label>
      <input id="freezerName" maxlength="100" value="${escapeAttr(item.name)}">
    </div>
    <div class="field-grid">
      <div class="field">
        <label>Antal</label>
        <input id="freezerAmount" type="number" inputmode="decimal" min="0" max="999" step="0.25" value="${item.amount == null ? "" : escapeAttr(item.amount)}">
      </div>
      <div class="field">
        <label>Enhed/pakning</label>
        <input id="freezerUnit" maxlength="30" placeholder="fx 500g, stk., ps" value="${escapeAttr(item.unit)}">
      </div>
    </div>
    <div class="field">
      <label>Skuffe</label>
      <div class="chips" id="freezerDrawerChips"></div>
    </div>
    <div class="field">
      <label>Note</label>
      <input id="freezerNote" maxlength="160" placeholder="fx til fødselsdag" value="${escapeAttr(item.notes)}">
    </div>
    <div class="sheet-actions">
      <button class="btn block" id="freezerSave">Gem</button>
    </div>
    <span class="link-danger" id="freezerDelete">Slet fra fryseren</span>
  `;

  const chips=sheet.querySelector("#freezerDrawerChips");
  let selectedDrawer=item.drawer;
  FREEZER_DRAWERS.forEach(drawer=>{
    const chip=el(`<div class="chip ${drawer.name===selectedDrawer?"sel":""}">${escape(drawer.name)}</div>`);
    chip.addEventListener("click",()=>{
      selectedDrawer=drawer.name;
      chips.querySelectorAll(".chip").forEach(c=>c.classList.remove("sel"));
      chip.classList.add("sel");
    });
    chips.append(chip);
  });

  sheet.querySelector("#freezerSave").addEventListener("click",async e=>{
    const name=sheet.querySelector("#freezerName").value.trim();
    if(!name) return;
    e.currentTarget.disabled=true;
    try{
      await store.updateFreezer(item.id,{
        drawer:selectedDrawer,
        name,
        amount:sheet.querySelector("#freezerAmount").value.trim(),
        unit:sheet.querySelector("#freezerUnit").value.trim(),
        notes:sheet.querySelector("#freezerNote").value.trim(),
      });
      closeSheet();
      render();
      toast("Fryseren er opdateret");
    }catch(error){
      e.currentTarget.disabled=false;
      reportError(error,"Kunne ikke gemme");
    }
  });

  sheet.querySelector("#freezerDelete").addEventListener("click",async()=>{
    try{
      await store.deleteFreezer(item.id);
      closeSheet();
      render();
      toast("Slettet fra fryseren");
    }catch(error){
      reportError(error,"Kunne ikke slette");
    }
  });

  showSheet();
}

/* ---------------- bottom sheet: rediger en dag ---------------- */
let sheetDate=null, sheetDraft=null;
function openSheet(dateISO){
  sheetDate=dateISO;
  const d=new Date(dateISO+"T00:00:00");
  const existing=store.getPlan(dateISO);
  sheetDraft = existing ? {...existing} : {dishId:null,name:"",cook:"",notes:"",done:0};

  const sheet=$("#sheet");
  sheet.innerHTML=`
    <div class="grabber"></div>
    <h2>${WD_LONG[(d.getDay()+6)%7].replace(/^./,c=>c.toUpperCase())} ${d.getDate()}. ${MONTHS[d.getMonth()]}</h2>
    <p class="sub">Aftensmad</p>
    <div class="field">
      <label>Ret</label>
      <input id="fDish" maxlength="120" placeholder="Skriv en ret, eller vælg nedenfor" value="${escapeAttr(sheetDraft.name)}">
    </div>
    <div class="field">
      <label>Vælg fra biblioteket</label>
      <div class="chips" id="fChips"></div>
    </div>
    <div class="field">
      <label>Hvem laver mad</label>
      <input id="fCook" maxlength="60" placeholder="fx Mor, Far …" value="${escapeAttr(sheetDraft.cook)}">
    </div>
    <div class="field">
      <label>Note</label>
      <input id="fNote" maxlength="200" placeholder="fx rester fra i går" value="${escapeAttr(sheetDraft.notes)}">
    </div>
    <div class="field">
      <div class="toggle-done ${sheetDraft.done?"on":""}" id="fDone">
        <span>Maden er lavet</span><span class="sw"></span>
      </div>
    </div>
    <div class="sheet-actions ${existing?"stack":""}">
      ${existing?`<button class="btn ghost block" id="fMove">Flyt ret</button>`:""}
      <button class="btn block" id="fSave">Gem</button>
    </div>
    ${existing?`<span class="link-danger" id="fClear">Ryd dagen</span>`:""}
  `;
  const chips=sheet.querySelector("#fChips");
  store.getDishes().slice(0,8).forEach(dish=>{
    const c=el(`<div class="chip ${sheetDraft.name===dish.name?"sel":""}">${escape(dish.name)}</div>`);
    c.addEventListener("click",()=>{
      sheet.querySelector("#fDish").value=dish.name; sheetDraft.dishId=dish.id;
      chips.querySelectorAll(".chip").forEach(x=>x.classList.remove("sel")); c.classList.add("sel");
    });
    chips.append(c);
  });
  sheet.querySelector("#fDish").addEventListener("input",e=>{
    const selected=store.getDishes().find(d=>d.id===sheetDraft.dishId);
    if(!selected || selected.name!==e.currentTarget.value){
      sheetDraft.dishId=null;
      chips.querySelectorAll(".chip").forEach(x=>x.classList.remove("sel"));
    }
  });
  sheet.querySelector("#fDone").addEventListener("click",e=>{ sheetDraft.done=sheetDraft.done?0:1; e.currentTarget.classList.toggle("on"); });
  const move=sheet.querySelector("#fMove");
  if(move) move.addEventListener("click",()=>openMoveSheet(dateISO));
  sheet.querySelector("#fSave").addEventListener("click",async e=>{
    const name=sheet.querySelector("#fDish").value.trim();
    e.currentTarget.disabled=true;
    try{
      if(!name){ await store.clearPlan(sheetDate); }
      else await store.setPlan(sheetDate,{name, dishId:sheetDraft.dishId, cook:sheet.querySelector("#fCook").value.trim(), notes:sheet.querySelector("#fNote").value.trim(), done:sheetDraft.done});
      closeSheet(); render(); toast("Gemt");
    }catch(error){
      e.currentTarget.disabled=false; reportError(error);
    }
  });
  const clr=sheet.querySelector("#fClear");
  if(clr) clr.addEventListener("click",async()=>{
    try{
      await store.clearPlan(sheetDate); closeSheet(); render(); toast("Dagen ryddet");
    }catch(error){
      reportError(error);
    }
  });
  showSheet();
}

function dayChoiceLabel(date,index){
  return `${WD_SHORT[index]} ${date.getDate()}/${date.getMonth()+1}`;
}

function openMoveSheet(fromISO){
  const plan=store.getPlan(fromISO);
  if(!plan) return openSheet(fromISO);

  const sourceDate=new Date(fromISO+"T00:00:00");
  const sourceIndex=(sourceDate.getDay()+6)%7;
  const sheet=$("#sheet");
  let moveWeekStart=mondayOf(sourceDate);
  let moveRequest=0;
  sheet.innerHTML=`<div class="grabber"></div>
    <h2>Flyt ${escape(plan.name)}</h2>
    <p class="sub">Fra ${WD_LONG[sourceIndex]} ${sourceDate.getDate()}. ${MONTHS[sourceDate.getMonth()]}</p>
    <div class="move-week-nav">
      <button id="movePrevWeek" type="button" aria-label="Forrige uge">‹</button>
      <span id="moveWeekLabel"></span>
      <button id="moveNextWeek" type="button" aria-label="Næste uge">›</button>
    </div>
    <div class="day-picker" id="moveDayChoices"></div>`;

  const choices=sheet.querySelector("#moveDayChoices");
  const label=sheet.querySelector("#moveWeekLabel");
  const prev=sheet.querySelector("#movePrevWeek");
  const next=sheet.querySelector("#moveNextWeek");

  async function renderMoveWeek(){
    const request=++moveRequest;
    label.textContent="Uge "+isoWeek(moveWeekStart);
    choices.innerHTML=`<div class="empty-note">Henter uge …</div>`;
    prev.disabled=true;
    next.disabled=true;

    try{
      const weekPlan=await store.getWeekPlan(moveWeekStart);
      if(request!==moveRequest) return;
      choices.innerHTML="";
      for(let i=0;i<7;i++){
        const d=addDays(moveWeekStart,i), di=iso(d);
        const existing=weekPlan[di] || null;
        const isCurrent=di===fromISO;
        const isOccupied=Boolean(existing) && !isCurrent;
        const state=isCurrent ? "Nuværende" : isOccupied ? "Optaget" : "Ledig";
        const detail=existing ? existing.name : "Ingen ret planlagt";
        const button=el(`
          <button class="day-choice ${isCurrent?"current":isOccupied?"occupied":"open"}" type="button" ${isCurrent||isOccupied?"disabled":""}>
            <span><b>${dayChoiceLabel(d,i)}</b><small>${escape(detail)}</small></span>
            <span class="state">${state}</span>
          </button>`);
        if(!isCurrent && !isOccupied){
          button.addEventListener("click",async e=>{
            e.currentTarget.disabled=true;
            try{
              await store.movePlan(fromISO,di,plan);
              weekStart=mondayOf(d);
              await store.loadWeek();
              closeSheet();
              currentView="plan";
              render();
              toast(plan.name+" flyttet til "+WD_LONG[i]);
            }catch(error){
              e.currentTarget.disabled=false;
              reportError(error,"Kunne ikke flytte retten");
            }
          });
        }
        choices.append(button);
      }
    }catch(error){
      if(request!==moveRequest) return;
      choices.innerHTML=`<div class="empty-note warn">Ugen kunne ikke hentes.</div>`;
      reportError(error,"Kunne ikke hente ugen");
    }finally{
      if(request===moveRequest){
        prev.disabled=false;
        next.disabled=false;
      }
    }
  }

  prev.addEventListener("click",()=>{
    moveWeekStart=addDays(moveWeekStart,-7);
    renderMoveWeek();
  });
  next.addEventListener("click",()=>{
    moveWeekStart=addDays(moveWeekStart,7);
    renderMoveWeek();
  });
  renderMoveWeek();
  showSheet();
}

/* vælg dag når man trykker på en ret i biblioteket */
function openDayPicker(dish){
  const sheet=$("#sheet");
  sheet.innerHTML=`<div class="grabber"></div>
    <h2>${escape(dish.name)}</h2><p class="sub">På hvilken dag?</p>
    <div class="day-picker" id="dayChoices"></div>`;
  const choices=sheet.querySelector("#dayChoices");
  for(let i=0;i<7;i++){
    const d=addDays(weekStart,i), di=iso(d);
    const existing=store.getPlan(di);
    const button=el(`
      <button class="day-choice ${existing?"occupied":"open"}" type="button" ${existing?"disabled":""}>
        <span><b>${dayChoiceLabel(d,i)}</b><small>${existing?escape(existing.name):"Ingen ret planlagt"}</small></span>
        <span class="state">${existing?"Optaget":"Ledig"}</span>
      </button>`);
    if(!existing){
      button.addEventListener("click",async e=>{
        e.currentTarget.disabled=true;
        try{
          await store.setPlan(di,{name:dish.name, dishId:dish.id, cook:"", notes:"", done:0});
          closeSheet(); currentView="plan"; render(); toast(dish.name+" sat på "+WD_LONG[i]);
        }catch(error){
          e.currentTarget.disabled=false; reportError(error);
        }
      });
    }
    choices.append(button);
  }
  showSheet();
}

/* ---------------- godkendte enheder ---------------- */
async function openDeviceManager(){
  const sheet=$("#sheet");
  sheet.innerHTML=`<div class="grabber"></div>
    <h2>Enhedsadministration</h2>
    <p class="sub">Hver telefon eller browser har sin egen private nøgle.</p>
    <div class="empty-note">Henter enheder …</div>`;
  showSheet();

  try{
    const status=await window.madplanAuth.refreshStatus();
    const localDevice=await window.madplanAuth.getLocalDevice();
    const canUseSetupKey=Boolean(status.setup_key_configured);
    const canRegister=status.can_register || canUseSetupKey;
    const viaLabel=status.via==="trusted_ip" ? "godkendt IP" : status.via==="device" ? "godkendt enhed" : "ukendt";
    const localName=localDevice?.name || status.device_name || (navigator.userAgent.includes("Android")?"Min Android":navigator.userAgent.includes("iPhone")?"Min iPhone":"Min enhed");
    const localId=localDevice?.id ? localDevice.id.slice(0,8) : "ingen lokal nøgle";

    sheet.innerHTML=`<div class="grabber"></div>
      <h2>Enhedsadministration</h2>
      <p class="sub">Styr hvilke telefoner og browsere der må bruge madplanen uden fast IP.</p>
      <div class="admin-status">
        <b>Adgang lige nu: ${escape(viaLabel)}</b>
        <small>${status.current_ip?`Cloudflare ser IP: ${escape(status.current_ip)}`:"Ingen IP vist"} · lokal nøgle: ${escape(localId)}</small>
      </div>
      <div class="device-entry">
        <div class="device-info">
          <b>${escape(localName)}</b>
          <small>${localDevice?.id?"Denne browser har en gemt privatnøgle.":"Denne browser har ingen lokal enhedsnøgle."}</small>
        </div>
      </div>
      <div class="admin-actions">
        <button class="mini-quiet" id="logoutHere">Log ud her</button>
        <button class="mini-danger" id="forgetHere">Glem denne browser</button>
      </div>
      ${canRegister?`
        <div class="field">
          <label>Navn på denne browser</label>
          <input id="deviceName" maxlength="60" value="${escapeAttr(localName)}">
        </div>
        ${canUseSetupKey && !status.can_register?`
          <div class="field">
            <label>Opsætningskode</label>
            <input id="deviceSetupKey" type="password" autocomplete="current-password">
          </div>
        `:""}
        <button class="btn block" id="registerDevice">${localDevice?"Erstat lokal nøgle":"Godkend denne browser"}</button>
        <p class="eyebrow">Aktive enheder</p>
        <div class="device-list" id="deviceList"></div>
        ${canUseSetupKey && !status.can_register?`<button class="btn ghost block" id="loadDevices" style="margin-top:8px">Vis aktive enheder</button>`:""}
      `:`
        <div class="empty-note">Aktiv enhedsliste kræver godkendt IP eller opsætningskode.</div>
      `}`;

    const setupKey=()=>sheet.querySelector("#deviceSetupKey")?.value || "";
    const showDeviceMessage=(message,warning=false)=>{
      const list=sheet.querySelector("#deviceList");
      if(list) list.innerHTML=`<div class="empty-note ${warning?"warn":""}">${escape(message)}</div>`;
    };
    const renderDeviceList=async(devices)=>{
      const list=sheet.querySelector("#deviceList");
      list.innerHTML="";
      if(!devices.length){
        list.innerHTML=`<div class="empty-note">Ingen registrerede enheder endnu.</div>`;
      }
      devices.forEach(device=>{
        const current=device.id===localDevice?.id;
        const row=el(`<div class="device-entry">
          <div class="device-info">
            <b>${escape(device.name)}${current?" · denne browser":""}</b>
            <small>${device.last_used_at?"Senest brugt "+escape(device.last_used_at):"Ikke brugt uden for hjemmet endnu"} · oprettet ${escape(device.created_at || "")}</small>
          </div>
          <button class="mini-danger">Fjern</button>
        </div>`);
        row.querySelector("button").addEventListener("click",async e=>{
          e.currentTarget.disabled=true;
          try{
            await window.madplanAuth.revokeDevice(device.id,setupKey());
            toast("Enheden er fjernet");
            if(current) location.reload();
            else openDeviceManager();
          }catch(error){
            e.currentTarget.disabled=false;
            reportError(error,"Kunne ikke fjerne enheden");
          }
        });
        list.append(row);
      });
    };

    if(canRegister){
      if(status.can_register){
        await renderDeviceList(await window.madplanAuth.listDevices());
      }else{
        showDeviceMessage(`Indtast opsætningskoden og tryk "Vis aktive enheder" for at administrere listen.`);
        sheet.querySelector("#deviceSetupKey")?.addEventListener("keydown",e=>{
          if(e.key==="Enter") sheet.querySelector("#loadDevices")?.click();
        });
        sheet.querySelector("#loadDevices")?.addEventListener("click",async e=>{
          const key=setupKey().trim();
          if(!key){
            showDeviceMessage("Indtast opsætningskoden først.",true);
            sheet.querySelector("#deviceSetupKey")?.focus();
            return;
          }

          const button=e.currentTarget;
          button.disabled=true;
          button.textContent="Henter …";
          showDeviceMessage("Henter aktive enheder …");
          try{
            await renderDeviceList(await window.madplanAuth.listDevices(key));
            button.textContent="Opdater aktive enheder";
          }catch(error){
            showDeviceMessage(error.message || "Opsætningskoden blev afvist.",true);
            reportError(error,"Kunne ikke hente enhederne");
          }finally{
            button.disabled=false;
            if(button.textContent==="Henter …") button.textContent="Vis aktive enheder";
          }
        });
      }

      sheet.querySelector("#registerDevice").addEventListener("click",async e=>{
        const name=sheet.querySelector("#deviceName").value.trim();
        if(!name) return;
        e.currentTarget.disabled=true;
        try{
          await window.madplanAuth.registerDevice(name,setupKey());
          toast("Enheden er godkendt");
          openDeviceManager();
        }catch(error){
          e.currentTarget.disabled=false;
          reportError(error,"Kunne ikke godkende enheden");
        }
      });
    }

    sheet.querySelector("#logoutHere")?.addEventListener("click",async e=>{
      e.currentTarget.disabled=true;
      try{
        await window.madplanAuth.logout();
        location.reload();
      }catch(error){
        e.currentTarget.disabled=false;
        reportError(error,"Kunne ikke logge ud");
      }
    });

    sheet.querySelector("#forgetHere")?.addEventListener("click",async e=>{
      if(!confirm("Vil du fjerne den lokale enhedsnøgle fra denne browser? Du skal godkende browseren igen bagefter.")) return;
      e.currentTarget.disabled=true;
      try{
        await window.madplanAuth.logout({forget:true});
        location.reload();
      }catch(error){
        e.currentTarget.disabled=false;
        reportError(error,"Kunne ikke glemme browseren");
      }
    });
  }catch(error){
    sheet.innerHTML=`<div class="grabber"></div>
      <h2>Enhedsadministration</h2>
      <div class="empty-note">${escape(error.message || "Enhederne kunne ikke hentes")}</div>`;
  }
}

function showSheet(){ $("#overlay").classList.add("open"); requestAnimationFrame(()=>$("#sheet").classList.add("open")); }
function closeSheet(){ $("#sheet").classList.remove("open"); $("#overlay").classList.remove("open"); }

/* ---------------- små utils ---------------- */
function escape(s){ return String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }
function escapeAttr(s){ return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;"); }

/* ---------------- events ---------------- */
$("#overlay").addEventListener("click",closeSheet);
$("#deviceButton").addEventListener("click",openDeviceManager);
async function changeWeek(days){
  const previous=weekStart;
  weekStart=addDays(weekStart,days);
  try{
    await store.loadWeek(); render();
  }catch(error){
    weekStart=previous; render(); reportError(error,"Kunne ikke hente ugen");
  }
}
$("#prevWeek").addEventListener("click",()=>changeWeek(-7));
$("#nextWeek").addEventListener("click",()=>changeWeek(7));
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",async()=>{
  currentView=b.dataset.view;
  render();
  try{
    await store.loadView(currentView); render();
  }catch(error){
    reportError(error,"Kunne ikke hente data");
  }
}));

/* ---------------- start ---------------- */
render();
window.madplanAuth.ensureAccess().then(allowed=>{
  if(!allowed) return;
  store.init().then(render).catch(error=>reportError(error,"Kunne ikke hente data"));
});

/* registrér service worker (kun når siden serveres over http/https) */
if("serviceWorker" in navigator && location.protocol.startsWith("http")){
  window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
}
