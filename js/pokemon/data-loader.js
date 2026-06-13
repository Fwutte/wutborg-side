(function (global) {
  "use strict";

  function validatePokemonData(data) {
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Pokémon-datafilen er tom eller ugyldig.");
    }
    return data.filter((pokemon) =>
      pokemon &&
      Number.isFinite(pokemon.id) &&
      pokemon.displayName &&
      Array.isArray(pokemon.types) &&
      pokemon.baseStats
    );
  }

  async function loadPokemonData() {
    if (Array.isArray(global.POKEMON_FIRERED_DATA)) {
      return validatePokemonData(global.POKEMON_FIRERED_DATA);
    }

    try {
      const response = await fetch("data/pokemon-firered.json");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return validatePokemonData(await response.json());
    } catch (error) {
      throw new Error(
        "Pokémon-data kunne ikke indlæses. Prøv at genindlæse siden eller åbn den via en lokal webserver."
      );
    }
  }

  global.PokemonDataLoader = { loadPokemonData, validatePokemonData };
})(typeof window !== "undefined" ? window : globalThis);
