/* Shared shell and device authentication; inventory remains in the family DB. */
const Prepper = (() => {
  const categories = ["Vand", "Mad", "Strøm og lys", "Varme", "Hygiejne", "Sundhed", "Praktisk"];
  const model = PrepperModel;
  let items = [], loaded = false, query = "", filter = "all", category = "", loadError = false;
  let lastSync = null, loading = false, revision = 0;
  const busy = new Set();
  const pendingChecks = new Map();
  const buying = new Set();
  const q = (amount, unit) => model.quantity(amount, unit);
  const esc = value => escape(value);
  const attr = value => escapeAttr(value);

  async function load() {
    if (loading || busy.size) return;
    loading = true;
    const startedAt = revision;
    try {
      const rows = await jget("/prepper");
      if (startedAt !== revision) return;
      items = rows;
      loaded = true;
      lastSync = new Date();
      loadError = false;
    } catch (error) {
      loadError = true;
      throw error;
    } finally { loading = false; }
  }

  function applyFilter(root = document.querySelector("#view")) {
    let visible = 0;
    const search = query.trim().toLocaleLowerCase("da");
    for (const section of root.querySelectorAll(".prepper-group")) {
      let count = 0;
      for (const row of section.querySelectorAll(".prepper-item")) {
        row.hidden = (category && section.dataset.category !== category) || !row.dataset.search.includes(search) ||
          (filter === "ready" && row.dataset.ready !== "1") ||
          (filter === "missing" && row.dataset.ready === "1") ||
          (filter === "attention" && row.dataset.attention !== "1");
        if (!row.hidden) count++;
      }
      section.hidden = !count;
      visible += count;
    }
    const empty = root.querySelector(".prepper-empty");
    if (empty) empty.hidden = visible > 0;
    const count = root.querySelector("#prepperVisible");
    if (count) count.textContent = `${visible} af ${items.length} poster`;
    root.querySelectorAll("[data-prepper-filter]").forEach(button => {
      const selected = button.dataset.prepperFilter === filter;
      button.classList.toggle("sel", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  async function refresh(button) {
    if (button) button.disabled = true;
    try { await load(); }
    catch (error) { reportError(error, "Kunne ikke opdatere listen. Prøv igen, når forbindelsen er tilbage."); }
    if (currentView === "prepper") render();
  }

  function renderList() {
    const root = el('<div class="prepper"></div>');
    if (!loaded) {
      root.innerHTML = `<section class="prepper-empty"><h2>Prepper</h2><p>${loadError ? "Listen kunne ikke hentes. Kontrollér forbindelsen, og prøv igen." : "Henter jeres liste …"}</p><button class="btn" type="button">Hent listen</button></section>`;
      root.querySelector("button").addEventListener("click", event => refresh(event.currentTarget));
      return [root];
    }
    const total = model.summary(items);
    const waterNote = total.waterTarget == null ? "Vand på lager" : `Vand · mål: ${q(total.waterTarget, "liter")}`;
    root.innerHTML = `
      <section class="prepper-hero">
        <span class="prepper-eyebrow">Familiens beredskab</span>
        <h1>Godt at have styr på.</h1>
        <p>Det, vi har. Det, vi mangler. Det, vi skal tjekke.</p>
        <div class="prepper-progress-text"><b>${total.ready} af ${items.length} klar</b><span>${items.length ? Math.round(total.ready / items.length * 100) : 0} %</span></div>
        <progress max="${items.length || 1}" value="${total.ready}" aria-label="Klargjorte poster"></progress>
        <div class="prepper-stats">
          <div><b>${esc(q(total.waterAmount, "liter"))}</b><span>${esc(waterNote)}</span>${total.waterUncounted && total.waterAmount != null ? '<small>Noget vand er endnu ikke optalt</small>' : ""}</div>
          <button type="button" data-prepper-filter="missing"><b>${items.length - total.ready}</b><span>Mangler at blive klar</span></button>
          <button type="button" data-prepper-filter="attention"><b>${total.attention}</b><span>Datoer til tjek</span></button>
        </div>
      </section>
      <div class="prepper-toolbar"><h2>Vores liste</h2><button class="btn" id="prepperAdd" type="button">+ Tilføj</button></div>
      <p class="prepper-help">Ret antal med − og +, eller tryk på tallet. Navnet åbner alle detaljer.</p>
      <div class="prepper-searchbar"><input type="search" id="prepperSearch" aria-label="Søg i Prepper" placeholder="Søg efter navn, placering eller note …" value="${attr(query)}"><select id="prepperCategoryFilter" aria-label="Filtrér kategori"><option value="">Alle kategorier</option>${categories.map(value => `<option${value === category ? " selected" : ""}>${esc(value)}</option>`).join("")}</select></div>
      <div class="chips prepper-filters" role="group" aria-label="Vis poster">
        <button type="button" class="chip" data-prepper-filter="all">Alle</button>
        <button type="button" class="chip" data-prepper-filter="missing">Mangler</button>
        <button type="button" class="chip" data-prepper-filter="ready">Klar</button>
        <button type="button" class="chip" data-prepper-filter="attention">Tjek datoer</button>
      </div>
      <div class="prepper-list-meta"><span id="prepperVisible" role="status"></span><span>${lastSync ? "Opdateret kl. " + lastSync.toLocaleTimeString("da-DK", { hour:"2-digit", minute:"2-digit" }) : ""}</span></div>
      ${loadError ? '<p class="prepper-warning" role="status">Opdateringen mislykkedes. Du ser den senest hentede liste.</p>' : ""}
      <div class="prepper-groups"></div>
      <p class="prepper-empty" hidden>Ingen poster matcher. Vælg Alle, skift kategori, eller ryd søgningen.</p>
      <div class="prepper-tools"><button type="button" id="prepperRefresh">↻ Opdatér</button><button type="button" id="prepperPrint">Print liste</button><button type="button" id="prepperExport">Hent som CSV</button></div>
      <p class="prepper-footnote">En post er klar, når fluebenet er sat, et eventuelt mængdemål er nået, og ingen kontroldato er passeret. “Ikke optalt” og 0 er forskellige ting.</p>`;
    root.querySelector("#prepperAdd").addEventListener("click", () => edit());
    root.querySelector("#prepperSearch").addEventListener("input", event => { query = event.currentTarget.value; applyFilter(root); });
    root.querySelector("#prepperCategoryFilter").addEventListener("change", event => { category = event.currentTarget.value; applyFilter(root); });
    root.querySelectorAll("[data-prepper-filter]").forEach(button => button.addEventListener("click", () => { filter = button.dataset.prepperFilter; applyFilter(root); }));
    root.querySelector("#prepperRefresh").addEventListener("click", event => refresh(event.currentTarget));
    root.querySelector("#prepperPrint").addEventListener("click", () => window.print());
    root.querySelector("#prepperExport").addEventListener("click", exportList);
    for (const group of categories) {
      const groupItems = items.filter(item => item.category === group);
      if (!groupItems.length) continue;
      const section = el(`<section class="prepper-group"><div class="prepper-group-head"><h3>${esc(group)}</h3><span>${groupItems.filter(item => model.status(item).ready).length} / ${groupItems.length} klar</span></div><div class="prepper-rows"></div></section>`);
      section.dataset.category = group;
      groupItems.forEach(item => section.querySelector(".prepper-rows").append(renderItem(item)));
      root.querySelector(".prepper-groups").append(section);
    }
    applyFilter(root);
    return [root];
  }

  function renderItem(item) {
    const state = model.status(item);
    const pending = busy.has(item.id);
    const next = state.nextCheck ? `Kontrollér igen ${model.dateLabel(state.nextCheck)}` : "";
    const date = item.expires_on ? `Nærmeste dato: ${model.dateLabel(item.expires_on)}` : "";
    const row = el(`<article class="prepper-item${state.ready ? " is-ready" : ""}${state.attention ? " needs-attention" : ""}" data-item-id="${item.id}">
      <button class="prepper-edit" type="button" data-action="edit" aria-label="Rediger ${attr(item.name)}"><b>${esc(item.name)}</b>${item.location ? `<small class="prepper-location">${esc(item.location)}</small>` : ""}${item.notes ? `<small class="prepper-note">${esc(item.notes)}</small>` : ""}</button>
      <label class="prepper-check"><input type="checkbox" data-action="check" ${(pendingChecks.get(item.id) ?? item.is_ready) ? "checked" : ""} ${pending ? "disabled" : ""} aria-label="${attr(item.name + ': ' + item.check_label)}"><span>${esc(item.check_label)}</span></label>
      <div class="prepper-stockline"><div class="prepper-stepper" role="group" aria-label="Antal ${attr(item.name)}">
        <button type="button" data-action="minus" ${pending || item.amount == null || item.amount <= 0 ? "disabled" : ""} aria-label="Træk 1 fra ${attr(item.name)}">−</button>
        <button type="button" data-action="amount" class="prepper-amount" aria-label="Ret antal for ${attr(item.name)}: ${attr(q(item.amount, item.unit))}">${esc(q(item.amount, item.unit))}</button>
        <button type="button" data-action="plus" ${pending || item.amount >= 1000000 ? "disabled" : ""} aria-label="Læg 1 til ${attr(item.name)}">+</button>
      </div>${item.target_amount == null ? "" : `<span class="prepper-target">Mål: ${esc(q(item.target_amount, item.unit))}</span>`}</div>
      <div class="prepper-status ${state.ready ? "ready" : state.attention ? "attention" : "missing"}"><span>${pending ? "Gemmer …" : esc(state.reason)}</span>${state.dateSoon ? '<span class="prepper-date-soon">Dato inden for 30 dage</span>' : ""}${state.missing > 0 && !/^(kr\.?|dkk)$/i.test(item.unit.trim()) ? `<button type="button" class="prepper-buy" data-action="buy" ${pending || buying.has(item.id) ? "disabled" : ""} aria-label="Føj ${attr(q(state.missing, item.unit))} ${attr(item.name)} til indkøb">Til indkøb</button>` : ""}</div>
      ${date || next ? `<p class="prepper-dates">${esc([date, next].filter(Boolean).join(" · "))}</p>` : ""}
      ${state.overdue && item.is_ready ? `<button type="button" class="prepper-recheck" data-action="recheck" ${pending ? "disabled" : ""}>${esc(item.check_label)} igen i dag</button>` : ""}
    </article>`);
    row.dataset.search = `${item.name} ${item.category} ${item.location} ${item.notes}`.toLocaleLowerCase("da");
    row.dataset.ready = state.ready ? "1" : "0";
    row.dataset.attention = state.attention ? "1" : "0";
    row.querySelector('[data-action="edit"]').addEventListener("click", () => edit(item));
    row.querySelector('[data-action="amount"]').addEventListener("click", () => edit(item, true));
    row.querySelector('[data-action="minus"]').addEventListener("click", () => mutate(item, { amount: Math.max(0, Math.round((item.amount - 1) * 100) / 100) }, "minus"));
    row.querySelector('[data-action="plus"]').addEventListener("click", () => mutate(item, { amount: Math.min(1000000, Math.round(((item.amount || 0) + 1) * 100) / 100) }, "plus"));
    row.querySelector('[data-action="check"]').addEventListener("change", event => mutate(item, { is_ready: event.currentTarget.checked ? 1 : 0 }, "check"));
    row.querySelector('[data-action="recheck"]')?.addEventListener("click", () => mutate(item, { is_ready: 1 }, "recheck"));
    row.querySelector('[data-action="buy"]')?.addEventListener("click", async event => {
      if (buying.has(item.id)) return;
      buying.add(item.id);
      const button = event.currentTarget;
      button.disabled = true;
      const name = `${item.name} (Prepper)`;
      let added = false;
      try {
        await store.loadView("shopping");
        if (store.getShopping().some(row => !row.done && row.name.toLocaleLowerCase("da") === name.toLocaleLowerCase("da"))) {
          toast("Findes allerede på indkøbslisten");
        } else {
          await store.addShop(name, q(state.missing, item.unit));
          toast("Den manglende mængde er lagt på indkøbslisten");
        }
        added = true;
      } catch (error) { reportError(error, "Kunne ikke tilføje til indkøb"); }
      finally {
        buying.delete(item.id);
        const liveButton = document.querySelector(`[data-item-id="${item.id}"] [data-action="buy"]`);
        if (liveButton) { liveButton.disabled = busy.has(item.id); if (added) liveButton.textContent = "På indkøbslisten"; }
      }
    });
    return row;
  }

  function replaceItem(item) { items = items.map(row => row.id === item.id ? item : row); lastSync = new Date(); }
  async function mutate(item, patch, focusAction) {
    if (busy.has(item.id)) return;
    busy.add(item.id);
    if (Object.hasOwn(patch, "is_ready")) pendingChecks.set(item.id, patch.is_ready);
    revision++;
    render();
    try {
      replaceItem(await jsend("PATCH", "/prepper/" + item.id, patch));
    } catch (error) { reportError(error, "Ændringen blev ikke gemt. Prøv igen."); }
    finally {
      busy.delete(item.id);
      pendingChecks.delete(item.id);
      if (currentView === "prepper") {
        const active = document.activeElement;
        const searchSelection = active?.id === "prepperSearch" ? [active.selectionStart, active.selectionEnd] : null;
        const restoreFocus = document.activeElement === document.body || document.activeElement?.closest(`[data-item-id="${item.id}"]`);
        render();
        if (searchSelection) {
          const input = document.querySelector("#prepperSearch");
          input.focus({ preventScroll:true }); input.setSelectionRange(...searchSelection);
        } else if (active?.id === "prepperCategoryFilter") document.querySelector("#prepperCategoryFilter")?.focus({ preventScroll:true });
        else if (restoreFocus && !document.querySelector("#sheet").classList.contains("open")) document.querySelector(`[data-item-id="${item.id}"] [data-action="${focusAction}"]`)?.focus({ preventScroll:true });
      }
    }
  }

  function parseAmount(input) {
    const value = input.value.trim().replace(",", ".");
    input.setCustomValidity("");
    if (!value) return null;
    if (!/^\d+(\.\d{1,2})?$/.test(value) || Number(value) > 1000000) {
      input.setCustomValidity("Skriv et antal mellem 0 og 1.000.000 med højst to decimaler.");
      input.reportValidity();
      return NaN;
    }
    return Number(value);
  }

  function edit(item = null, focusAmount = false) {
    if (item && busy.has(item.id)) return;
    const draft = item ? { ...item } : { name:"", category:category || "Praktisk", amount:null, target_amount:null, unit:"stk.", check_label:"Klargjort", is_ready:0, notes:"", location:"", expires_on:null, review_days:null };
    const sheet = document.querySelector("#sheet");
    const input = (id, label, extra, value) => `<div class="field"><label for="${id}">${label}</label><input id="${id}" ${extra} value="${attr(value ?? "")}"></div>`;
    sheet.innerHTML = `<div class="grabber"></div><h2>${item ? esc(item.name) : "Tilføj til Prepper"}</h2><p class="sub">Beholdning og klargøring gemmes hver for sig.</p>
      <form id="prepperForm">
        ${input("prepperName", "Navn", 'required maxlength="100" placeholder="fx Drikkevand"', draft.name)}
        <div class="field-grid">${input("prepperAmount", "Det har vi", 'inputmode="decimal" maxlength="15" placeholder="Ikke optalt"', draft.amount)}${input("prepperUnit", "Enhed", 'maxlength="30" list="prepperUnits" placeholder="fx liter"', draft.unit)}</div>
        <datalist id="prepperUnits">${["stk.","liter","kg","pakker","dåser","glas","poser","flasker","ruller","kr.","sæt","portioner"].map(unit => `<option value="${unit}"></option>`).join("")}</datalist>
        ${input("prepperTarget", "Det vil vi have klar (valgfrit)", 'inputmode="decimal" maxlength="15" placeholder="Mål i samme enhed, fx 100"', draft.target_amount)}
        <label class="prepper-sheet-check"><input id="prepperReady" type="checkbox" ${draft.is_ready ? "checked" : ""}><span>${esc(draft.check_label)}<small>Kontrolleret i dag, når du sætter fluebenet</small></span></label>
        <details class="prepper-details"><summary>Placering, datoer og flere indstillinger</summary>
          ${input("prepperLocation", "Opbevares", 'maxlength="100" placeholder="fx kælderen, reol 2"', draft.location)}
          ${input("prepperExpires", "Nærmeste bedst før- / tjekdato", 'type="date"', draft.expires_on)}
          <p class="prepper-field-help">Brug den nærmeste dato, hvis du har flere pakker. Datoen hjælper jer med at gennemgå lageret.</p>
          <div class="field"><label for="prepperReview">Kontrollér igen efter</label><select id="prepperReview"><option value="">Intet fast interval</option>${[7,14,30,60,90,180,365,...(draft.review_days && ![7,14,30,60,90,180,365].includes(draft.review_days) ? [draft.review_days] : [])].map(days => `<option value="${days}"${days === draft.review_days ? " selected" : ""}>${days} dage</option>`).join("")}</select></div>
          <p class="prepper-field-help">Dit eget tjekinterval, fx til opladning. Fluebenet bliver bevaret, men posten vises til kontrol, når tiden er gået.</p>
          <div class="field"><label for="prepperCategory">Kategori</label><select id="prepperCategory">${categories.map(value => `<option${value === draft.category ? " selected" : ""}>${esc(value)}</option>`).join("")}</select></div>
          ${input("prepperCheckLabel", "Tekst ved flueben", 'maxlength="40" placeholder="fx Opladet"', draft.check_label)}
          <div class="field"><label for="prepperNotes">Note</label><textarea id="prepperNotes" maxlength="500" rows="3" placeholder="fx pakkestørrelse eller et link">${esc(draft.notes)}</textarea></div>
          ${draft.checked_at ? `<p class="prepper-field-help">Senest markeret ${esc(model.dateLabel(draft.checked_at))}</p>` : ""}
        </details>
        <p id="prepperDraftStatus" class="prepper-draft-status" role="status"></p>
        <div class="prepper-form-actions"><button class="btn" type="button" id="prepperCancel">Annullér</button><button class="btn" type="submit">Gem post</button></div>
      </form>${item ? '<button class="link-danger" id="prepperDelete" type="button">Slet post</button>' : ""}`;
    const form = sheet.querySelector("form");
    const value = id => sheet.querySelector("#" + id).value.trim();
    const status = sheet.querySelector("#prepperDraftStatus");
    const updateDraftStatus = () => {
      const amount = value("prepperAmount").replace(",", "."), goal = value("prepperTarget").replace(",", ".");
      status.textContent = goal && Number(goal) > 0 && (!amount || Number(amount) < Number(goal)) ? (!amount ? "Tæl beholdningen op for at se, om målet er nået." : `Der mangler ${q(Math.round((Number(goal) - Number(amount)) * 100) / 100, value("prepperUnit"))} for at nå målet.`) : "";
    };
    ["prepperAmount","prepperTarget","prepperUnit"].forEach(id => sheet.querySelector("#" + id).addEventListener("input", event => { event.currentTarget.setCustomValidity(""); updateDraftStatus(); }));
    updateDraftStatus();
    sheet.querySelector("#prepperCancel").addEventListener("click", closeSheet);
    let saving = false;
    const setSaving = active => {
      saving = active;
      form.querySelectorAll("input, select, button, textarea").forEach(control => { control.disabled = active; });
      if (item) sheet.querySelector("#prepperDelete").disabled = active;
    };
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (saving) return;
      const amount = parseAmount(sheet.querySelector("#prepperAmount"));
      if (Number.isNaN(amount)) return;
      const target_amount = parseAmount(sheet.querySelector("#prepperTarget"));
      if (Number.isNaN(target_amount)) return;
      const name = value("prepperName");
      if (!name) { sheet.querySelector("#prepperName").focus(); return; }
      const data = { name, category:value("prepperCategory"), amount, target_amount, unit:value("prepperUnit"), check_label:value("prepperCheckLabel") || "Klargjort", notes:value("prepperNotes"), location:value("prepperLocation"), expires_on:value("prepperExpires") || null, review_days:value("prepperReview") ? Number(value("prepperReview")) : null, is_ready:sheet.querySelector("#prepperReady").checked ? 1 : 0 };
      const patch = item ? Object.fromEntries(Object.entries(data).filter(([key, value]) => value !== draft[key])) : data;
      setSaving(true);
      revision++;
      try {
        if (item) { if (Object.keys(patch).length) replaceItem(await jsend("PATCH", "/prepper/" + item.id, patch)); }
        else {
          const created = await jsend("POST", "/prepper", data);
          items.push(created); lastSync = new Date();
          query = ""; filter = "all"; category = created.category;
          requestAnimationFrame(() => document.querySelector(`[data-item-id="${created.id}"] [data-action="edit"]`)?.focus());
        }
        closeSheet();
        if (currentView === "prepper") render();
        toast("Prepper er opdateret");
      } catch (error) { setSaving(false); reportError(error, "Posten blev ikke gemt. Prøv igen."); }
    });
    if (item) sheet.querySelector("#prepperDelete").addEventListener("click", async event => {
      if (saving) return;
      const button = event.currentTarget;
      if (button.dataset.confirm !== "yes") { button.dataset.confirm = "yes"; button.textContent = "Tryk igen for at slette " + item.name; return; }
      setSaving(true);
      revision++;
      try {
        await jsend("DELETE", "/prepper/" + item.id);
        items = items.filter(row => row.id !== item.id);
        closeSheet();
        if (currentView === "prepper") render();
        toast("Posten er slettet");
      } catch (error) { setSaving(false); reportError(error, "Kunne ikke slette posten"); }
    });
    showSheet();
    if (focusAmount) requestAnimationFrame(() => requestAnimationFrame(() => { const field = sheet.querySelector("#prepperAmount"); field.focus(); field.select(); }));
  }

  function exportList() {
    const cell = value => '"' + (typeof value === "number" ? String(value).replace(".", ",") : String(value ?? "")).replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"','""') + '"';
    const rows = [["Kategori","Navn","Har","Enhed","Mål","Status","Flueben","Placering","Nærmeste dato","Kontrolinterval (dage)","Senest kontrolleret","Note"], ...items.map(item => [item.category,item.name,item.amount,item.unit,item.target_amount,model.status(item).reason,item.is_ready ? item.check_label : "",item.location,item.expires_on,item.review_days,item.checked_at,item.notes])];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map(row => row.map(cell).join(";")).join("\r\n")], { type:"text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `prepper-${model.today()}.csv`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function refreshWhenReturning() {
    if (currentView !== "prepper" || !loaded || busy.size || loading || document.hidden || document.querySelector("#sheet").classList.contains("open") || (lastSync && Date.now() - lastSync.getTime() < 30000)) return;
    await refresh();
  }
  window.addEventListener("focus", refreshWhenReturning);
  document.addEventListener("visibilitychange", refreshWhenReturning);
  return { load, render:renderList };
})();
