// Reproducible, rate-limited import from MusicBrainz recording metadata.
// Review data/sangquiz-expansion-sources.json before accepting a refreshed import.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const os = require("node:os");
const root = path.resolve(__dirname, "..");
const outputPath = path.join(root, "data/sangquiz-expansion-sources.json");
const cachePath = path.join(os.tmpdir(), "wutborg-sangquiz-expansion-cache.json");
const normalize = (value) => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9æø]/g, "");
const songIdentity = (artist, title) => `${normalize(artist)}:${normalize(title.replace(/&/g, "and").replace(/favourite/gi, "favorite").replace(/½|1\/2/g, "half").replace(/^the /i, "")).replace(/^laughnahalf$/, "laughnhalf").replace(/^comeoncloser$/, "comecloser").replace(/^kidsgowherethelightis$/, "kidsgowherethelightison")}`;
const excludedTitles = new Set([
  songIdentity("Mew", "She Came Home for Christmas"), // Multiple re-recordings; no unambiguous Spotify version in this import.
  songIdentity("Shu-bi-dua", 'Ingen artikler om pladen i "Go"'), // Non-song bonus material.
]);
const groups = [
  [1970, "danish", ["Gasolin'", "Kim Larsen", "Shu-bi-dua", "Sebastian", "Gnags", "Anne Linnet", "Bamses Venner", "Shit & Chanel"]],
  [1980, "danish", ["TV-2", "Gnags", "Kim Larsen", "Anne Linnet", "Thomas Helmig", "Lis Sørensen", "D-A-D", "Rocazino", "Tøsedrengene"]],
  [1990, "danish", ["Dizzy Mizz Lizzy", "Kashmir", "D-A-D", "Love Shop", "Thomas Helmig", "Poul Krebs", "Aqua", "Michael Learns to Rock"]],
  [2000, "danish", ["Nephew", "Kashmir", "Mew", "Saybia", "Carpark North", "Rasmus Seebach", "Medina", "Tim Christensen", "Tina Dickow"]],
  [2010, "danish", ["Rasmus Seebach", "Lukas Graham", "Nephew", "Carpark North", "Tina Dickow", "Alphabeat", "Fallulah", "Tim Christensen"]],
  [1970, "international", ["ABBA", "Queen", "David Bowie", "Fleetwood Mac", "Elton John", "Stevie Wonder"]],
  [1980, "international", ["Madonna", "Michael Jackson", "Prince", "Whitney Houston", "Depeche Mode", "U2", "Queen", "Bon Jovi"]],
  [1990, "international", ["Nirvana", "Oasis", "Blur", "Radiohead", "Green Day", "Mariah Carey", "Spice Girls", "Backstreet Boys"]],
  [2000, "international", ["Coldplay", "The Killers", "Beyoncé", "Rihanna", "Britney Spears", "Alicia Keys", "Linkin Park", "Lady Gaga"]],
  [2010, "international", ["Adele", "Ed Sheeran", "Taylor Swift", "Bruno Mars", "Dua Lipa", "The Weeknd"]],
];
const rockArtists = new Set(["Gasolin'", "Shu-bi-dua", "Gnags", "TV-2", "D-A-D", "Dizzy Mizz Lizzy", "Kashmir", "Love Shop", "Nephew", "Mew", "Saybia", "Carpark North", "Tim Christensen", "Queen", "David Bowie", "Fleetwood Mac", "U2", "Bon Jovi", "Nirvana", "Oasis", "Blur", "Radiohead", "Green Day", "Coldplay", "The Killers", "Linkin Park"].map(normalize));
// Artist identities matched against known recordings in the existing catalog.
const artistIds = {
  Sebastian: "7d609f99-feea-4782-b7ce-ee278324e738",
  Kashmir: "cd08ab5e-a823-4985-975d-3a3438b9b5d5",
  Aqua: "a1ed5e33-22ff-4e7d-a457-42f4309e135f",
  Nephew: "28a3f637-1939-4f9d-8679-306067df5970",
  Mew: "fa927f59-d443-418a-b741-e557208aaf09",
  Medina: "9bfda160-0f1d-4a90-aaa6-b7142ac0dd55",
  Nirvana: "5b11f4ce-a62d-471e-81fc-a69a8278c7da",
  "The Killers": "95e1ead9-4d31-4808-a7ac-32c3614c116b",
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await sleep(1200 + attempt * 2000);
    const response = await fetch(url, { headers: { "User-Agent": "WutborgSongCatalog/1.0 (https://wutborg.dk)" }, signal: AbortSignal.timeout(30000) });
    if ([429, 502, 503, 504].includes(response.status)) continue;
    if (!response.ok) throw new Error(`MusicBrainz: ${response.status}`);
    return response.json();
  }
  throw new Error("MusicBrainz remained unavailable after retries");
}

