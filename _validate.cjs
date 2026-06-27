// Validerer syntaksen af alle ændrede filer fra opgave C, D og E.
const fs = require("fs");
const { execSync } = require("child_process");
const path = require("path");
const os = require("os");

const ROOT = "c:/wutborg-side/wutborg-side";
const TMP = path.join(os.tmpdir(), "madplan_validate");
fs.mkdirSync(TMP, { recursive: true });
let pass = 0, fail = 0;

function checkModule(rel, label) {
  const full = path.join(ROOT, rel);
  try {
    const code = fs.readFileSync(full, "utf8");
    const tmpFile = path.join(TMP, path.basename(rel).replace(/\.js$/, ".mjs"));
    fs.writeFileSync(tmpFile, code);
    // node --check forstår .mjs som ES-modul
    execSync(`node --check "${tmpFile}"`, { stdio: "pipe", timeout: 15000 });
    console.log(`  OK   ${label}`);
    pass++;
  } catch (err) {
    const msg = err.stderr ? err.stderr.toString().trim().split("\n").pop() : err.message;
    console.log(`  FAIL ${label}  (${rel})`);
    console.log(`       ${msg}`);
    fail++;
  }
}

function checkHtmlScript(rel, label) {
  const full = path.join(ROOT, rel);
  try {
    const html = fs.readFileSync(full, "utf8");
    const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
    if (!blocks.length) {
      console.log(`  WARN ${label} — ingen inline <script> fundet`);
      return;
    }
    blocks.forEach((m, i) => {
      const tmpFile = path.join(TMP, `html_script_${i}.js`);
      fs.writeFileSync(tmpFile, m[1]);
      try {
        execSync(`node --check "${tmpFile}"`, { stdio: "pipe", timeout: 15000 });
        console.log(`  OK   ${label}  (script #${i}, ${m[1].length} tegn)`);
        pass++;
      } catch (err) {
        const stderr = err.stderr ? err.stderr.toString().trim() : "";
        const lines = stderr.split("\n").filter(l => l.trim());
        const msg = lines.length ? lines.slice(0, 3).join(" | ") : err.message;
        console.log(`  FAIL ${label}  (script #${i})`);
        console.log(`       ${msg}`);
        fail++;
      }
    });
  } catch (err) {
    console.log(`  FAIL ${label} — kunne ikke læse: ${err.message}`);
    fail++;
  }
}

console.log("\n=== Syntakstjek af server-funktioner (ES-moduler) ===");
checkModule("functions/api/_helpers.js", "helpers (konsolideret fryser-logik) [E]");
checkModule("functions/api/freezer/index.js", "freezer GET/POST/DELETE [E]");
checkModule("functions/api/freezer/[id].js", "freezer PATCH/DELETE :id [E]");
checkModule("functions/api/shopping/index.js", "shopping GET/POST/DELETE");
checkModule("functions/api/shopping/[id].js", "shopping PATCH/DELETE :id [C]");
checkModule("functions/api/plan/index.js", "plan GET");
checkModule("functions/api/plan/[date].js", "plan PUT/DELETE [D]");
checkModule("functions/api/dishes/index.js", "dishes GET/POST");
checkModule("functions/api/dishes/[id].js", "dishes PATCH/DELETE [D]");

console.log("\n=== Syntakstjek af klient-JS (inline i index.html) [C+D+E] ===");
checkHtmlScript("madplan/index.html", "madplan klient");

console.log("\n=== Tjek af migrationer ===");
const mig = fs.readFileSync(path.join(ROOT, "migrations/0005_drop_freezer_quantity.sql"), "utf8");
const checks = [
  [/DROP TABLE freezer_items/, "DROP TABLE"],
  [/RENAME TO freezer_items/, "RENAME TO"],
  [/SET amount = 1/, "backfill amount=1"],
  [/ix_freezer_drawer_sort/, "genskab index"],
];
checks.forEach(([re, name]) => {
  const ok = re.test(mig);
  console.log(`  ${ok?"OK ":"FAIL"} migration 0005: ${name}`);
  pass += ok; fail += !ok;
});

console.log(`\n=== Resultat: ${pass} OK, ${fail} FEJL ===\n`);
process.exit(fail ? 1 : 0);

