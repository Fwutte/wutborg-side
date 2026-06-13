(function (global) {
  "use strict";

  const spriteRoot = "https://raw.githubusercontent.com/PokeAPI/sprites/master/" +
    "sprites/pokemon/versions/generation-iii/firered-leafgreen";
  const localFallbacks = {
    1: "assets/pokemon/001-bulbasaur.svg",
    2: "assets/pokemon/002-ivysaur.svg",
    3: "assets/pokemon/003-venusaur.svg",
    4: "assets/pokemon/004-charmander.svg",
    5: "assets/pokemon/005-charmeleon.svg",
    6: "assets/pokemon/006-charizard.svg",
    7: "assets/pokemon/007-squirtle.svg",
    8: "assets/pokemon/008-wartortle.svg",
    9: "assets/pokemon/009-blastoise.svg",
    10: "assets/pokemon/010-caterpie.svg"
  };

  global.PokemonArtwork = Object.freeze(Object.fromEntries(
    Array.from({ length: 151 }, (_, index) => {
      const id = index + 1;
      return [id, Object.freeze({
        front: `${spriteRoot}/${id}.png`,
        back: `${spriteRoot}/back/${id}.png`,
        fallback: localFallbacks[id] || null
      })];
    })
  ));
})(typeof window !== "undefined" ? window : globalThis);
