// Binary search: find den linje hvor syntaksen bryder.
const fs = require("fs");
const { execSync } = require("child_process");
const code = fs.readFileSync("c:/wutborg-side/wutborg-side/_my_script.js", "utf8");
const lines = code.split("\n");
const tmpFile = "c:/wutborg-side/wutborg-side/_bsearch.js";

function check(n) {
  // Tag de første n linjer og luk alle åbne parenteser
  const snippet = lines.slice(0, n).join("\n");
  fs.writeFileSync(tmpFile, snippet);
  try {
    execSync(`node --check "${tmpFile}"`, { stdio: "pipe", timeout: 10000 });
    return true; // OK (eller i det mindste ikke "unexpected end of input")
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : "";
    // "Unexpected end of input" betyder at koden er OK indtil her, men uafsluttet
    // Andre fejl betyder at problemet er på eller før denne linje
    if (stderr.includes("Unexpected end of input")) return true;
    return false;
  }
}

// Binary search: find den første linje N hvor check(N) er false
let lo = 1, hi = lines.length;
while (lo < hi) {
  const mid = Math.floor((lo + hi) / 2);
  if (check(mid)) {
    lo = mid + 1;
  } else {
    hi = mid;
  }
}
console.log(`Første fejl ved linje ${lo} (af ${lines.length} total)`);
console.log(`Linje ${lo-2}: ${lines[lo-3] || ""}`);
console.log(`Linje ${lo-1}: ${lines[lo-2] || ""}`);
console.log(`Linje ${lo}:   ${lines[lo-1] || ""}`);
console.log(`Linje ${lo+1}: ${lines[lo] || ""}`);
console.log(`Linje ${lo+2}: ${lines[lo+1] || ""}`);

// Tjek også specifikt om linje lo har problemet
fs.writeFileSync(tmpFile, lines.slice(0, lo).join("\n"));
try {
  execSync(`node --check "${tmpFile}"`, { stdio: "pipe", timeout: 10000 });
  console.log("\ncheck(lo) = OK");
} catch (err) {
  const stderr = err.stderr ? err.stderr.toString().trim() : "";
  console.log("\ncheck(lo) error:", stderr.split("\n").slice(0,3).join(" | "));
}

// Prøv at finde den præcise fejlmeddelelse ved linje lo+1
fs.writeFileSync(tmpFile, lines.slice(0, lo+1).join("\n"));
try {
  execSync(`node --check "${tmpFile}"`, { stdio: "pipe", timeout: 10000 });
  console.log("check(lo+1) = OK");
} catch (err) {
  const stderr = err.stderr ? err.stderr.toString().trim() : "";
  console.log("check(lo+1) error:", stderr.split("\n").slice(0,3).join(" | "));
}
