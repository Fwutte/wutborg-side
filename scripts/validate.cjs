const fs = require("fs");
const { spawnSync } = require("child_process");
const path = require("path");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
const TMP = path.join(os.tmpdir(), "madplan_validate");
fs.mkdirSync(TMP, { recursive: true });

let pass = 0;
let fail = 0;

function nodeCheck(file) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
    timeout: 15000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(result.stderr || result.stdout || `node --check exited ${result.status}`);
    error.stderr = result.stderr;
    throw error;
  }
}

function checkModule(rel, label) {
  const full = path.join(ROOT, rel);
  try {
    const code = fs.readFileSync(full, "utf8");
    const tmpFile = path.join(TMP, path.basename(rel).replace(/\.js$/, ".mjs"));
    fs.writeFileSync(tmpFile, code);
    nodeCheck(tmpFile);
    console.log(`  OK   ${label}`);
    pass += 1;
  } catch (err) {
    const msg = err.stderr ? err.stderr.toString().trim().split("\n").pop() : err.message;
    console.log(`  FAIL ${label}  (${rel})`);
    console.log(`       ${msg}`);
    fail += 1;
  }
}

function checkHtmlScript(rel, label) {
  const full = path.join(ROOT, rel);
  try {
    const html = fs.readFileSync(full, "utf8");
    const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
    if (!blocks.length) {
      console.log(`  WARN ${label} - no inline <script> found`);
      return;
    }

    blocks.forEach((match, index) => {
      const tmpFile = path.join(TMP, `html_script_${index}.js`);
      fs.writeFileSync(tmpFile, match[1]);
      try {
        nodeCheck(tmpFile);
        console.log(`  OK   ${label}  (script #${index}, ${match[1].length} chars)`);
        pass += 1;
      } catch (err) {
        const stderr = err.stderr ? err.stderr.toString().trim() : "";
        const lines = stderr.split("\n").filter((line) => line.trim());
        const msg = lines.length ? lines.slice(0, 3).join(" | ") : err.message;
        console.log(`  FAIL ${label}  (script #${index})`);
        console.log(`       ${msg}`);
        fail += 1;
      }
    });
  } catch (err) {
    console.log(`  FAIL ${label} - could not read: ${err.message}`);
    fail += 1;
  }
}

console.log("\n=== Server modules ===");
checkModule("functions/api/_helpers.js", "helpers");
checkModule("functions/api/freezer/index.js", "freezer GET/POST/DELETE");
checkModule("functions/api/freezer/[id].js", "freezer PATCH/DELETE :id");
checkModule("functions/api/highscores/index.js", "highscores GET/POST");
checkModule("functions/api/shopping/index.js", "shopping GET/POST/DELETE");
checkModule("functions/api/shopping/[id].js", "shopping PATCH/DELETE :id");
checkModule("functions/api/plan/index.js", "plan GET");
checkModule("functions/api/plan/[date].js", "plan PUT/DELETE");
checkModule("functions/api/dishes/index.js", "dishes GET/POST");
checkModule("functions/api/dishes/[id].js", "dishes PATCH/DELETE");

console.log("\n=== Client JavaScript ===");
checkModule("js/highscores.js", "highscore client helper");
checkModule("js/sangquiz-data.js", "sangquiz song data");
checkModule("js/sangquiz.js", "sangquiz game");
checkModule("js/pips-skybound.js", "pips skybound game");
checkModule("js/pokemon/battle-ui.js", "pokemon battle UI");
checkHtmlScript("brick-breaker.html", "brick breaker client");
checkHtmlScript("fire-paa-stribe.html", "fire paa stribe client");
checkHtmlScript("geometry-dash.html", "geometry dash client");
checkHtmlScript("kalender.html", "kalender client");
checkHtmlScript("madplan/index.html", "madplan client");
checkHtmlScript("minispil.html", "minispil client");
checkHtmlScript("snake.html", "snake client");
checkHtmlScript("tetris.html", "tetris client");

console.log("\n=== Migrations ===");
const migration = fs.readFileSync(path.join(ROOT, "migrations/0005_drop_freezer_quantity.sql"), "utf8");
const checks = [
  [/DROP TABLE freezer_items/, "DROP TABLE"],
  [/RENAME TO freezer_items/, "RENAME TO"],
  [/SET amount = 1/, "backfill amount=1"],
  [/ix_freezer_drawer_sort/, "recreate index"],
];

checks.forEach(([pattern, name]) => {
  const ok = pattern.test(migration);
  console.log(`  ${ok ? "OK " : "FAIL"} migration 0005: ${name}`);
  pass += ok ? 1 : 0;
  fail += ok ? 0 : 1;
});

const highscoreMigration = fs.readFileSync(path.join(ROOT, "migrations/0006_highscores.sql"), "utf8");
const highscoreChecks = [
  [/CREATE TABLE IF NOT EXISTS highscores/, "create highscores"],
  [/game_key\s+TEXT\s+NOT NULL/, "game_key"],
  [/score\s+INTEGER\s+NOT NULL/, "score"],
  [/ix_highscores_game_score/, "leaderboard index"],
];

highscoreChecks.forEach(([pattern, name]) => {
  const ok = pattern.test(highscoreMigration);
  console.log(`  ${ok ? "OK " : "FAIL"} migration 0006: ${name}`);
  pass += ok ? 1 : 0;
  fail += ok ? 0 : 1;
});

console.log(`\n=== Result: ${pass} OK, ${fail} FAIL ===\n`);
process.exit(fail ? 1 : 0);
