const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = { window: {} };
vm.createContext(context);
for (const file of ["sangquiz-data.js", "sangquiz-special-data.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, "js", file), "utf8"), context);
}
const songs = context.window.SANGQUIZ_SONGS;
const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9æø]+/g, " ").trim();

async function check(song) {
  const result = { id: song.id, title: song.title, artist: song.artist, url: song.spotifyUrl };
  let url;
  try { url = new URL(song.spotifyUrl); } catch { return { ...result, status: "invalid-url" }; }
  if (url.protocol !== "https:" || url.hostname !== "open.spotify.com") return { ...result, status: "invalid-host" };
  if (url.pathname.startsWith("/search/")) {
    const query = decodeURIComponent(url.pathname.slice("/search/".length));
    return { ...result, status: query === `${song.title} ${song.artist}` ? "search-link-only" : "search-query-mismatch" };
  }
  const id = url.pathname.match(/^\/track\/([A-Za-z0-9]{22})$/)?.[1];
  if (!id || (song.spotifyUri && song.spotifyUri !== `spotify:track:${id}`)) return { ...result, status: "invalid-track-id" };
  try {
    const response = await fetch(`https://open.spotify.com/embed/track/${id}`, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) return { ...result, status: response.status === 404 ? "not-found" : "unverified", httpStatus: response.status };
    const html = await response.text();
    const json = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s)?.[1];
    const entity = json ? JSON.parse(json)?.props?.pageProps?.state?.data?.entity : null;
    if (!entity?.name) return { ...result, status: "unverified" };
    const artists = (entity.artists || []).map((artist) => artist.name);
    const titleMatches = normalize(entity.name) === normalize(song.title)
      || normalize(entity.name).startsWith(`${normalize(song.title)} `);
    const artistMatches = artists.some((artist) => normalize(artist) === normalize(song.artist)
      || normalize(song.artist).startsWith(`${normalize(artist)} `));
    return {
      ...result,
      status: !titleMatches || !artistMatches ? "wrong-recording" : entity.isPlayable === false ? "unplayable" : "verified",
      actualTitle: entity.name, actualArtists: artists, isPlayable: entity.isPlayable,
    };
  } catch (error) { return { ...result, status: "unverified", error: error.message }; }
}

(async () => {
  const results = [];
  for (let index = 0; index < songs.length; index += 4) {
    results.push(...await Promise.all(songs.slice(index, index + 4).map(check)));
  }
  const categories = ["mixed", "70s", "80s", "90s", "00s", "10s", "rock", "christmas", "eurovision", "screen"].map((category) => {
    const pool = songs.filter((song) => ["christmas", "eurovision", "screen"].includes(category)
      ? song.edition === category : song.edition === "standard" && (category === "mixed" || song.tags.includes(category)));
    return { category, total: pool.length, danish: pool.filter((song) => song.category === "danish").length, international: pool.filter((song) => song.category === "international").length };
  });
  const counts = results.reduce((totals, item) => ({ ...totals, [item.status]: (totals[item.status] || 0) + 1 }), {});
  const report = { checkedAt: new Date().toISOString(), note: "Spotify embed metadata checks title, artist and public playability. Search URLs are checked structurally only; they do not establish that a recording exists or is playable in a specific account or market.", categories, counts, results };
  fs.writeFileSync(path.join(root, "data/sangquiz-link-audit.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ categories, counts, problems: results.filter((item) => !["verified", "search-link-only"].includes(item.status)) }, null, 2));
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
