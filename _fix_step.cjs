const fs = require("fs");
const f = "c:/wutborg-side/wutborg-side/madplan/index.html";
let c = fs.readFileSync(f, "utf8");
const from = "function freezerStep(item){\r\n\r\nasync function bumpFreezerAmount";
const to = "function freezerStep(item){\r\n  const amount=Number(item.amount);\r\n  return amount > 0 && amount < 1 ? 0.25 : 1;\r\n}\r\n\r\nasync function bumpFreezerAmount";
if (c.includes(from)) {
  c = c.replace(from, to);
  fs.writeFileSync(f, c);
  console.log("OK - rettet (CRLF)");
} else {
  // Prøv LF
  const fromLF = "function freezerStep(item){\n\nasync function bumpFreezerAmount";
  const toLF = "function freezerStep(item){\n  const amount=Number(item.amount);\n  return amount > 0 && amount < 1 ? 0.25 : 1;\n}\n\nasync function bumpFreezerAmount";
  if (c.includes(fromLF)) {
    c = c.replace(fromLF, toLF);
    fs.writeFileSync(f, c);
    console.log("OK - rettet (LF)");
  } else {
    console.log("FEJL - tekst ikke fundet");
  }
}
