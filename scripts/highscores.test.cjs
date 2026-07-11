const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const values = new Map();
let nextId = 0;
const context = {
  console,
  crypto: { randomUUID: () => `test-${++nextId}` },
  localStorage: {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  },
  window: {},
};
context.globalThis = context;
vm.createContext(context);

const source = fs.readFileSync(
  path.resolve(__dirname, "..", "js", "highscores.js"),
  "utf8",
);
vm.runInContext(source, context, { filename: "js/highscores.js" });

(async () => {
  const scores = [20, 100, 40, 80, 60, 10, 30, 50, 70, 90, 110];
  for (const score of scores) {
    const result = await context.window.WutborgHighscores.submit({
      gameKey: "snake",
      gameTitle: "Snake",
      score,
      outcome: "gameover",
    });
    assert.equal(result.ok, true);
    assert.equal(result.local, true);
  }

  const entries = context.window.WutborgHighscores.list("snake");
  assert.equal(context.window.WutborgHighscores.storage, "local");
  assert.equal(entries.length, 10);
  const scoreValues = Array.from(entries, (entry) => Number(entry.score));
  assert.deepEqual(
    scoreValues,
    [110, 100, 90, 80, 70, 60, 50, 40, 30, 20],
  );
  assert.equal(context.window.WutborgHighscores.best("snake").score, 110);
  assert.equal(values.has("wutborg.highscores.v1"), true);

  console.log("Highscore-test: lokale top-10-resultater bestået");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
