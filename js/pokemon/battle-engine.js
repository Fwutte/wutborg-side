(function (global) {
  "use strict";

  const { getTypeEffectiveness } = global.PokemonTypeChart;
  const PHYSICAL_TYPES = new Set([
    "normal", "fighting", "flying", "poison", "ground",
    "rock", "bug", "ghost", "steel"
  ]);
  const SPECIAL_TYPES = new Set([
    "fire", "water", "grass", "electric", "psychic", "ice", "dragon", "dark"
  ]);
  const DEFAULT_IV = 15;
  const FALLBACK_MOVES = [
    { name: "Tackle", type: "normal", power: 35, accuracy: 95, pp: 35, priority: 0 },
    { name: "Scratch", type: "normal", power: 40, accuracy: 100, pp: 35, priority: 0 },
    { name: "Pound", type: "normal", power: 40, accuracy: 100, pp: 35, priority: 0 },
    { name: "Quick Attack", type: "normal", power: 40, accuracy: 100, pp: 30, priority: 1 }
  ];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getMoveCategory(move) {
    if (!move || !Number.isFinite(move.power) || move.power <= 0) return "status";
    if (PHYSICAL_TYPES.has(move.type)) return "physical";
    if (SPECIAL_TYPES.has(move.type)) return "special";
    return move.categoryGen3 || "status";
  }

  function normalizeMove(move) {
    const normalized = {
      name: move?.name || "Tackle",
      type: move?.type || "normal",
      power: Number.isFinite(move?.power) ? move.power : null,
      accuracy: Number.isFinite(move?.accuracy) ? move.accuracy : 100,
      pp: Number.isFinite(move?.pp) ? move.pp : 20,
      priority: Number.isFinite(move?.priority) ? move.priority : 0,
      effect: move?.effect || null
    };
    normalized.categoryGen3 = getMoveCategory(normalized);
    return normalized;
  }

  function calculateStat(baseStat, level, options = {}) {
    const iv = options.iv ?? DEFAULT_IV;
    const ev = options.ev ?? 0;
    const nature = options.nature ?? 1;
    return Math.floor(
      (Math.floor(((2 * baseStat + iv + Math.floor(ev / 4)) * level) / 100) + 5) *
      nature
    );
  }

  function calculateHp(baseHp, level, options = {}) {
    const iv = options.iv ?? DEFAULT_IV;
    const ev = options.ev ?? 0;
    return Math.floor(((2 * baseHp + iv + Math.floor(ev / 4)) * level) / 100) +
      level + 10;
  }

  function selectBattleMoves(pokemon, level) {
    const learnset = (pokemon.movesByLevel || [])
      .filter((move) => (move.level ?? 1) <= level)
      .sort((a, b) => (b.level ?? 1) - (a.level ?? 1));
    const selected = [];
    const seen = new Set();

    for (const move of learnset) {
      const key = (move.name || "").toLowerCase();
      if (!key || seen.has(key)) continue;
      selected.push(normalizeMove(move));
      seen.add(key);
      if (selected.length === 4) break;
    }

    for (const move of pokemon.battleMoves || []) {
      const key = (move.name || "").toLowerCase();
      if (seen.has(key)) continue;
      selected.push(normalizeMove(move));
      seen.add(key);
      if (selected.length === 4) break;
    }

    for (const move of FALLBACK_MOVES) {
      const key = move.name.toLowerCase();
      if (seen.has(key)) continue;
      selected.push(normalizeMove(move));
      seen.add(key);
      if (selected.length === 4) break;
    }

    return selected.slice(0, 4);
  }

  function createCombatant(pokemon, level, options = {}) {
    const safeLevel = clamp(Number(level) || 50, 5, 100);
    const base = pokemon.baseStats;
    const maxHp = calculateHp(base.hp, safeLevel, options);
    return {
      id: pokemon.id,
      name: pokemon.name,
      displayName: pokemon.displayName,
      types: [...pokemon.types],
      level: safeLevel,
      maxHp,
      hp: maxHp,
      stats: {
        attack: calculateStat(base.attack, safeLevel, options),
        defense: calculateStat(base.defense, safeLevel, options),
        specialAttack: calculateStat(base.specialAttack, safeLevel, options),
        specialDefense: calculateStat(base.specialDefense, safeLevel, options),
        speed: calculateStat(base.speed, safeLevel, options)
      },
      status: null,
      statusTurns: 0,
      fainted: false,
      moves: selectBattleMoves(pokemon, safeLevel).map((move) => ({
        ...move,
        currentPp: move.pp
      })),
      sprite: pokemon.sprite || null
    };
  }

  function canUseMove(combatant, moveIndex) {
    const move = combatant?.moves?.[moveIndex];
    return Boolean(move && move.currentPp > 0 && !combatant.fainted && combatant.hp > 0);
  }

  function calculateDamage(attacker, defender, rawMove, random = Math.random, options = {}) {
    const move = normalizeMove(rawMove);
    const category = getMoveCategory(move);
    const effectiveness = getTypeEffectiveness(move.type, defender.types);

    if (category === "status" || effectiveness === 0) {
      return {
        damage: 0,
        category,
        effectiveness,
        critical: false,
        stab: attacker.types.includes(move.type) ? 1.5 : 1,
        variance: 1
      };
    }

    const attackStat = category === "physical"
      ? attacker.stats.attack
      : attacker.stats.specialAttack;
    const defenseStat = Math.max(
      1,
      category === "physical" ? defender.stats.defense : defender.stats.specialDefense
    );
    const baseDamage = Math.floor(
      Math.floor((((2 * attacker.level / 5 + 2) * move.power * attackStat / defenseStat) / 50)) +
      2
    );
    const stab = attacker.types.includes(move.type) ? 1.5 : 1;
    const critical = options.forceCritical ?? (random() < 1 / 16);
    const variance = options.variance ?? (0.85 + random() * 0.15);
    const burnModifier = attacker.status === "burn" && category === "physical" ? 0.5 : 1;
    const modifier = stab * effectiveness * (critical ? 2 : 1) * variance * burnModifier;

    return {
      damage: Math.max(1, Math.floor(baseDamage * modifier)),
      category,
      effectiveness,
      critical,
      stab,
      variance,
      burnModifier,
      baseDamage
    };
  }

  function expectedDamage(attacker, defender, move) {
    return calculateDamage(attacker, defender, move, () => 0.5, {
      forceCritical: false,
      variance: 0.925
    }).damage;
  }

  function effectiveSpeed(combatant) {
    return combatant.status === "paralysis"
      ? Math.max(1, Math.floor(combatant.stats.speed / 2))
      : combatant.stats.speed;
  }

  function determineTurnOrder(first, firstMove, second, secondMove, random = Math.random) {
    const firstPriority = firstMove?.priority ?? 0;
    const secondPriority = secondMove?.priority ?? 0;
    if (firstPriority !== secondPriority) {
      return firstPriority > secondPriority ? [first, second] : [second, first];
    }

    const firstSpeed = effectiveSpeed(first);
    const secondSpeed = effectiveSpeed(second);
    if (firstSpeed !== secondSpeed) {
      return firstSpeed > secondSpeed ? [first, second] : [second, first];
    }
    return random() < 0.5 ? [first, second] : [second, first];
  }

  function weightedPick(items, weights, random = Math.random) {
    const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
    if (!total) return items[0];
    let cursor = random() * total;
    for (let index = 0; index < items.length; index += 1) {
      cursor -= Math.max(0, weights[index]);
      if (cursor <= 0) return items[index];
    }
    return items[items.length - 1];
  }

  function chooseAiMove(attacker, defender, difficulty = "normal", random = Math.random) {
    const available = attacker.moves
      .map((move, index) => ({ move, index }))
      .filter(({ move }) => move.currentPp > 0);
    if (!available.length) return -1;

    if (difficulty === "easy") {
      return available[Math.floor(random() * available.length)].index;
    }

    if (difficulty === "smart") {
      if (random() < 0.15) {
        return available[Math.floor(random() * available.length)].index;
      }
      return available
        .map((entry) => ({
          ...entry,
          score: expectedDamage(attacker, defender, entry.move) +
            (entry.move.effect && !defender.status ? 8 : 0)
        }))
        .sort((a, b) => b.score - a.score)[0].index;
    }

    const weights = available.map(({ move }) => {
      const effectiveness = getTypeEffectiveness(move.type, defender.types);
      const damage = expectedDamage(attacker, defender, move);
      const statusBonus = move.effect && !defender.status ? 5 : 0;
      return Math.max(0.2, damage + statusBonus) *
        (effectiveness >= 2 ? 3.5 : effectiveness === 0 ? 0.05 : 1);
    });
    return weightedPick(available, weights, random).index;
  }

  function statusLabel(status) {
    return {
      poison: "forgiftet",
      burn: "brændt",
      paralysis: "lammet",
      sleep: "faldt i søvn",
      freeze: "frosset"
    }[status] || status;
  }

  function checkActionStatus(combatant, random) {
    if (combatant.status === "paralysis" && random() < 0.25) {
      return `${combatant.displayName} er lammet og kan ikke angribe!`;
    }
    if (combatant.status === "sleep") {
      combatant.statusTurns -= 1;
      if (combatant.statusTurns <= 0) {
        combatant.status = null;
        return { recovered: true, message: `${combatant.displayName} vågnede!` };
      }
      return `${combatant.displayName} sover stadig.`;
    }
    if (combatant.status === "freeze") {
      if (random() < 0.2) {
        combatant.status = null;
        return { recovered: true, message: `${combatant.displayName} tøede op!` };
      }
      return `${combatant.displayName} er frosset fast!`;
    }
    return null;
  }

  function applyStatus(target, effect, random) {
    if (!effect || target.status || target.fainted) return null;
    const chance = effect.chance ?? 100;
    if (random() * 100 >= chance) return null;

    target.status = effect.status;
    target.statusTurns = effect.status === "sleep"
      ? 1 + Math.floor(random() * 3)
      : 0;
    return `${target.displayName} blev ${statusLabel(effect.status)}!`;
  }

  function resolveMove(attacker, defender, moveIndex, random = Math.random) {
    const move = attacker.moves[moveIndex];
    const event = {
      kind: "move",
      actorId: attacker.id,
      targetId: defender.id,
      moveIndex,
      moveName: move?.name || "",
      moveType: move?.type || "normal",
      category: move ? getMoveCategory(move) : "status",
      logs: []
    };

    if (!canUseMove(attacker, moveIndex)) {
      event.kind = "skip";
      event.logs.push(`${attacker.displayName} kan ikke bruge det move.`);
      return event;
    }

    const statusResult = checkActionStatus(attacker, random);
    if (statusResult) {
      if (typeof statusResult === "string") {
        event.kind = "skip";
        event.logs.push(statusResult);
        return event;
      }
      event.logs.push(statusResult.message);
    }

    move.currentPp -= 1;
    event.logs.push(`${attacker.displayName} used ${move.name}!`);

    if (random() * 100 >= move.accuracy) {
      event.missed = true;
      event.logs.push("Angrebet ramte ved siden af!");
      return event;
    }

    const damageResult = calculateDamage(attacker, defender, move, random);
    Object.assign(event, damageResult);

    if (damageResult.effectiveness === 0) {
      event.logs.push(`Det påvirker ikke ${defender.displayName}.`);
      return event;
    }

    if (damageResult.damage > 0) {
      defender.hp = Math.max(0, defender.hp - damageResult.damage);
      defender.fainted = defender.hp === 0;
      event.targetHp = defender.hp;
      event.logs.push(`${defender.displayName} mistede ${damageResult.damage} HP!`);
      if (damageResult.effectiveness > 1) event.logs.push("Det er super effektivt!");
      if (damageResult.effectiveness < 1) event.logs.push("Det er ikke særlig effektivt.");
      if (damageResult.critical) event.logs.push("Et kritisk hit!");
    }

    const statusMessage = applyStatus(defender, move.effect, random);
    if (statusMessage) {
      event.statusApplied = defender.status;
      event.logs.push(statusMessage);
    }

    if (defender.fainted) {
      event.fainted = true;
      event.logs.push(`${defender.displayName} besvimede!`);
    }
    return event;
  }

  function applyEndTurnStatus(combatant) {
    if (combatant.fainted || !["poison", "burn"].includes(combatant.status)) return null;
    const damage = Math.max(1, Math.floor(combatant.maxHp / 8));
    combatant.hp = Math.max(0, combatant.hp - damage);
    combatant.fainted = combatant.hp === 0;
    return {
      kind: "status",
      targetId: combatant.id,
      status: combatant.status,
      damage,
      targetHp: combatant.hp,
      fainted: combatant.fainted,
      logs: [
        `${combatant.displayName} tager ${damage} skade fra ${combatant.status === "burn" ? "forbrænding" : "gift"}!`,
        ...(combatant.fainted ? [`${combatant.displayName} besvimede!`] : [])
      ]
    };
  }

  function cloneCombatant(combatant) {
    return {
      ...combatant,
      types: [...combatant.types],
      stats: { ...combatant.stats },
      moves: combatant.moves.map((move) => ({ ...move, effect: move.effect ? { ...move.effect } : null }))
    };
  }

  function resolveTurn(state, playerMoveIndex, options = {}) {
    const random = options.random || Math.random;
    const next = {
      ...state,
      player: cloneCombatant(state.player),
      opponent: cloneCombatant(state.opponent),
      turn: (state.turn || 0) + 1,
      events: []
    };
    const opponentMoveIndex = options.opponentMoveIndex ??
      chooseAiMove(next.opponent, next.player, state.difficulty || "normal", random);
    const playerMove = next.player.moves[playerMoveIndex];
    const opponentMove = next.opponent.moves[opponentMoveIndex];
    const order = determineTurnOrder(
      next.player,
      playerMove,
      next.opponent,
      opponentMove,
      random
    );

    for (const attacker of order) {
      const defender = attacker === next.player ? next.opponent : next.player;
      if (attacker.fainted || defender.fainted) continue;
      const moveIndex = attacker === next.player ? playerMoveIndex : opponentMoveIndex;
      const event = resolveMove(attacker, defender, moveIndex, random);
      event.actorSide = attacker === next.player ? "player" : "opponent";
      event.targetSide = defender === next.player ? "player" : "opponent";
      next.events.push(event);
    }

    for (const combatant of [next.player, next.opponent]) {
      const statusEvent = applyEndTurnStatus(combatant);
      if (statusEvent) {
        statusEvent.targetSide = combatant === next.player ? "player" : "opponent";
        next.events.push(statusEvent);
      }
    }

    if (next.player.fainted || next.opponent.fainted) {
      next.finished = true;
      next.winner = next.player.fainted ? "opponent" : "player";
    }

    return next;
  }

  global.PokemonBattleEngine = {
    DEFAULT_IV,
    PHYSICAL_TYPES,
    SPECIAL_TYPES,
    FALLBACK_MOVES,
    getMoveCategory,
    normalizeMove,
    calculateStat,
    calculateHp,
    selectBattleMoves,
    createCombatant,
    canUseMove,
    calculateDamage,
    expectedDamage,
    effectiveSpeed,
    determineTurnOrder,
    chooseAiMove,
    resolveMove,
    applyEndTurnStatus,
    resolveTurn
  };
})(typeof window !== "undefined" ? window : globalThis);
