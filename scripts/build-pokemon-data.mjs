import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const API = "https://pokeapi.co/api/v2";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = globalThis.POKEMON_OUTPUT_DIRECTORY || path.join(root, "data");
const VERSION_GROUP = "firered-leafgreen";
const MAX_POKEMON_ID = 151;
const CONCURRENCY = 6;

const physicalTypes = new Set([
  "normal", "fighting", "flying", "poison", "ground",
  "rock", "bug", "ghost", "steel"
]);
const specialTypes = new Set([
  "fire", "water", "grass", "electric", "psychic", "ice", "dragon", "dark"
]);
const typeColors = {
  normal: "#a8a878", fire: "#ef7a36", water: "#4e87d9", electric: "#e4b92f",
  grass: "#68a84f", ice: "#76c5c8", fighting: "#b83a32", poison: "#984b9e",
  ground: "#c9a95d", flying: "#8b7fd0", psychic: "#e65d87", bug: "#94a52b",
  rock: "#aa9138", ghost: "#66558a", dragon: "#6849c7", dark: "#62534b",
  steel: "#9ca0b4"
};

const specialDisplayNames = {
  "farfetchd": "Farfetch'd",
  "mr-mime": "Mr. Mime"
};
const knownMoveFallbacks = {
  "karate-chop": {
    name: "Karate Chop",
    type: "fighting",
    power: 50,
    accuracy: 100,
    pp: 25,
    priority: 0,
    categoryGen3: "physical",
    effect: null
  }
};

const manualAvailability = {
  1: { methods: ["starter"], locations: ["Pallet Town"] },
  4: { methods: ["starter"], locations: ["Pallet Town"] },
  7: { methods: ["starter"], locations: ["Pallet Town"] },
  26: { methods: ["trade"], locations: ["Trade evolution"] },
  36: { methods: ["stone"], locations: ["Moon Stone evolution"] },
  40: { methods: ["stone"], locations: ["Moon Stone evolution"] },
  45: { methods: ["stone"], locations: ["Leaf Stone evolution"] },
  59: { methods: ["stone"], locations: ["Fire Stone evolution"] },
  62: { methods: ["stone"], locations: ["Water Stone evolution"] },
  65: { methods: ["trade"], locations: ["Trade evolution"] },
  68: { methods: ["trade"], locations: ["Trade evolution"] },
  71: { methods: ["stone"], locations: ["Leaf Stone evolution"] },
  76: { methods: ["trade"], locations: ["Trade evolution"] },
  91: { methods: ["stone"], locations: ["Water Stone evolution"] },
  94: { methods: ["trade"], locations: ["Trade evolution"] },
  101: { methods: ["static"], locations: ["Power Plant"] },
  103: { methods: ["stone"], locations: ["Leaf Stone evolution"] },
  106: { methods: ["gift"], locations: ["Saffron City Fighting Dojo"] },
  107: { methods: ["gift"], locations: ["Saffron City Fighting Dojo"] },
  121: { methods: ["stone"], locations: ["Water Stone evolution"] },
  129: { methods: ["gift", "wild"], locations: ["Route 4 Pokémon Center"] },
  131: { methods: ["gift"], locations: ["Silph Co."] },
  133: { methods: ["gift"], locations: ["Celadon Mansion"] },
  134: { methods: ["stone"], locations: ["Water Stone evolution"] },
  135: { methods: ["stone"], locations: ["Thunder Stone evolution"] },
  136: { methods: ["stone"], locations: ["Fire Stone evolution"] },
  137: { methods: ["gift"], locations: ["Celadon Game Corner"] },
  138: { methods: ["fossil"], locations: ["Cinnabar Lab"] },
  139: { methods: ["fossil"], locations: ["Cinnabar Lab"] },
  140: { methods: ["fossil"], locations: ["Cinnabar Lab"] },
  141: { methods: ["fossil"], locations: ["Cinnabar Lab"] },
  142: { methods: ["fossil"], locations: ["Cinnabar Lab"] },
  143: { methods: ["static"], locations: ["Routes 12 and 16"] },
  144: { methods: ["legendary", "static"], locations: ["Seafoam Islands"] },
  145: { methods: ["legendary", "static"], locations: ["Power Plant"] },
  146: { methods: ["legendary", "static"], locations: ["Mt. Ember"] },
  150: { methods: ["legendary", "static"], locations: ["Cerulean Cave"] },
  151: { methods: ["event"], locations: ["Special event"] }
};

const leafGreenTradeIds = new Set([
  27, 28, 37, 38, 69, 70, 71, 79, 80, 120, 121, 126, 127
]);
const fireRedExclusiveIds = new Set([
  23, 24, 43, 44, 45, 54, 55, 58, 59, 90, 91, 123, 125
]);

function displayName(value) {
  if (specialDisplayNames[value]) return specialDisplayNames[value];
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function locationName(value) {
  return value
    .replace(/-area$/, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function fetchJson(url, attempt = 1) {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "wutborg-monster-battle-data-builder/1.0" }
    });
    if (response.ok) return response.json();
    if (attempt < 7 && (response.status === 429 || response.status >= 500)) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
      return fetchJson(url, attempt + 1);
    }
    throw new Error(`PokéAPI request failed (${response.status}): ${url}`);
  } catch (error) {
    if (attempt < 7) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
      return fetchJson(url, attempt + 1);
    }
    throw error;
  }
}

async function mapWithConcurrency(items, worker, concurrency = CONCURRENCY) {
  const results = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, run));
  return results;
}

function moveCategory(type, power) {
  if (!power) return "status";
  if (physicalTypes.has(type)) return "physical";
  if (specialTypes.has(type)) return "special";
  return "status";
}

