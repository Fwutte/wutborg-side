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
assert(standard.every((song) => Number.isInteger(song.year)), "Alle standardsange skal have hele årstal");
assert(songs.every((song) => song.year >= 1930 && song.year <= 2026), "Alle årstal skal ligge i et realistisk interval");

const newCategories = ["70s", "80s", "90s", "00s", "10s", "rock"];
for (const category of newCategories) {
  const pool = standard.filter((song) => song.tags.includes(category));
  assert(pool.length >= 40, `${category} skal have mindst 40 standardsange`);
}

const carpark32 = songs.find((song) => song.title === "32" && song.artist.startsWith("Carpark North"));
assert(carpark32, "Carpark Norths 32 skal findes");
assert.equal(carpark32.year, 2013, "Carpark Norths 32 udkom som single i 2013");
assert(carpark32.artist.includes("Stine Bramsen"), "Stine Bramsen skal krediteres på 32");

const correctedYears = new Map([
  ["Kim Larsen::This Is My Life", 1977],
  ["Lis Sørensen::Tæt På Ækvator", 1983],
  ["Lars H.U.G.::Mon De Kan Reparere Dig", 1987],
  ["Johnny Deluxe::Elskovspony", 2003],
]);
for (const [key, year] of correctedYears) {
  const [artist, title] = key.split("::");
  const song = songs.find((candidate) => candidate.artist === artist && candidate.title === title);
  assert(song, `${key} skal findes`);
  assert.equal(song.year, year, `${key} skal bruge første udgivelsesår`);
}

const screen = songs.filter((song) => song.edition === "screen");
assert(screen.every((song) => song.sourceTitle), "Alle film/tv-sange skal have et værk at gætte");
assert(screen.every((song) => ["film", "tv-serie"].includes(song.sourceType)), "Alle værker skal have korrekt type");

console.log(`Sangquiz special editions: ${editions.map((edition) => `${edition}=${songs.filter((song) => song.edition === edition).length}`).join(", ")}`);
console.log(`Sangquiz new categories: ${newCategories.map((category) => `${category}=${standard.filter((song) => song.tags.includes(category)).length}`).join(", ")}`);
