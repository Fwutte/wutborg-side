const fs = require("fs");
const { execSync } = require("child_process");
const path = require("path");
const os = require("os");
const TMP = path.join(os.tmpdir(), "madplan_qv");
fs.mkdirSync(TMP, { recursive: true });
let pass = 0, fail = 0;

function checkModule(rel, label) {
  const full = path.join("c:/wutborg-side/wutborg-side", rel);
  try {
    const code = fs.readFileSync(full, "utf8");
    const tmpFile = path.join(TMP, path.basename(rel).replace(/\.js$/, ".mjs"));
    fs.writeFileSync(tmpFile, code);
    execSync(`node --check "${tmpFile}"`, { stdio: "pipe", timeout: 10000 });
    console.log(`  OK   ${label}`);
    pass++;
  } catch (err) {
    const msg = err.stderr ? err.stderr.toString().trim().split("\n").pop() : err.message;
    console.log(`  FAIL ${label}  ->  ${msg}`);
    fail++;
  }
}

function checkHtmlScript(rel, label) {
  const full = path.join("c:/wutborg-side/wutborg-side", rel);
  const html = fs.readFileSync(full, "utf8");
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  blocks.forEach((m, i) => {
    const tmpFile = path.join(TMP, `html_${i}.js`);
    fs.writeFileSync(tmpFile, m[1]);
    try {
      execSync(`node --check "${tmpFile}"`, { stdio: "pipe", timeout: 10000 });
      console.log(`  OK   ${label} (script #${i})`);
      pass++;
    } catch (err) {
      const msg = err.stderr ? err.stderr.toString().trim().split("\n").pop() : err.message;
      console.log(`  FAIL ${label} (script #${i}) -> ${msg}`);
      fail++;
    }
  });
}

console.log("=== Server-filer ===");
checkModule("functions/api/_helpers.js", "helpers [E]");
checkModule("functions/api/freezer/index.js", "freezer index [E]");
checkModule("functions/api/freezer/[id].js", "freezer [id] [E]");
checkModule("functions/api/shopping/[id].js", "shopping [id] [C]");

console.log("\n=== Klient-JS ===");
checkHtmlScript("madplan/index.html", "madplan klient");

console.log(`\nResultat: ${pass} OK, ${fail} FEJL`);
process.exit(fail ? 1 : 0);