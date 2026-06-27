const fs = require("fs");
const code = fs.readFileSync("c:/wutborg-side/wutborg-side/_my_script.js", "utf8");

// Prøv at wrappe koden i en Function for at få bedre fejlinfo
try {
  new Function(code);
  console.log("PARSE OK via new Function()");
} catch(e) {
  console.log("FEJL via new Function():", e.message);
  // new Function giver ikke altid linjenummer, men lad os prøve
  const m = e.stack.match(/<anonymous>:(\d+):(\d+)/);
  if (m) console.log("  Ved linje", m[1], "kolonne", m[2]);
}

// Prøv også: parse som module via vm.SourceTextModule (experimental)
const vm = require("vm");
try {
  new vm.SourceTextModule(code);
  console.log("PARSE OK via vm.SourceTextModule");
} catch(e) {
  console.log("FEJL via vm.SourceTextModule:", e.message);
  if (e.stack) {
    const m = e.stack.match(/:(\d+):(\d+)/);
    if (m) console.log("  Ved linje", m[1], "kolonne", m[2]);
  }
}
