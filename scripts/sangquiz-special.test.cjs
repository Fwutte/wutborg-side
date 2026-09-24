const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const context = { window: {} };
const html = fs.readFileSync(path.join(root, "sangquiz.html"), "utf8");
const gameSource = fs.readFileSync(path.join(root, "js/sangquiz.js"), "utf8");
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
  assert(pool.length >= 100, `${category} skal have mindst 100 standardsange`);
}

const categoryExpansion = standard.filter((song) => song.tags.includes("catalog-expansion"));
assert.equal(categoryExpansion.length, 120, "Kategoriudvidelsen skal indeholde 120 bredt kendte sange");
assert(
  categoryExpansion.every((song) => song.spotifyUrl.startsWith("https://open.spotify.com/search/")),
  "Nye kategorisange skal have robuste Spotify-søgelinks",
);
assert(
  categoryExpansion.every((song) => song.tags.includes(`${String(song.year).slice(2, 3)}0s`)),
  "Nye kategorisange skal ligge i kategorien for deres første udgivelsesår",
);
assert(html.includes("sangquiz-data.js?v=20260922-origin100"), "Siden skal cache-bryde det udvidede sangkatalog");
assert(html.includes("sangquiz.js?v=20260924-record-room"), "Siden skal cache-bryde sangquiz-scriptet");
assert(!gameSource.includes('count.className = "category-count"'), "Kategorikort må ikke vise sangantal");

const carpark32 = songs.find((song) => song.title === "32" && song.artist.startsWith("Carpark North"));
assert(carpark32, "Carpark Norths 32 skal findes");
assert.equal(carpark32.year, 2013, "Carpark Norths 32 udkom som single i 2013");
assert(carpark32.artist.includes("Stine Bramsen"), "Stine Bramsen skal krediteres på 32");

