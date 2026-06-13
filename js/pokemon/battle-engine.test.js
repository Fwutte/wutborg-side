(function (global) {
  "use strict";

  const engine = global.PokemonBattleEngine;
  const chart = global.PokemonTypeChart;

  function combatant(overrides = {}) {
    return {
      id: overrides.id ?? 1,
      displayName: overrides.displayName || "Testmon",
      types: overrides.types || ["normal"],
      level: overrides.level || 50,
      maxHp: overrides.maxHp || 150,
      hp: overrides.hp ?? 150,
      stats: {
        attack: 100,
        defense: 100,
        specialAttack: 100,
        specialDefense: 100,
        speed: overrides.speed || 100,
        ...(overrides.stats || {})
      },
      status: overrides.status || null,
      statusTurns: 0,
      fainted: overrides.fainted || false,
      moves: (overrides.moves || []).map((move) => ({
        accuracy: 100,
        pp: 20,
        currentPp: 20,
        priority: 0,
        ...move
      }))
    };
  }

  function move(name, type, power = 50, extras = {}) {
    return { name, type, power, accuracy: 100, pp: 20, priority: 0, ...extras };
  }

  function runBattleEngineTests() {
    const tests = [];
    const test = (name, fn) => tests.push({ name, fn });
    const assert = (condition, message) => {
      if (!condition) throw new Error(message || "Assertion failed");
    };

    test("Electric mod Water er super effective", () => {
      assert(chart.getTypeEffectiveness("electric", ["water"]) === 2);
    });

    test("Electric mod Ground har ingen effekt", () => {
      assert(chart.getTypeEffectiveness("electric", ["ground"]) === 0);
    });

    test("Normal mod Ghost har ingen effekt", () => {
      assert(chart.getTypeEffectiveness("normal", ["ghost"]) === 0);
    });

    test("STAB giver højere damage", () => {
      const target = combatant({ types: ["normal"] });
      const attack = move("Flame", "fire", 60);
      const stab = engine.calculateDamage(
        combatant({ types: ["fire"] }),
        target,
        attack,
        () => 0.5,
        { forceCritical: false, variance: 1 }
      ).damage;
      const noStab = engine.calculateDamage(
        combatant({ types: ["water"] }),
        target,
        attack,
        () => 0.5,
        { forceCritical: false, variance: 1 }
      ).damage;
      assert(stab > noStab, `${stab} should be greater than ${noStab}`);
    });

    test("Hurtigste monster angriber først", () => {
      const fast = combatant({ displayName: "Fast", speed: 120 });
      const slow = combatant({ displayName: "Slow", speed: 60 });
      const order = engine.determineTurnOrder(
        fast, move("Hit", "normal"), slow, move("Hit", "normal"), () => 0.9
      );
      assert(order[0] === fast);
    });

    test("Move med 0 PP kan ikke bruges", () => {
      const actor = combatant({ moves: [move("Empty", "normal", 40, { currentPp: 0 })] });
      assert(!engine.canUseMove(actor, 0));
    });

    test("Et besvimet monster angriber ikke", () => {
      const player = combatant({
        id: 1,
        speed: 120,
        moves: [move("Hit", "normal")]
      });
      const opponent = combatant({
        id: 2,
        hp: 1,
        speed: 20,
        moves: [move("Hit", "normal", 200)]
      });
      const result = engine.resolveTurn(
        { player, opponent, difficulty: "easy", turn: 0 },
        0,
        { opponentMoveIndex: 0, random: () => 0.5 }
      );
      const opponentAttack = result.events.find((event) => event.actorId === 2);
      assert(result.opponent.fainted && !opponentAttack);
    });

    test("Burn halverer fysisk damage", () => {
      const defender = combatant({ types: ["normal"] });
      const physical = move("Strike", "normal", 70);
      const healthy = engine.calculateDamage(
        combatant({ types: ["fighting"] }),
        defender,
        physical,
        () => 0.5,
        { forceCritical: false, variance: 1 }
      ).damage;
      const burned = engine.calculateDamage(
        combatant({ types: ["fighting"], status: "burn" }),
        defender,
        physical,
        () => 0.5,
        { forceCritical: false, variance: 1 }
      ).damage;
      assert(burned < healthy && burned >= Math.floor(healthy / 2) - 1);
    });

    test("Poison reducerer HP efter tur", () => {
      const poisoned = combatant({ status: "poison", maxHp: 160, hp: 160 });
      const event = engine.applyEndTurnStatus(poisoned);
      assert(poisoned.hp === 140 && event.damage === 20);
    });

    test("Normal og Smart AI foretrækker super effective moves", () => {
      const attacker = combatant({
        types: ["electric"],
        moves: [
          move("Thunder", "electric", 60),
          move("Tackle", "normal", 60)
        ]
      });
      const defender = combatant({ types: ["water"] });
      let normalGood = 0;
      let smartGood = 0;
      let seed = 7;
      const random = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
      for (let index = 0; index < 100; index += 1) {
        if (engine.chooseAiMove(attacker, defender, "normal", random) === 0) normalGood += 1;
        if (engine.chooseAiMove(attacker, defender, "smart", random) === 0) smartGood += 1;
      }
      assert(normalGood > 70, `Normal selected the good move ${normalGood} times`);
      assert(smartGood > 75, `Smart selected the good move ${smartGood} times`);
    });

    return tests.map(({ name, fn }) => {
      try {
        fn();
        return { name, passed: true };
      } catch (error) {
        return { name, passed: false, error: error.message };
      }
    });
  }

  global.runBattleEngineTests = runBattleEngineTests;
})(typeof window !== "undefined" ? window : globalThis);