function statusEffect(move) {
  const status = {
    poison: "poison",
    burn: "burn",
    paralysis: "paralysis",
    sleep: "sleep",
    freeze: "freeze"
  }[move.meta?.ailment?.name];
  if (!status) return null;
  return {
    status,
    chance: move.meta.ailment_chance || move.effect_chance || 100
  };
}

function compactMove(move) {
  const effect = statusEffect(move);
  const result = {
    name: displayName(move.name),
    type: move.type.name,
    power: move.power,
    accuracy: move.accuracy ?? 100,
    pp: move.pp ?? 20,
    priority: move.priority ?? 0,
    categoryGen3: moveCategory(move.type.name, move.power),
    effect
  };
  return result;
}

function availabilityFor(pokemon, encounters) {
  const locations = encounters
    .filter((entry) => entry.version_details.some((detail) => detail.version.name === "firered"))
    .map((entry) => locationName(entry.location_area.name));
  const manual = manualAvailability[pokemon.id];
  const methods = new Set(locations.length ? ["wild"] : []);

  for (const method of manual?.methods || []) methods.add(method);
  if (leafGreenTradeIds.has(pokemon.id)) {
    methods.clear();
    methods.add("trade");
    locations.splice(0, locations.length, "Trade from LeafGreen");
  }
  if (!methods.size) methods.add("trade");

  return {
    fireRed: true,
    leafGreen: !fireRedExclusiveIds.has(pokemon.id),
    methods: [...methods],
    locations: [...new Set([...(manual?.locations || []), ...locations])].slice(0, 8),
    source: manual || leafGreenTradeIds.has(pokemon.id)
      ? "manual-curated"
      : "pokeapi-cache"
  };
}

async function build() {
  console.log("Fetching Kanto Pokémon and FireRed encounter data...");
  const ids = Array.from({ length: MAX_POKEMON_ID }, (_, index) => index + 1);
  const rawPokemon = await mapWithConcurrency(ids, async (id) => {
    const [pokemon, encounters] = await Promise.all([
      fetchJson(`${API}/pokemon/${id}`),
      fetchJson(`${API}/pokemon/${id}/encounters`)
    ]);
    return { pokemon, encounters };
  });

  const moveUrls = new Set();
  const moveNames = new Map();
  const learnsets = new Map();
  for (const { pokemon } of rawPokemon) {
    const entries = [];
    for (const learnedMove of pokemon.moves) {
      for (const detail of learnedMove.version_group_details) {
        if (
          detail.version_group.name === VERSION_GROUP &&
          detail.move_learn_method.name === "level-up"
        ) {
          entries.push({
            level: detail.level_learned_at || 1,
            url: learnedMove.move.url,
            key: learnedMove.move.name
          });
          moveUrls.add(learnedMove.move.url);
          moveNames.set(learnedMove.move.url, learnedMove.move.name);
        }
      }
    }
    learnsets.set(pokemon.id, entries);
  }

  console.log(`Fetching ${moveUrls.size} move definitions...`);
  const moveEntries = await mapWithConcurrency(
    [...moveUrls],
    async (url) => {
      try {
        return [url, compactMove(await fetchJson(url))];
      } catch (error) {
        const name = moveNames.get(url) || "tackle";
        console.warn(`Using fallback data for ${name}: ${error.message}`);
        return [url, knownMoveFallbacks[name] || {
          name: displayName(name),
          type: "normal",
          power: 40,
          accuracy: 100,
          pp: 20,
          priority: 0,
          categoryGen3: "physical",
          effect: null
        }];
      }
    }
  );
  const moveMap = new Map(moveEntries);

  const data = rawPokemon.map(({ pokemon, encounters }) => {
    const movesByLevel = (learnsets.get(pokemon.id) || [])
      .map((entry) => ({ level: entry.level, ...moveMap.get(entry.url) }))
      .filter((move) => move.power || move.effect)
      .sort((a, b) => a.level - b.level);
    const battleMoves = [...movesByLevel]
      .filter((move) => move.level <= 50)
      .reverse()
      .filter((move, index, all) =>
        all.findIndex((candidate) => candidate.name === move.name) === index
      )
      .slice(0, 4)
      .map(({ level, ...move }) => move);
    const stats = Object.fromEntries(
      pokemon.stats.map((entry) => [entry.stat.name, entry.base_stat])
    );
    const types = pokemon.types
      .sort((a, b) => a.slot - b.slot)
      .map((entry) => entry.type.name);

    return {
      id: pokemon.id,
      name: pokemon.name,
      displayName: displayName(pokemon.name),
      types,
      baseStats: {
        hp: stats.hp,
        attack: stats.attack,
        defense: stats.defense,
        specialAttack: stats["special-attack"],
        specialDefense: stats["special-defense"],
        speed: stats.speed
      },
      availability: availabilityFor(pokemon, encounters),
      movesByLevel,
      battleMoves,
      sprite: {
        mode: "original-placeholder",
        front: null,
        back: null,
        cssColorHint: typeColors[types[0]] || typeColors.normal,
        shape: pokemon.id % 4
      }
    };
  });

  await mkdir(outputDirectory, { recursive: true });
  const json = `${JSON.stringify(data, null, 2)}\n`;
  const script = `window.POKEMON_FIRERED_DATA = ${JSON.stringify(data)};\n`;
  await Promise.all([
    writeFile(path.join(outputDirectory, "pokemon-firered.json"), json, "utf8"),
    writeFile(path.join(outputDirectory, "pokemon-firered.js"), script, "utf8")
  ]);
  console.log(`Wrote ${data.length} Pokémon to data/pokemon-firered.json and .js`);
}

await build();
