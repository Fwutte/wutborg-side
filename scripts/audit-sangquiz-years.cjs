const fs = require("fs");
const https = require("https");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const context = { window: { SANGQUIZ_SONGS: [] } };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "js/sangquiz-special-data.js"), "utf8"), context);

const songs = context.window.SANGQUIZ_SONGS.filter((song) => song.edition !== "eurovision");
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function normalize(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(feat|featuring|and|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fetchJson(url, attempt = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "WutborgSongYearAudit/1.0" } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        if (response.statusCode === 429 && attempt < 6) {
          setTimeout(() => resolve(fetchJson(url, attempt + 1)), 1500 * (attempt + 1));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Invalid JSON (${response.statusCode}): ${error.message}`));
        }
      });
    }).on("error", reject);
  });
}

function resultScore(song, result) {
  const wantedTitle = normalize(song.title);
  const resultTitle = normalize(result.trackName);
  const wantedArtist = normalize(song.artist);
  const resultArtist = normalize(result.artistName);
  const artistWords = wantedArtist.split(" ").filter((word) => word.length > 2);
  const matchingArtistWords = artistWords.filter((word) => resultArtist.includes(word));
  if (artistWords.length && !matchingArtistWords.length) return -1;
  let score = wantedTitle === resultTitle ? 100 : 0;
  if (wantedTitle.startsWith(resultTitle) || resultTitle.startsWith(wantedTitle)) score += 30;
  score += matchingArtistWords.length * 8;
  return score;
}

async function auditSong(song) {
  const term = encodeURIComponent(`${song.title} ${song.artist}`);
  const url = `https://itunes.apple.com/search?term=${term}&entity=song&limit=25&country=DK`;
  const data = await fetchJson(url);
  const candidates = (data.results || [])
    .map((result) => ({ result, score: resultScore(song, result) }))
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score < 70 || !best.result.releaseDate) {
    return { edition: song.edition, title: song.title, artist: song.artist, expected: song.year, status: "not-found" };
  }
  const catalogYear = Number(best.result.releaseDate.slice(0, 4));
  return {
    edition: song.edition,
    title: song.title,
    artist: song.artist,
    expected: song.year,
    catalogYear,
    matchedTitle: best.result.trackName,
    matchedArtist: best.result.artistName,
    status: catalogYear === song.year ? "match" : "review",
  };
}

(async () => {
  const results = [];
  for (const song of songs) {
    results.push(await auditSong(song));
    await wait(450);
  }
  const summary = results.reduce((counts, result) => {
    counts[result.status] = (counts[result.status] || 0) + 1;
    return counts;
  }, {});
  console.log(JSON.stringify({ summary, review: results.filter((result) => result.status !== "match") }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
