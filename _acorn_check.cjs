const fs = require("fs");
let acorn;
try {
  acorn = require("node:internal/deps/acorn/acorn/dist/acorn");
} catch(e) {
  try {
    acorn = require("acorn");
  } catch(e2) {
    console.log("acorn ikke tilgængelig:", e2.message);
    process.exit(1);
  }
}
const code = fs.readFileSync("c:/wutborg-side/wutborg-side/_my_script.js", "utf8");
try {
  acorn.parse(code, { ecmaVersion: 2024, sourceType: "script" });
  console.log("PARSE OK");
} catch(e) {
  console.log("FEJL:", e.message);
  console.log("ved linje", e.loc && e.loc.line, "kolonne", e.loc && e.loc.column);
  // Vis kontekst omkring fejlen
  if (e.loc) {
    const lines = code.split("\n");
    const ln = e.loc.line;
    for (let i = Math.max(0, ln-3); i < Math.min(lines.length, ln+2); i++) {
      console.log(`  ${i+1}: ${lines[i]}`);
    }
  }
}
