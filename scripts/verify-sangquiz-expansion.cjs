// Cross-check first release years without restricting searches to the intended decade.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const root = path.resolve(__dirname, "..");
const cachePath = path.join(os.tmpdir(), "wutborg-sangquiz-song-years.json");
const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, "utf8")) : {};
const normalize = (value) => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9æø]/g, "");
const key = (song) => `${song.artistId}:${normalize(song.title)}`;
const songs = JSON.parse(fs.readFileSync(path.join(root, "data/sangquiz-expansion-sources.json"), "utf8")).imports.filter((song) => !cache[key(song)]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(batch) {
  const query = batch.map((song) => `(arid:${song.artistId} AND recording:"${song.title.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`).join(" OR ");
  const url = `https://musicbrainz.org/ws/2/recording/?fmt=json&limit=100&query=${encodeURIComponent(query)}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    await sleep(1200 + attempt * 1500);
    const response = await fetch(url, { headers: { "User-Agent": "WutborgSongCatalog/1.0 (https://wutborg.dk)" }, signal: AbortSignal.timeout(30000) });
    if ([429, 502, 503, 504].includes(response.status)) continue;
    if (!response.ok) throw new Error(`MusicBrainz: ${response.status}`);
    return (await response.json()).recordings || [];
  }
  throw new Error("MusicBrainz is unavailable; no records changed");
}
function verify(song, recordings) {
  const candidates = [];
  for (const recording of recordings) {
    const credits = recording["artist-credit"] || [];
    if (credits.length !== 1 || credits[0].artist.id !== song.artistId || normalize(recording.title) !== normalize(song.title)
      || recording.video || /\b(live|remix|mix|demo|instrumental|karaoke|acoustic|session|edit|version|rehearsal|interview|dub)\b/i.test(recording.disambiguation || "")) continue;
    const date = recording["first-release-date"] || "";
    const year = Number(date.slice(0, 4));
    const release = (recording.releases || []).find((release) => release.status === "Official"
      && ["Album", "Single", "EP"].includes(release["release-group"]?.["primary-type"])
      && !(release["release-group"]?.["secondary-types"] || []).length
      && !/\b(live|remixes|karaoke|demo|sessions|interview|greatest|best of|collection)\b/i.test(release.title));
    if (year < 1930 || year > 2026 || !release) continue;
    candidates.push({ year, firstReleaseDate: date, recordingUrl: `https://musicbrainz.org/recording/${recording.id}`, release: release.title, releaseUrl: `https://musicbrainz.org/release/${release.id}` });
  }
  return candidates.sort((a, b) => a.year - b.year)[0];
}
(async () => {
  for (let offset = 0; offset < songs.length; offset += 4) {
    const batch = songs.slice(offset, offset + 4);
    const recordings = await request(batch);
    for (const song of batch) {
      let result = verify(song, recordings);
      if (!result) result = verify(song, await request([song]));
      cache[key(song)] = result || { excluded: true, reason: "No matching official studio recording found in an unrestricted year search" };
      if (!result || result.year !== song.year) console.log(`${song.artist} / ${song.title}: ${song.year} -> ${result?.year || "exclude"}`);
    }
    fs.writeFileSync(cachePath, JSON.stringify(cache));
    console.log(`Years checked: ${Math.min(offset + 4, songs.length)}/${songs.length}`);
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