(async () => {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "js/sangquiz-data.js"), "utf8"), context);
  const existing = context.window.SANGQUIZ_SONGS.filter((song) => !song.tags.includes("origin-expansion"));
  const seen = new Set(existing.map((song) => songIdentity(song.artist, song.title)));
  const seenRecordings = new Set();
  const yearsPath = path.join(os.tmpdir(), "wutborg-sangquiz-song-years.json");
  const yearChecks = fs.existsSync(yearsPath) ? JSON.parse(fs.readFileSync(yearsPath, "utf8")) : {};
  if (fs.existsSync(outputPath)) {
    for (const song of JSON.parse(fs.readFileSync(outputPath, "utf8")).imports || []) {
      if (song.yearChecked) yearChecks[`${song.artistId}:${normalize(song.title)}`] ||= song;
    }
  }
  const imports = [];
  const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, "utf8")) : {};
  for (const [decade, origin, artists] of groups) {
    const key = `${decade}-${origin}-studio-v3`;
    const aliases = new Map(artists.map((artist) => [normalize(artist), artist]));
    if (!cache[key]) {
      const candidates = [...(cache[`${decade}-${origin}-studio-v2`] || [])];
      for (const requestedArtist of artists) {
        if (candidates.some((song) => song.artist === requestedArtist)) continue;
        const artistQuery = artistIds[requestedArtist] ? `arid:${artistIds[requestedArtist]}` : `artist:"${requestedArtist}"`;
        const query = `${artistQuery} AND firstreleasedate:[${decade} TO ${decade + 9}]`;
        for (let offset = 0; offset < 300; offset += 100) {
        const url = `https://musicbrainz.org/ws/2/recording/?fmt=json&limit=100&offset=${offset}&query=${encodeURIComponent(query)}`;
        const result = await request(url);
        for (const recording of result.recordings || []) {
          const credits = recording["artist-credit"] || [];
          const artist = credits.length === 1 && normalize(credits[0].artist.name) === normalize(requestedArtist) && aliases.get(normalize(credits[0].artist.name));
          const date = recording["first-release-date"] || "";
          const year = Number(date.slice(0, 4));
          const title = recording.title;
          const version = `${title} ${recording.disambiguation || ""}`;
          const official = (recording.releases || []).find((release) => release.status === "Official"
            && !/\b(live|remixes|karaoke|demo|sessions|interview|greatest|best of|collection)\b/i.test(release.title)
            && ["Album", "Single", "EP"].includes(release["release-group"]?.["primary-type"])
            && !(release["release-group"]?.["secondary-types"] || []).length
            && (!release["artist-credit"] || (release["artist-credit"].length === 1 && release["artist-credit"][0].artist.id === credits[0]?.artist.id))
            && Number(release.date?.slice(0, 4)) >= year && Number(release.date?.slice(0, 4)) <= year + 2);
          if (!artist || year < decade || year > decade + 9 || !official || recording.length < 90000 || recording.video
            || /\b(live|remix|mix|demo|instrumental|karaoke|acoustic|session|edit|version|rehearsal|intro|outro|interview|shuffle|altered|behind the scenes|present|commentary|speech)\b/i.test(version)) continue;
          candidates.push({ title, artist, artistId: credits[0].artist.id, year, firstReleaseDate: date, recordingUrl: `https://musicbrainz.org/recording/${recording.id}`, release: official.title, releaseUrl: `https://musicbrainz.org/release/${official.id}` });
        }
        if (offset + 100 >= result.count || new Set(candidates.filter((song) => song.artist === requestedArtist).map((song) => normalize(song.title))).size >= 20) break;
        }
        console.log(`${key}: ${requestedArtist}, ${candidates.length} eligible recordings so far`);
      }
      cache[key] = candidates;
      fs.writeFileSync(cachePath, JSON.stringify(cache));
    }
    const candidates = cache[key].map((song) => {
      const check = yearChecks[`${song.artistId}:${normalize(song.title)}`];
      return check?.year ? { ...song, year: check.year, firstReleaseDate: check.firstReleaseDate, recordingUrl: check.recordingUrl, releaseUrl: check.releaseUrl, release: check.release, yearChecked: true } : { ...song, excluded: check?.excluded };
    }).filter((song) => !song.excluded && !excludedTitles.has(songIdentity(song.artist, song.title))
      && song.year >= decade && song.year < decade + 10
      && (!artistIds[song.artist] || song.artistId === artistIds[song.artist])
      && !/[()[\]]|mashup|\b(dub|refix|radio|interlude|medley|overture|padapella|excerpt|photo gallery|exclusive access|web-based)\b/i.test(song.title)
      && !/\b(acoustic|live|interview|remixes)\b/i.test(song.release))
      .sort((a, b) => a.year - b.year || a.title.localeCompare(b.title, "da"));
    const buckets = artists.map((artist) => candidates.filter((song) => song.artist === artist));
    const needed = Math.max(0, 110 - existing.filter((song) => song.category === origin && song.year >= decade && song.year < decade + 10).length);
    let added = 0;
    for (let round = 0; round < 30 && added < needed; round++) {
      for (const bucket of buckets) {
        let song;
        while (bucket.length) {
          const next = bucket.shift();
          const identity = songIdentity(next.artist, next.title);
          if (seen.has(identity) || seenRecordings.has(next.recordingUrl)) continue;
          seen.add(identity);
          seenRecordings.add(next.recordingUrl);
          song = next;
          break;
        }
        if (!song) continue;
        imports.push({ ...song, origin, rock: rockArtists.has(normalize(song.artist)) });
        if (++added === needed) break;
      }
    }
    console.log(`${key}: added ${added}/${needed}`);
    if (added < needed) throw new Error(`Insufficient verified candidates for ${key}`);
  }
  const rows = imports.map((song) => [song.title, song.artist, song.year, [song.origin === "danish" ? "da" : "international", ...(song.rock ? ["rock"] : [])]]);
  const file = path.join(root, "js/sangquiz-data.js");
  let source = fs.readFileSync(file, "utf8");
  const declaration = `  // First-release recording metadata: data/sangquiz-expansion-sources.json\n  const originExpansionSongs = [\n${rows.map((row) => `    ${JSON.stringify(row)},`).join("\n")}\n  ];\n\n`;
  if (source.includes("const originExpansionSongs =")) source = source.replace(/  \/\/ First-release recording metadata:[\s\S]*?\n  function slugify/, declaration + "  function slugify");
  else source = source.replace("  function slugify", declaration + "  function slugify");
  if (!source.includes('originExpansionSongs.map')) source = source.replace('    categoryExpansionSongs.map', '    originExpansionSongs.map((song) => expandedSong(song, ["origin-expansion"])),\n    categoryExpansionSongs.map');
  fs.writeFileSync(file, source);
  fs.writeFileSync(outputPath, JSON.stringify({ checkedAt: new Date().toISOString(), imports }, null, 2) + "\n");
  console.log(`Added ${imports.length} unique studio recordings.`);
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
