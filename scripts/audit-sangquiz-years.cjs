const fs = require("fs");
const https = require("https");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "js/sangquiz-data.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(root, "js/sangquiz-special-data.js"), "utf8"), context);

const songs = context.window.SANGQUIZ_SONGS;
const batchSize = 8;
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

function escapeLucene(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"");
}

function primaryArtist(value) {
  return String(value)
    .split(/\s+(?:feat\.?|featuring|&)\s+/iu)[0]
    .trim();
}

function fetchJson(url, attempt = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        accept: "application/json",
        "User-Agent": "WutborgSongYearAudit/2.0 (local catalog QA)",
      },
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        if ([429, 502, 503].includes(response.statusCode) && attempt < 6) {
          setTimeout(() => resolve(fetchJson(url, attempt + 1)), 1800 * (attempt + 1));
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`MusicBrainz status ${response.statusCode}: ${body.slice(0, 160)}`));
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

function recordingArtist(recording) {
  return (recording["artist-credit"] || [])
    .map((credit) => credit.name || credit.artist?.name || "")
    .join(" ");
}

function resultScore(song, recording) {
  const wantedTitle = normalize(song.title);
  const resultTitle = normalize(recording.title);
  const wantedArtist = normalize(primaryArtist(song.artist));
  const resultArtist = normalize(recordingArtist(recording));
  const artistWords = wantedArtist.split(" ").filter((word) => word.length > 2);
  const matchingArtistWords = artistWords.filter((word) => resultArtist.includes(word));
  if (artistWords.length && !matchingArtistWords.length) return -1;
  let score = wantedTitle === resultTitle ? 100 : 0;
  if (wantedTitle.startsWith(resultTitle) || resultTitle.startsWith(wantedTitle)) score += 30;
  score += matchingArtistWords.length * 8;
  score += Number(recording.score || 0) / 20;
  return score;
}

function auditSong(song, recordings) {
  const candidates = recordings
    .map((recording) => ({ recording, score: resultScore(song, recording) }))
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score < 70 || !best.recording["first-release-date"]) {
    return {
      edition: song.edition,
      title: song.title,
      artist: song.artist,
      expected: song.year,
      status: "not-found",
    };
  }

  const catalogYear = Number(best.recording["first-release-date"].slice(0, 4));
  return {
    edition: song.edition,
    title: song.title,
    artist: song.artist,
    expected: song.year,
    catalogYear,
    matchedTitle: best.recording.title,
    matchedArtist: recordingArtist(best.recording),
    score: Math.round(best.score),
    status: catalogYear === song.year ? "match" : "review",
  };
}

async function auditBatch(batch) {
  const query = batch
    .map((song) => `(recording:"${escapeLucene(song.title)}" AND artist:"${escapeLucene(primaryArtist(song.artist))}")`)
    .join(" OR ");
  const url = new URL("https://musicbrainz.org/ws/2/recording/");
  url.searchParams.set("query", query);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", "100");
  const data = await fetchJson(url);
  const recordings = data.recordings || [];
  return batch.map((song) => auditSong(song, recordings));
}

(async () => {
  const results = [];
  for (let index = 0; index < songs.length; index += batchSize) {
    results.push(...await auditBatch(songs.slice(index, index + batchSize)));
    if (index + batchSize < songs.length) await wait(1100);
  }
  const summary = results.reduce((counts, result) => {
    counts[result.status] = (counts[result.status] || 0) + 1;
    return counts;
  }, {});
  const earlierThanQuiz = results.filter((result) => {
    return result.status === "review" && result.catalogYear < result.expected;
  });
  console.log(JSON.stringify({
    source: "MusicBrainz first-release-date",
    checked: songs.length,
    summary,
    earlierThanQuiz,
    note: "Senere katalogdatoer er typisk genudgivelser og kræver ikke ændringer i quizzen.",
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
