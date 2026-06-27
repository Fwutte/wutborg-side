// Find ubalance ved at fjerne strenge og template-literals først,
// derefter tjekke parentes-balance med præcis linjenummerering.
const fs = require("fs");
const code = fs.readFileSync("c:/wutborg-side/wutborg-side/_extracted_script_0.js", "utf8");

// Fjern strenge, template-literals og kommentarer, erstat med mellemrum
let cleaned = "";
let i = 0;
const lines = [];
while (i < code.length) {
  const ch = code[i];
  // Line comment
  if (ch === "/" && code[i+1] === "/") {
    while (i < code.length && code[i] !== "\n") { cleaned += " "; i++; }
    continue;
  }
  // Block comment
  if (ch === "/" && code[i+1] === "*") {
    cleaned += "  ";
    i += 2;
    while (i < code.length && !(code[i] === "*" && code[i+1] === "/")) {
      cleaned += code[i] === "\n" ? "\n" : " ";
      i++;
    }
    if (i < code.length) { cleaned += "  "; i += 2; }
    continue;
  }
  // String (single/double quote)
  if (ch === '"' || ch === "'") {
    const q = ch;
    cleaned += " ";
    i++;
    while (i < code.length && code[i] !== q) {
      if (code[i] === "\\") { cleaned += "  "; i += 2; continue; }
      cleaned += code[i] === "\n" ? "\n" : " ";
      i++;
    }
    if (i < code.length) { cleaned += " "; i++; }
    continue;
  }
  // Template literal
  if (ch === "`") {
    cleaned += " ";
    i++;
    while (i < code.length && code[i] !== "`") {
      if (code[i] === "\\") { cleaned += "  "; i += 2; continue; }
      if (code[i] === "$" && code[i+1] === "{") {
        // Behold ${...} indhold som kode (rekursivt)
        cleaned += "${";
        i += 2;
        let depth = 1;
        while (i < code.length && depth > 0) {
          if (code[i] === "{") depth++;
          if (code[i] === "}") depth--;
          if (depth === 0) break;
          // Inden i ${...} kan der være strenge - spring dem over
          if (code[i] === '"' || code[i] === "'") {
            const sq = code[i];
            cleaned += " ";
            i++;
            while (i < code.length && code[i] !== sq) {
              if (code[i] === "\\") { cleaned += "  "; i += 2; continue; }
              cleaned += code[i] === "\n" ? "\n" : " ";
              i++;
            }
            if (i < code.length) { cleaned += " "; i++; }
            continue;
          }
          if (code[i] === "`") {
            // Nested template literal - spring over
            cleaned += " ";
            i++;
            let nd = 1;
            while (i < code.length && nd > 0) {
              if (code[i] === "\\") { i += 2; continue; }
              if (code[i] === "`") nd--;
              else if (code[i] === "$" && code[i+1] === "{") { nd++; i++; }
              if (nd > 0) i++;
            }
            if (i < code.length) i++;
            continue;
          }
          cleaned += code[i];
          i++;
        }
        if (i < code.length) { cleaned += "}"; i++; }
        continue;
      }
      cleaned += code[i] === "\n" ? "\n" : " ";
      i++;
    }
    if (i < code.length) { cleaned += " "; i++; }
    continue;
  }
  // Regex literal (forenklet: / efter ikke-identifier)
  if (ch === "/" && i > 0 && /[(,=:;!?&|{[\n]/.test(code[i-1])) {
    cleaned += " ";
    i++;
    let inClass = false;
    while (i < code.length && (code[i] !== "/" || inClass)) {
      if (code[i] === "\\") { cleaned += "  "; i += 2; continue; }
      if (code[i] === "[") inClass = true;
      if (code[i] === "]") inClass = false;
      cleaned += code[i] === "\n" ? "\n" : " ";
      i++;
    }
    // flags
    if (i < code.length) { cleaned += " "; i++; }
    while (i < code.length && /[gimsuy]/.test(code[i])) { i++; }
    continue;
  }
  cleaned += ch;
  i++;
}

// Tjek parentes-balance på den rensede kode
const pairs = { ")": "(", "]": "[", "}": "{" };
const opens = { "(": 1, "[": 1, "{": 1 };
const stack = [];
const cleanedLines = cleaned.split("\n");
for (let li = 0; li < cleanedLines.length; li++) {
  const line = cleanedLines[li];
  for (let ci = 0; ci < line.length; ci++) {
    const ch = line[ci];
    if (ch in opens) stack.push({ ch, line: li+1 });
    else if (ch in pairs) {
      if (stack.length === 0) {
        console.log(`Uventet lukketegn '${ch}' på linje ${li+1}`);
      } else {
        const top = stack.pop();
        if (top.ch !== pairs[ch]) {
          console.log(`Mismatch på linje ${li+1}: '${ch}' lukker '${top.ch}' (åbnet linje ${top.line})`);
        }
      }
    }
  }
}
if (stack.length > 0) {
  console.log(`${stack.length} uafsluttede åbningstegn:`);
  stack.forEach(s => console.log(`  '${s.ch}' åbnet på linje ${s.line}: ${cleanedLines[s.line-1].trim().slice(0,70)}`));
} else {
  console.log("Parentes-balance: OK");
}


