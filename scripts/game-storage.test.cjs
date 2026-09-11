const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "../js/game-storage.js"), "utf8");
function setup(storage) {
  const notices = [];
  const sandbox = {
    document: {
      createElement: () => ({ style: {}, setAttribute() {}, remove() {} }),
      body: { append: element => notices.push(element) }
    },
    setTimeout() {}
  };
  Object.defineProperty(sandbox, "localStorage", { get: storage });
  vm.runInNewContext(source, sandbox);
  return { store: sandbox.WutborgGameStorage, notices };
}
const blocked = setup(() => { throw new Error("SecurityError"); });
assert.equal(blocked.store.getItem("record"), null);
blocked.store.setItem("record", 99);
assert.equal(blocked.store.getItem("record"), "99");
blocked.store.setItem("theme", "neon");
assert.equal(blocked.notices.length, 1, "Vis kun én besked pr. side");
const full = setup(() => ({ getItem: () => "30", setItem() { throw new Error("QuotaExceededError"); } }));
assert.equal(full.store.getItem("record"), "30");
full.store.setItem("record", 80);
assert.equal(full.store.getItem("record"), "80", "Bevar den nye rekord i hukommelsen");
assert.equal(full.notices.length, 1);
const saved = new Map();
const normal = setup(() => ({ getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) }));
normal.store.setItem("record", 120);
assert.equal(saved.get("record"), "120");
assert.equal(normal.notices.length, 0);
console.log("Spillager: blokeret lager, fuldt lager og normal lagring bestået.");
