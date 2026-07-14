const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "js/sangquiz-data.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(root, "js/sangquiz-special-data.js"), "utf8"), context);

const songs = context.window.SANGQUIZ_SONGS;
const ids = songs.map((song) => song.id);
const editions = ["christmas", "eurovision", "screen"];

assert.equal(ids.length, new Set(ids).size, "Alle sang-id'er skal være unikke");

for (const edition of editions) {
  const pool = songs.filter((song) => song.edition === edition);
  assert(pool.length >= 100 && pool.length <= 300, `${edition} skal have 100-300 sange`);
  assert(pool.some((song) => song.category === "danish"), `${edition} skal indeholde danske sange`);
  assert(pool.some((song) => song.category === "international"), `${edition} skal indeholde internationale sange`);
  assert(pool.every((song) => Number.isInteger(song.year)), `${edition} skal have hele årstal`);
}

const standard = songs.filter((song) => song.edition === "standard");
assert(standard.length > 0, "Standardpuljen skal stadig findes");
assert(standard.every((song) => !editions.includes(song.edition)), "Specialsange må ikke være i standardpuljen");

const screen = songs.filter((song) => song.edition === "screen");
assert(screen.every((song) => song.sourceTitle), "Alle film/tv-sange skal have et værk at gætte");
assert(screen.every((song) => ["film", "tv-serie"].includes(song.sourceType)), "Alle værker skal have korrekt type");

console.log(`Sangquiz special editions: ${editions.map((edition) => `${edition}=${songs.filter((song) => song.edition === edition).length}`).join(", ")}`);
