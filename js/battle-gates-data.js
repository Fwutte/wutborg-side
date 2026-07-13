(() => {
  "use strict";

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const STARTING_ARMY = 24;
  const UNIT_TYPES = {
    soldier: { name: "Sværdkæmpere", icon: "⚔", color: "#3288d8" },
    archer: { name: "Bueskytter", icon: "➶", color: "#5cc8a1" },
    shield: { name: "Skjoldbærere", icon: "◆", color: "#7278d7" },
    giant: { name: "Kæmper", icon: "♜", color: "#e8904d" },
  };

  const LEVEL_NAMES = [
    "Porten ved engen", "Den røde tribune", "Stenvejen", "Vagternes lejr", "Bronzeborgen",
    "Bueskytterdalen", "De delte mure", "Rullestenene", "Mørkets port", "Jernborgen",
    "Skjoldskoven", "Kongens vej", "Flammegraven", "Kæmpernes lejr", "Drageborgen",
    "Det sidste felttog", "De fire faner", "Stormpasset", "Kronens vagter", "Guldborgen",
  ];
  const THEMES = [
    { id: "meadow", name: "Kløvermarken", sky: "#bce6ed", arena: "#842d3c", road: "#888a8d", accent: "#e79a51" },
    { id: "forest", name: "Skovriget", sky: "#9ed2c6", arena: "#315e4d", road: "#747b78", accent: "#d9a64c" },
    { id: "volcano", name: "Ildlandet", sky: "#dda98c", arena: "#6d2934", road: "#696064", accent: "#e05b3f" },
    { id: "frost", name: "Frostfæstet", sky: "#c8e5ef", arena: "#496b84", road: "#82939e", accent: "#65b9dc" },
    { id: "royal", name: "Kronelandet", sky: "#e7d8a7", arena: "#692e63", road: "#756d78", accent: "#e5b948" },
  ];

  function tower(value, options = {}) {
    return { type: "tower", value, label: String(value), hint: options.boss ? "Boss" : "Fjendehær", ...options };
  }
  function bonus(operation, value, options = {}) {
    const symbols = { add: "+", subtract: "−", multiply: "×", divide: "÷" };
    return { type: "bonus", operation, value, label: `${symbols[operation]}${value}`, hint: operation === "multiply" ? "Styrkeport" : operation === "add" ? "Forstærkning" : "Fældeport", ...options };
  }
  function recruit(unit, value, options = {}) {
    return { type: "recruit", unit, value, label: `+${value}`, hint: UNIT_TYPES[unit].name, ...options };
  }
  function hazard(value, hazardType, options = {}) {
    const names = { boulder: "Rullesten", spikes: "Pigge", fire: "Flammegrav" };
    return { type: "hazard", hazardType, value, label: `−${value}`, hint: names[hazardType], ...options };
  }

  function resolveChoice(army, choice, modifiers = {}) {
    const currentArmy = clamp(Math.round(army), 0, 999);
    const armor = clamp(Number(modifiers.armor) || 0, 0, 5);
    const mitigation = Math.min(0.3, armor * 0.06);

    if (choice.type === "tower") {
      const archerSupport = Math.min(0.18, (Number(modifiers.archers) || 0) * 0.015);
      const bossResistance = choice.boss ? 0.02 * (Number(modifiers.giants) || 0) : 0;
      const damage = Math.max(1, Math.round(choice.value * (1 - mitigation - archerSupport - Math.min(0.16, bossResistance))));
      const survivors = currentArmy - damage;
      return {
        army: Math.max(0, survivors), survived: survivors > 0, delta: -damage, damage,
        message: survivors > 0 ? `${choice.value} fjender slået – ${survivors} fortsætter!` : `${choice.value} fjender brød gennem hæren.`,
      };
    }

    if (choice.type === "hazard") {
      const shieldBonus = Math.min(0.25, (Number(modifiers.shields) || 0) * 0.025);
      const damage = Math.max(1, Math.round(choice.value * (1 - mitigation - shieldBonus)));
      const survivors = currentArmy - damage;
      return {
        army: Math.max(0, survivors), survived: survivors > 0, delta: -damage, damage,
        message: survivors > 0 ? `${damage} soldater gik tabt ved ${choice.hint.toLowerCase()}.` : `${choice.hint} stoppede hele hæren.`,
      };
    }

    if (choice.type === "recruit") {
      const nextArmy = clamp(currentArmy + choice.value, 0, 999);
      return { army: nextArmy, survived: true, delta: choice.value, recruited: choice.unit, message: `${choice.value} ${UNIT_TYPES[choice.unit].name.toLowerCase()} slutter sig til hæren!` };
    }

    let nextArmy = currentArmy;
    if (choice.operation === "add") nextArmy += choice.value;
    if (choice.operation === "subtract") nextArmy -= choice.value;
    if (choice.operation === "multiply") nextArmy *= choice.value;
    if (choice.operation === "divide") nextArmy = Math.floor(nextArmy / choice.value);
    nextArmy = clamp(Math.round(nextArmy), 0, 999);
    return {
      army: nextArmy, survived: nextArmy > 0, delta: nextArmy - currentArmy,
      message: choice.operation === "multiply" ? `Hæren vokser til ${nextArmy}!` : choice.operation === "divide" ? `Hæren bliver delt – ${nextArmy} fortsætter.` : `${nextArmy - currentArmy >= 0 ? "+" : ""}${nextArmy - currentArmy} soldater.`,
    };
  }

  function makeSafeChoice(levelNumber, stage, army, isBoss) {
    if (isBoss) return tower(Math.max(8, Math.floor(army * (0.42 + levelNumber * 0.004))), { boss: true, optimal: true });
    const cycle = (stage + levelNumber) % 5;
    if (cycle === 0) return bonus("add", 7 + Math.ceil(levelNumber * 0.7), { optimal: true });
    if (cycle === 1) return tower(Math.max(5, Math.floor(army * 0.22)), { optimal: true });
    if (cycle === 2) return recruit(["archer", "shield", "giant"][Math.floor((levelNumber - 1) / 6) % 3], 5 + Math.ceil(levelNumber / 3), { optimal: true });
    if (cycle === 3) return bonus("multiply", 2, { optimal: true });
    return hazard(Math.max(4, Math.floor(army * 0.16)), ["boulder", "spikes", "fire"][levelNumber % 3], { optimal: true });
  }

  function makeRiskyChoice(levelNumber, stage, army, isBoss) {
    if (isBoss) return tower(army + 12 + levelNumber * 2, { boss: true });
    const cycle = (stage * 2 + levelNumber) % 5;
    if (cycle === 0) return tower(army + 4 + levelNumber);
    if (cycle === 1) return bonus("divide", 2);
    if (cycle === 2) return hazard(Math.max(5, Math.floor(army * 0.48)), ["spikes", "fire", "boulder"][stage % 3]);
    if (cycle === 3) return bonus("subtract", Math.max(7, Math.floor(army * 0.55)));
    return tower(Math.max(army - 2, Math.floor(army * 0.72)));
  }

  function buildLevel(index) {
    const levelNumber = index + 1;
    const bossLevel = levelNumber % 5 === 0;
    const gateCount = 6 + Math.floor(index / 5);
    const startingArmy = STARTING_ARMY + Math.floor(index * 1.4);
    const safeRoute = [];
    const gates = [];
    let optimalArmy = startingArmy;

    for (let stage = 0; stage < gateCount; stage += 1) {
      const isFinalBoss = bossLevel && stage === gateCount - 1;
      const safeSide = (stage * 3 + levelNumber) % 2;
      const safe = makeSafeChoice(levelNumber, stage, optimalArmy, isFinalBoss);
      const risky = makeRiskyChoice(levelNumber, stage, optimalArmy, isFinalBoss);
      const choices = safeSide === 0 ? [safe, risky] : [risky, safe];
      safeRoute.push(safeSide);
      gates.push({ title: isFinalBoss ? `Boss: ${LEVEL_NAMES[index]}` : `Port ${stage + 1}`, choices });
      optimalArmy = resolveChoice(optimalArmy, safe).army;
    }

    return {
      id: levelNumber,
      name: LEVEL_NAMES[index],
      region: THEMES[Math.floor(index / 4)],
      boss: bossLevel,
      startingArmy,
      gates,
      safeRoute,
      parArmy: optimalArmy,
      unlocks: levelNumber === 6 ? "Bueskytter" : levelNumber === 11 ? "Skjoldbærere" : levelNumber === 16 ? "Kæmper" : null,
    };
  }

  const LEVELS = Array.from({ length: 20 }, (_, index) => buildLevel(index));
  const GATES = LEVELS[0].gates;

  function evaluateRoute(route, level = LEVELS[0], modifiers = {}) {
    let army = level.startingArmy + (Number(modifiers.reinforcement) || 0) * 3;
    let won = true;
    const units = { soldier: army, archer: 0, shield: 0, giant: 0 };
    route.forEach((side, index) => {
      if (!won || !level.gates[index]) return;
      const choice = level.gates[index].choices[side];
      const outcome = resolveChoice(army, choice, { ...modifiers, archers: units.archer, shields: units.shield, giants: units.giant });
      army = outcome.army;
      if (outcome.recruited) units[outcome.recruited] += choice.value;
      won = outcome.survived;
    });
    return { army, won: won && route.length >= level.gates.length, units };
  }

  function findBestRoute(level, modifiers = {}) {
    let best = null;
    const possibilities = 2 ** level.gates.length;
    for (let mask = 0; mask < possibilities; mask += 1) {
      const route = level.gates.map((_, index) => (mask >> index) & 1);
      const result = evaluateRoute(route, level, modifiers);
      if (result.won && (!best || result.army > best.army)) best = { ...result, route };
    }
    return best;
  }

  window.WutborgBattleData = { STARTING_ARMY, UNIT_TYPES, LEVELS, GATES, resolveChoice, evaluateRoute, findBestRoute };
})();
