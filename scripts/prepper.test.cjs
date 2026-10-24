const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = file => fs.readFileSync(path.join(root, file), "utf8");
const moduleUrl = code => "data:text/javascript;base64," + Buffer.from(code).toString("base64");

(async () => {
  const helpers = moduleUrl(source("functions/api/_helpers.js"));
  const fieldsUrl = moduleUrl(source("functions/api/prepper/_fields.js").replace('"../_helpers.js"', JSON.stringify(helpers)));
  const loadRoute = file => import(moduleUrl(source(file)
    .replace('"../_helpers.js"', JSON.stringify(helpers))
    .replace('"./_fields.js"', JSON.stringify(fieldsUrl))));
  const collection = await loadRoute("functions/api/prepper/index.js");
  const detail = await loadRoute("functions/api/prepper/[id].js");
  const { quantity } = await import(fieldsUrl);
  const authUrl = moduleUrl(source("functions/api/_auth.js").replace('"./_helpers.js"', JSON.stringify(helpers)));
  const middleware = await import(moduleUrl(source("functions/api/_middleware.js").replace('"./_auth.js"', JSON.stringify(authUrl))));
  const database = new DatabaseSync(":memory:");
  database.exec(source("migrations/0007_prepper.sql"));
  database.exec(source("migrations/0008_prepper_checks.sql"));
  // Exercise the handlers' actual SQL through a minimal D1-shaped SQLite adapter.
  const DB = { prepare(sql) {
    const statement = database.prepare(sql);
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async all() { return { results: statement.all(...args) }; },
      async first() { return statement.get(...args) || null; },
      async run() {
        const result = statement.run(...args);
        return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      },
    };
  } };
  const invoke = (handler, method = "GET", body, id = 1) => handler({
    env: { DB }, params: { id: String(id) },
    request: new Request("http://localhost/api/prepper/" + id, {
      method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    }),
  });
  const list = async () => (await invoke(collection.onRequestGet)).json();
  let passedGate = false;
  const blocked = await middleware.onRequest({
    request: new Request("https://wutborg.dk/api/prepper"), env: { DB }, data: {},
    next() { passedGate = true; return new Response("unexpected"); },
  });
  assert.equal(blocked.status, 401);
  assert.equal(passedGate, false);
  const local = await middleware.onRequest({
    request: new Request("http://localhost/api/prepper"), env: { DB }, data: {},
    next() { return invoke(collection.onRequestGet); },
  });
  assert.equal(local.status, 200);
  const patch = (id, body) => invoke(detail.onRequestPatch, "PATCH", body, id);
  let rows = await list();
  assert.equal(rows.length, 36);
  assert(rows.every(row => row.amount === null && row.is_ready === 0));
  assert.equal(rows.filter(row => row.category === "Mad").length, 12);
  const water = rows.find(row => row.name === "Drikkevand");
  const power = rows.find(row => row.name === "Powerbank");
  assert.equal(water.target_amount, 100);
  assert.equal(power.check_label, "Opladet");
  assert.equal(power.review_days, 90);
  assert.equal(rows.find(row => row.name === "Kontanter").target_amount, 2000);
  assert.equal((await patch(water.id, { amount: "100" })).status, 200);
  assert.equal((await list()).find(row => row.id === water.id).is_ready, 0);
  await patch(power.id, { is_ready: true });
  const checked = (await list()).find(row => row.id === power.id).checked_at;
  assert(checked);
  await patch(power.id, { amount: 2 });
  rows = await list();
  assert.equal(rows.find(row => row.id === power.id).is_ready, 1);
  assert.equal(rows.find(row => row.id === power.id).amount, 2);
  assert.equal(rows.find(row => row.id === power.id).checked_at, checked);
  await patch(power.id, { is_ready: false });
  assert.equal((await list()).find(row => row.id === power.id).checked_at, null);
  const oldCheck = "2025-01-01 12:00:00";
  database.prepare("UPDATE prepper_items SET checked_at = ?, is_ready = 1 WHERE id = ?").run(oldCheck, power.id);
  const rechecked = await (await patch(power.id, { is_ready: true })).json();
  assert.notEqual(rechecked.checked_at, oldCheck);
  assert.equal(rechecked.is_ready, 1);
  await patch(water.id, { location:"Kælderen", expires_on:"2027-02-28", review_days:30 });
  assert.equal((await list()).find(row => row.id === water.id).location, "Kælderen");
  for (const expires_on of ["2027-02-29", "24/10/2027", "bad", 10, true]) {
    assert.equal((await patch(water.id, { expires_on })).status, 400);
  }
  for (const review_days of [0, -1, 1.5, 3651, true, "90"]) {
    assert.equal((await patch(water.id, { review_days })).status, 400);
  }
  await patch(water.id, { expires_on:null, review_days:null });
  assert.equal((await list()).find(row => row.id === water.id).expires_on, null);
  await patch(water.id, { amount: "12,5" });
  assert.equal((await list()).find(row => row.id === water.id).amount, 12.5);
  await patch(water.id, { amount: 0 });
  assert.equal((await list()).find(row => row.id === water.id).amount, 0);
  await patch(water.id, { amount: null });
  assert.equal((await list()).find(row => row.id === water.id).amount, null);
  for (const amount of [-1, "Infinity", "NaN", "1e3", true, [], {}, "0.001", "1000001", " "]) {
    assert.equal((await patch(water.id, { amount })).status, 400, "Reject " + JSON.stringify(amount));
  }
  assert.equal(quantity("1000000"), 1000000);
  assert.equal((await patch(water.id, { is_ready: "maybe" })).status, 400);
  assert.equal((await patch(water.id, { category: "Ukendt" })).status, 400);
  assert.equal((await patch(water.id, { name: " " })).status, 400);
  assert.equal((await patch(water.id, { injected_column: 1 })).status, 400);
  assert.equal((await patch(99999, { amount: 1 })).status, 404);
  const created = await invoke(collection.onRequestPost, "POST", {
    name: "Testvand <b>", category: "Vand", amount: 1.25, unit: "liter", target_amount: 2,
  });
  assert.equal(created.status, 201);
  const newItem = await created.json();
  assert.equal(newItem.amount, 1.25);
  assert.equal(newItem.is_ready, 0);
  assert.equal((await list()).length, 37);
  assert.equal((await invoke(detail.onRequestDelete, "DELETE", undefined, newItem.id)).status, 200);
  assert.equal((await invoke(detail.onRequestDelete, "DELETE", undefined, newItem.id)).status, 404);
  assert.equal((await list()).length, 36);
  const context = vm.createContext({ Intl, Date });
  vm.runInContext(source("madplan/prepper-model.js") + ";globalThis.model = PrepperModel", context);
  const model = context.model;
  const base = { amount:100, target_amount:100, unit:"liter", category:"Vand", is_ready:1, checked_at:null, review_days:null, expires_on:null };
  assert.equal(model.status(base,"2026-10-24").ready, true);
  assert.equal(model.status({ ...base, amount:60 },"2026-10-24").reason, "Mangler 40 liter");
  assert.equal(model.status({ ...base, amount:60 },"2026-10-24").ready, false);
  assert.equal(model.status({ ...base, amount:null },"2026-10-24").uncounted, true);
  assert.equal(model.status({ ...base, amount:0, target_amount:null },"2026-10-24").ready, false);
  assert.equal(model.status({ ...base, is_ready:0 },"2026-10-24").ready, false);
  assert.equal(model.status({ ...base, expires_on:"2026-10-23" },"2026-10-24").datePassed, true);
  assert.equal(model.status({ ...base, expires_on:"2026-10-24" },"2026-10-24").dateSoon, true);
  assert.equal(model.status({ ...base, expires_on:"2026-11-23" },"2026-10-24").dateSoon, true);
  assert.equal(model.status({ ...base, expires_on:"2026-11-24" },"2026-10-24").dateSoon, false);
  const leapCheck = model.status({ ...base, checked_at:"2028-02-28 23:59:00", review_days:1 }, "2028-02-29");
  assert.equal(leapCheck.nextCheck, "2028-02-29");
  assert.equal(leapCheck.overdue, true);
  assert.equal(model.status({ ...base, checked_at:"2026-10-24", review_days:90 }, "2027-01-21").overdue, false);
  assert.equal(model.status({ ...base, checked_at:"2026-10-24", review_days:90 }, "2027-01-22").overdue, true);
  const sums = model.summary([{ ...base, amount:40 }, { ...base, amount:null }, { ...base, category:"Mad", amount:90 }], "2026-10-24");
  assert.equal(sums.waterAmount, 40);
  assert.equal(sums.waterTarget, 200);
  assert.equal(sums.waterUncounted, 1);
  assert.equal(model.quantity(1,"pakker"),"1 pakke");
  assert.equal(model.quantity(2.5,"kg"),"2,5 kg");
  database.close();
  console.log("Prepper: access, migrations, CRUD, stock gaps, dates, leap days, rechecks, quantity units and concurrent field preservation passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