const correctedYears = new Map([
  ["D-A-D::Laugh 'n' 1/2", 1991],
  ["Kim Larsen::This Is My Life", 1977],
  ["Lis Sørensen::Tæt På Ækvator", 1983],
  ["Lars H.U.G.::Mon De Kan Reparere Dig", 1987],
  ["Johnny Deluxe::Elskovspony", 2003],
  ["Infernal::Keen on Disco", 2004],
  ["Sebastian::Når Lyset Bryder Frem", 1972],
  ["The Raveonettes::Aly, Walk With Me", 2007],
  ["Junior Senior::Rhythm Bandits", 2002],
  ["Stealers Wheel::Stuck in the Middle with You", 1972],
  ["Blue Swede::Hooked on a Feeling", 1973],
  ["The Three Degrees::When Will I See You Again", 1973],
  ["John Paul Young::Love Is in the Air", 1977],
  ["The Bangles::Eternal Flame", 1988],
  ["Backstreet Boys::Everybody (Backstreet's Back)", 1997],
  ["Sixpence None the Richer::Kiss Me", 1997],
  ["Lukas Graham::7 Years", 2015],
  ["Barbara Pravi::Voilà", 2020],
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

// Exercise the actual game filters and saved-state migration without starting Spotify or the UI.
const storage = new Map();
context.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
};
vm.runInContext(gameSource.replace('document.addEventListener("DOMContentLoaded", init);', `
  window.filterTest = {
    getSongPool, getArtistLetter, normalizeFilters, normalizeState, createGameState,
    getActiveSongPool, updateCategoryUi, validateManualSongLink, els,
    select(category, filters) { selectedCategory = category; selectedFilters = normalizeFilters(filters); },
    setState(value) { state = value; },
  };
`), context);
const filters = context.window.filterTest;
for (const decade of ["70s", "80s", "90s", "00s", "10s"]) {
  for (const origin of ["danish", "international"]) {
    const pool = filters.getSongPool(decade, { origin });
    assert(pool.length >= 100, `${decade} skal have mindst 100 sange med ${origin}`);
    assert(pool.every((song) => song.category === origin && song.tags.includes(decade)));
    const letterPool = filters.getSongPool(decade, { origin, letters: ["A", "B", "C"] });
    assert.deepEqual(Array.from(letterPool, (song) => song.id), Array.from(pool.filter((song) => /^[ABC]/i.test(song.artist)), (song) => song.id));
  }
}
for (const edition of editions) {
  const pool = filters.getSongPool(edition, { origin: "danish", letters: ["B", "S"] });
  assert(pool.length > 0);
  assert(pool.every((song) => song.edition === edition && song.category === "danish" && /^[BS]/i.test(song.artist)));
}
for (const [artist, letter] of [["ABBA", "A"], ["a-ha", "A"], ["Édith Piaf", "E"], ["Ægir", "Æ"], ["Østkyst Hustlers", "Ø"], ["Åge", "Å"], ["A\u030age", "Å"], [" The Beatles", "T"], ["50 Cent", "0-9"]]) {
  assert.equal(filters.getArtistLetter(artist), letter);
}
assert.equal(JSON.stringify(filters.normalizeFilters({ origin: "invalid", letters: ["A", "A", "invalid"] })), JSON.stringify({ origin: "mixed", letters: ["A"] }));
assert.equal(filters.getSongPool("80s", { origin: "danish", letters: ["Q"] }).length, 0);
const brokenSong = filters.getSongPool("80s", { origin: "danish" })[0];
storage.set("wutborg.sangquiz.brokenLinks.v1", JSON.stringify([{ songId: brokenSong.id }]));
assert(!filters.getSongPool("80s", { origin: "danish" }).some((song) => song.id === brokenSong.id));
storage.clear();
filters.select("80s", { origin: "danish", letters: ["K"] });
const game = filters.createGameState(["Hold 1", "Hold 2"]);
filters.setState(filters.normalizeState(JSON.parse(JSON.stringify(game))));
filters.select("90s", { origin: "international", letters: ["A"] });
const restoredPool = filters.getActiveSongPool();
assert(restoredPool.length > 0);
assert(restoredPool.every((song) => song.category === "danish" && song.tags.includes("80s") && song.artist.startsWith("K")), "Et gemt spil skal bevare sine egne filtre");
const legacy = filters.normalizeState({ started: true, songCategory: "danish", teams: [] });
assert.equal(legacy.songCategory, "mixed");
assert.equal(legacy.songFilters.origin, "danish");
assert.equal(filters.normalizeState({ songCategory: "80s" }).songFilters.origin, "mixed", "Gamle årtispil skal fortsat indeholde begge typer kunstnere");
Object.assign(filters.els, { categoryButtons: [], originButtons: [], letterButtons: [], startGameButton: {}, categoryStatus: {} });
filters.setState({ started: false });
filters.select("80s", { origin: "danish", letters: ["Q"] });
filters.updateCategoryUi();
assert.equal(filters.els.startGameButton.disabled, true);
assert.match(filters.els.categoryStatus.textContent, /Ingen sange/);
filters.select("80s", { origin: "danish", letters: [] });
filters.updateCategoryUi();
assert.equal(filters.els.startGameButton.disabled, false);
const originButtons = ["mixed", "danish", "international"].map((origin) => ({ dataset: { songOrigin: origin }, setAttribute() {} }));
filters.els.originButtons = originButtons;
filters.select("christmas", { origin: "mixed" });
filters.updateCategoryUi();
assert.equal(originButtons[0].disabled, false, "Julepuljen med 100 sange skal kunne vælges");
assert.equal(originButtons[1].disabled, true, "En dansk delpulje med under 100 sange må ikke kunne vælges");
assert.equal(originButtons[2].disabled, true, "En international delpulje med under 100 sange må ikke kunne vælges");
filters.select("70s", { origin: "danish" });
filters.updateCategoryUi();
assert(originButtons.every((button) => !button.disabled), "Alle tre kunstnervalg skal have mindst 100 sange i årtierne");

const imports = JSON.parse(fs.readFileSync(path.join(root, "data/sangquiz-expansion-sources.json"), "utf8")).imports;
const expansion = standard.filter((song) => song.tags.includes("origin-expansion"));
assert.equal(expansion.length, imports.length, "Alle tilføjede sange skal have dokumentation");
assert(imports.every((song) => song.yearChecked), "Nye årstal skal være kontrolleret uden årtibegrænsning");
assert.equal(new Set(imports.map((song) => song.recordingUrl)).size, imports.length, "Samme indspilning må ikke tælle flere gange");
assert(imports.every((song) => song.recordingUrl.startsWith("https://musicbrainz.org/recording/") && song.releaseUrl.startsWith("https://musicbrainz.org/release/")), "Både indspilning og udgivelse skal være dokumenteret");
assert(imports.every((song) => !/\b(interview|commentary|behind the scenes|karaoke|dub|photo gallery|exclusive access)\b/i.test(song.title)), "Sangpuljer må ikke fyldes med interviews, remixes eller andet ekstramateriale");

console.log("Sangquiz filters: decades, origins, letters, empty pools and saved games passed");
console.log(`Sangquiz special editions: ${editions.map((edition) => `${edition}=${songs.filter((song) => song.edition === edition).length}`).join(", ")}`);
console.log(`Sangquiz new categories: ${newCategories.map((category) => `${category}=${standard.filter((song) => song.tags.includes(category)).length}`).join(", ")}`);

(async () => {
  context.URL = URL;
  context.window.setTimeout = setTimeout;
  context.window.clearTimeout = clearTimeout;
  const directSong = songs.find((song) => song.spotifyUri);
  for (const status of [200, 401, 403, 404, 410, 429, 500, 503]) {
    context.fetch = async () => ({ status, ok: status === 200 });
    const check = await filters.validateManualSongLink(directSong);
    const missing = [404, 410].includes(status);
    assert.equal(check.valid, !missing, `HTTP ${status}: kun et manglende track må fjernes fra puljen`);
    assert.equal(check.checked, status === 200 || missing);
  }
  context.fetch = async () => { throw new Error("network offline"); };
  assert.equal((await filters.validateManualSongLink(directSong)).valid, true);
  console.log("Sangquiz links: missing tracks are excluded; temporary Spotify errors and network failures are not");
})().catch((error) => { console.error(error); process.exitCode = 1; });
