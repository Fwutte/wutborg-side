// Udtræk inline-scriptet fra index.html og gem det til inspektion.
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync("c:/wutborg-side/wutborg-side/madplan/index.html", "utf8");
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
blocks.forEach((m, i) => {
  const out = path.join("c:/wutborg-side/wutborg-side", `_extracted_script_${i}.js`);
  fs.writeFileSync(out, m[1]);
  console.log(`Script #${i}: ${m[1].length} tegn -> ${out}`);
});
