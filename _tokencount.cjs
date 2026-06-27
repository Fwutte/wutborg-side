const fs = require("fs");
const acorn = require("acorn");
const code = fs.readFileSync("c:/wutborg-side/wutborg-side/_my_script.js", "utf8");

// Brug acorn tokenizer til præcist at tælle parenteser
const counts = { "{": 0, "}": 0, "(": 0, ")": 0, "[": 0, "]": 0 };
const stack = [];
for (const t of acorn.tokenizer(code, { ecmaVersion: 2024, locations: true })) {
  const label = t.type.label;
  if (label === "{") { counts["{"]++; stack.push({ ch: "{", line: t.loc.start.line }); }
  else if (label === "}") { counts["}"]++; 
    const top = stack.pop();
    if (!top) console.log(`  Uventet '}' på linje ${t.loc.start.line}`);
    else if (top.ch !== "{") console.log(`  Mismatch: '}' på linje ${t.loc.start.line} lukker '${top.ch}' fra linje ${top.line}`);
  }
  else if (label === "(") { counts["("]++; stack.push({ ch: "(", line: t.loc.start.line }); }
  else if (label === ")") { counts[")"]++; 
    const top = stack.pop();
    if (!top) console.log(`  Uventet ')' på linje ${t.loc.start.line}`);
    else if (top.ch !== "(") console.log(`  Mismatch: ')' på linje ${t.loc.start.line} lukker '${top.ch}' fra linje ${top.line}`);
  }
  else if (label === "[") { counts["["]++; stack.push({ ch: "[", line: t.loc.start.line }); }
  else if (label === "]") { counts["]"]++; 
    const top = stack.pop();
    if (!top) console.log(`  Uventet ']' på linje ${t.loc.start.line}`);
    else if (top.ch !== "[") console.log(`  Mismatch: ']' på linje ${t.loc.start.line} lukker '${top.ch}' fra linje ${top.line}`);
  }
}

console.log("Parentes-tælling:");
console.log(`  { : ${counts["{"]}    } : ${counts["}"]}`);
console.log(`  ( : ${counts["("]}    ) : ${counts[")"]}`);
console.log(`  [ : ${counts["["]}    ] : ${counts["]"]}`);

if (stack.length > 0) {
  console.log(`\n${stack.length} UAFSLUTTEDE åbningstegn:`);
  for (const s of stack) {
    console.log(`  '${s.ch}' åbnet på linje ${s.line}`);
  }
} else {
  console.log("\nAlt balanceret!");
}


