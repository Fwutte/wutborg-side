(function () {
  "use strict";

  const engine = window.PokemonBattleEngine;
  const { TYPES, TYPE_COLORS } = window.PokemonTypeChart;
  const artwork = window.PokemonArtwork || {};
  const storageKey = "wutborg-monster-battle-preferences";
  const methodLabels = {
    wild: "Wild",
    starter: "Starter",
    gift: "Gift",
    static: "Static",
    trade: "Trade",
    fossil: "Fossil",
    legendary: "Legendary",
    event: "Event",
    stone: "Stone"
  };
  const statusLabels = {
    poison: "PSN",
    burn: "BRN",
    paralysis: "PAR",
    sleep: "SLP",
    freeze: "FRZ"
  };
  const miniShapes = [
    "polygon(13% 17%,33% 20%,50% 2%,67% 20%,91% 16%,82% 46%,91% 82%,62% 100%,27% 96%,5% 67%)",
    "polygon(2% 38%,18% 22%,22% 0,45% 18%,65% 4%,76% 27%,100% 35%,88% 59%,96% 84%,67% 91%,50% 100%,31% 88%,8% 92%,13% 65%)",
    "polygon(12% 12%,35% 22%,48% 1%,61% 24%,88% 12%,82% 40%,98% 59%,79% 72%,84% 100%,53% 87%,25% 99%,22% 77%,2% 59%,18% 39%)",
    "polygon(4% 29%,24% 22%,34% 4%,54% 18%,79% 2%,78% 30%,98% 45%,84% 66%,95% 87%,63% 89%,45% 100%,28% 84%,7% 91%,14% 61%)"
  ];

  const dom = {
    loading: document.querySelector("#loading-screen"),
    setup: document.querySelector("#setup-screen"),
    battle: document.querySelector("#battle-screen"),
    error: document.querySelector("#error-panel"),
    errorMessage: document.querySelector("#error-message"),
    difficulty: document.querySelector("#difficulty"),
    start: document.querySelector("#start-battle"),
    matchup: document.querySelector("#matchup-summary"),
    log: document.querySelector("#battle-log"),
    moveMenu: document.querySelector("#move-menu"),
    mainCommands: document.querySelector("#main-commands"),
    promptName: document.querySelector("#prompt-name"),
    round: document.querySelector("#battle-round"),
    arena: document.querySelector("#battle-arena"),
    infoDialog: document.querySelector("#info-dialog"),
    infoGrid: document.querySelector("#info-grid"),
    result: document.querySelector("#result-overlay"),
    resultKicker: document.querySelector("#result-kicker"),
    resultTitle: document.querySelector("#result-title"),
    resultCopy: document.querySelector("#result-copy"),
    soundToggle: document.querySelector("#sound-toggle")
  };

  const sideDom = {
    player: {
      selected: document.querySelector("#player-selected"),
      roster: document.querySelector("#player-roster"),
      search: document.querySelector("#player-search"),
      type: document.querySelector("#player-type"),
      method: document.querySelector("#player-method"),
      level: document.querySelector("#player-level"),
      levelOutput: document.querySelector("#player-level-output"),
      name: document.querySelector("#player-name"),
      levelLabel: document.querySelector("#player-level-label"),
      hpFill: document.querySelector("#player-hp-fill"),
      hpText: document.querySelector("#player-hp-text"),
      status: document.querySelector("#player-status"),
      stage: document.querySelector("#player-stage")
    },
    opponent: {
      selected: document.querySelector("#opponent-selected"),
      roster: document.querySelector("#opponent-roster"),
      search: document.querySelector("#opponent-search"),
      type: document.querySelector("#opponent-type"),
      method: document.querySelector("#opponent-method"),
      level: document.querySelector("#opponent-level"),
      levelOutput: document.querySelector("#opponent-level-output"),
      name: document.querySelector("#opponent-name"),
      levelLabel: document.querySelector("#opponent-level-label"),
      hpFill: document.querySelector("#opponent-hp-fill"),
      hpText: document.querySelector("#opponent-hp-text"),
      status: document.querySelector("#opponent-status"),
      stage: document.querySelector("#opponent-stage")
    }
  };

  let pokemonData = [];
  let selection = { player: 25, opponent: 4 };
  let filters = {
    player: { search: "", type: "", method: "" },
    opponent: { search: "", type: "", method: "" }
  };
  let currentBattle = null;
  let initialMatchup = null;
  let busy = false;
  let soundEnabled = true;
  let audioContext = null;

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function selectedPokemon(side) {
    return pokemonData.find((pokemon) => pokemon.id === selection[side]) || pokemonData[0];
  }

  function artworkFor(pokemon, side = "front") {
    const entry = artwork[pokemon.id];
    if (!entry) return null;
    if (typeof entry === "string") {
      return { src: entry, fallback: entry };
    }
    return {
      src: entry[side] || entry.front,
      fallback: entry.fallback || ""
    };
  }

  function artworkImage(art, className, attributes = "") {
    if (!art) return "";
    return `
      <img
        class="pokemon-art ${className}"
        src="${art.src}"
        data-art-fallback="${art.fallback}"
        alt=""
        ${attributes}
      />`;
  }

  function typeBadges(types) {
    return types.map((type) =>
      `<span class="type-badge" style="--badge-color:${TYPE_COLORS[type]}">${escapeHtml(type)}</span>`
    ).join("");
  }

  function renderSelected(side) {
    const pokemon = selectedPokemon(side);
    const color = pokemon.sprite?.cssColorHint || TYPE_COLORS[pokemon.types[0]];
    const shape = pokemon.sprite?.shape ?? pokemon.id % 4;
    const art = artworkFor(pokemon);
    sideDom[side].selected.style.setProperty("--selected-color", color);
    sideDom[side].selected.innerHTML = `
      <div class="selected-visual" aria-hidden="true">
        <span
          class="mini-monster"
          style="--selected-color:${color};--mini-shape:${miniShapes[shape]}"
        ></span>
        ${artworkImage(art, "selected-art")}
      </div>
      <div class="selected-details">
        <span class="selected-number">KANTO #${String(pokemon.id).padStart(3, "0")}</span>
        <h3>${escapeHtml(pokemon.displayName)}</h3>
        <div class="type-row">${typeBadges(pokemon.types)}</div>
        <div class="method-row">
          ${pokemon.availability.methods.slice(0, 3).map((method) =>
            `<span class="method-badge">${escapeHtml(methodLabels[method] || method)}</span>`
          ).join("")}
        </div>
      </div>
    `;
  }

  function filteredPokemon(side) {
    const active = filters[side];
    return pokemonData.filter((pokemon) => {
      const nameMatches = pokemon.displayName.toLowerCase().includes(active.search);
      const typeMatches = !active.type || pokemon.types.includes(active.type);
      const methodMatches = !active.method ||
        pokemon.availability.methods.includes(active.method);
      return nameMatches && typeMatches && methodMatches;
    });
  }

  function renderRoster(side) {
    const matches = filteredPokemon(side);
    sideDom[side].roster.innerHTML = matches.length
      ? matches.map((pokemon) => {
        const color = pokemon.sprite?.cssColorHint || TYPE_COLORS[pokemon.types[0]];
        const art = artworkFor(pokemon);
        return `
          <button
            class="roster-button"
            type="button"
            role="option"
            data-pokemon-id="${pokemon.id}"
            aria-selected="${pokemon.id === selection[side]}"
            style="--entry-color:${color}"
          >
            <span class="roster-visual" aria-hidden="true">
              <span class="roster-dot"></span>
              ${artworkImage(art, "roster-art", 'loading="lazy"')}
            </span>
            <span class="roster-number">#${String(pokemon.id).padStart(3, "0")}</span>
            <span class="roster-name">${escapeHtml(pokemon.displayName)}</span>
          </button>
        `;
      }).join("")
      : `<p class="empty-roster">Ingen Pokémon matcher de valgte filtre.</p>`;
  }

  function renderMatchup() {
    const player = selectedPokemon("player");
    const opponent = selectedPokemon("opponent");
    dom.matchup.innerHTML = `
      <strong>${escapeHtml(player.displayName)} · Lv. ${sideDom.player.level.value}</strong>
      møder
      <strong>${escapeHtml(opponent.displayName)} · Lv. ${sideDom.opponent.level.value}</strong>
      <br />AI: ${escapeHtml(dom.difficulty.options[dom.difficulty.selectedIndex].text)}
    `;
  }

  function savePreferences() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        playerId: selection.player,
        opponentId: selection.opponent,
        playerLevel: Number(sideDom.player.level.value),
        opponentLevel: Number(sideDom.opponent.level.value),
        difficulty: dom.difficulty.value,
        soundEnabled
      }));
    } catch (error) {
      // The game remains fully playable when storage is unavailable.
    }
  }

  function loadPreferences() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      if (pokemonData.some((pokemon) => pokemon.id === saved.playerId)) {
        selection.player = saved.playerId;
      }
      if (pokemonData.some((pokemon) => pokemon.id === saved.opponentId)) {
        selection.opponent = saved.opponentId;
      }
      sideDom.player.level.value = saved.playerLevel || 50;
      sideDom.opponent.level.value = saved.opponentLevel || 50;
      dom.difficulty.value = ["easy", "normal", "smart"].includes(saved.difficulty)
        ? saved.difficulty
        : "normal";
      soundEnabled = saved.soundEnabled !== false;
    } catch (error) {
      // Invalid saved data should never prevent the game from starting.
    }
  }

  function populateFilters() {
    const typeOptions = TYPES.map((type) =>
      `<option value="${type}">${type.charAt(0).toUpperCase() + type.slice(1)}</option>`
    ).join("");
    const methods = [...new Set(
      pokemonData.flatMap((pokemon) => pokemon.availability.methods)
    )].sort();
    const methodOptions = methods.map((method) =>
      `<option value="${method}">${escapeHtml(methodLabels[method] || method)}</option>`
    ).join("");

    for (const side of ["player", "opponent"]) {
      sideDom[side].type.insertAdjacentHTML("beforeend", typeOptions);
      sideDom[side].method.insertAdjacentHTML("beforeend", methodOptions);
    }
  }

  function updateLevel(side) {
    sideDom[side].levelOutput.value = sideDom[side].level.value;
    renderMatchup();
    savePreferences();
  }

  function pickPokemon(side, id) {
    selection[side] = id;
    renderSelected(side);
    renderRoster(side);
    renderMatchup();
    savePreferences();
    playTone(440, 0.045, "square", 0.025);
  }

  function randomPokemon(side) {
    const pool = filteredPokemon(side);
    if (!pool.length) return;
    const current = selection[side];
    const alternatives = pool.filter((pokemon) => pokemon.id !== current);
    const choice = (alternatives.length ? alternatives : pool)[
      Math.floor(Math.random() * (alternatives.length || pool.length))
    ];
    pickPokemon(side, choice.id);
  }

  function setMonsterStage(side, pokemon, fainted = false) {
    const stage = sideDom[side].stage;
    const color = pokemon.sprite?.cssColorHint || TYPE_COLORS[pokemon.types[0]];
    const shape = pokemon.sprite?.shape ?? pokemon.id % 4;
    const art = artworkFor(pokemon, side === "player" ? "back" : "front");
    stage.className = [
      "monster-stage",
      `${side}-stage`,
      side === "player" ? "is-back" : "",
      `shape-${shape}`,
      art ? "has-art" : "",
      fainted ? "fainted" : ""
    ].filter(Boolean).join(" ");
    stage.style.setProperty("--monster-color", color);
    stage.style.setProperty("--attack-direction", side === "player" ? "24%" : "-24%");

    let image = stage.querySelector(".monster-art");
    if (art) {
      if (!image) {
        image = document.createElement("img");
        image.className = "pokemon-art monster-art";
        image.alt = "";
        image.decoding = "async";
        stage.append(image);
      }
      image.hidden = false;
      image.dataset.artFallback = art.fallback;
      image.dataset.fallbackApplied = "";
      image.src = art.src;
    } else {
      image?.remove();
    }
  }

  function updateHp(side, hp, maxHp) {
    const percent = maxHp ? Math.max(0, Math.round((hp / maxHp) * 100)) : 0;
    const fill = sideDom[side].hpFill;
    fill.style.width = `${percent}%`;
    fill.classList.toggle("medium", percent <= 50 && percent > 20);
    fill.classList.toggle("low", percent <= 20);
    sideDom[side].hpText.textContent = `${hp} / ${maxHp}`;
  }

  function updateStatus(side, status) {
    const badge = sideDom[side].status;
    badge.hidden = !status;
    badge.textContent = statusLabels[status] || "";
    badge.dataset.status = status || "";
  }

  function renderCombatant(side, combatant) {
    sideDom[side].name.textContent = combatant.displayName;
    sideDom[side].levelLabel.textContent = `Lv. ${combatant.level}`;
    updateHp(side, combatant.hp, combatant.maxHp);
    updateStatus(side, combatant.status);
    setMonsterStage(side, combatant, combatant.fainted);
  }

  function renderBattleState() {
    if (!currentBattle) return;
    renderCombatant("player", currentBattle.player);
    renderCombatant("opponent", currentBattle.opponent);
    dom.promptName.textContent = currentBattle.player.displayName;
    dom.round.textContent = `Tur ${Math.max(1, currentBattle.turn + 1)}`;
    if (!dom.moveMenu.hidden) renderMoves();
  }

  function appendLog(message) {
    const previous = dom.log.querySelector(".latest");
    if (previous) previous.classList.remove("latest");
    const line = document.createElement("div");
    line.className = "log-line latest";
    line.textContent = message;
    dom.log.append(line);
    dom.log.scrollTop = dom.log.scrollHeight;
  }

  function renderMoves() {
    if (!currentBattle) return;
    dom.moveMenu.innerHTML = currentBattle.player.moves.map((move, index) => `
      <button
        class="move-button"
        type="button"
        data-move-index="${index}"
        style="--move-color:${TYPE_COLORS[move.type] || TYPE_COLORS.normal}"
        ${move.currentPp <= 0 || busy ? "disabled" : ""}
      >
        <span class="move-name">${escapeHtml(move.name)}</span>
        <span class="move-meta">
          <span>${escapeHtml(move.type)}</span>
          <span>PP ${move.currentPp}/${move.pp}</span>
          <span>POW ${move.power ?? "—"}</span>
          <span>ACC ${move.accuracy}%</span>
        </span>
      </button>
    `).join("") + `
      <button class="move-back" type="button" data-action="back">← Tilbage</button>
    `;
  }

  function showMoveMenu() {
    if (busy || currentBattle?.finished) return;
    dom.mainCommands.hidden = true;
    dom.moveMenu.hidden = false;
    renderMoves();
    dom.moveMenu.querySelector("button:not(:disabled)")?.focus();
  }

  function hideMoveMenu() {
    dom.moveMenu.hidden = true;
    dom.mainCommands.hidden = false;
    dom.mainCommands.querySelector("[data-action='fight']")?.focus();
  }

  function wait(milliseconds) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return Promise.resolve();
    }
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function playTone(frequency, duration, wave = "square", volume = 0.04) {
    if (!soundEnabled) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = wave;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch (error) {
      soundEnabled = false;
      updateSoundButton();
    }
  }

  function playVictorySound(won) {
    const notes = won ? [523, 659, 784, 1046] : [392, 330, 262];
    notes.forEach((note, index) => {
      window.setTimeout(() => playTone(note, 0.16, "square", 0.035), index * 120);
    });
  }

  function clearAttackEffects() {
    dom.arena.querySelectorAll(".attack-fx").forEach((effect) => effect.remove());
    dom.arena.classList.remove("arena-status-fx", "arena-special-fx");
    dom.arena.style.removeProperty("--fx-color");
  }

  function spawnEffect(classNames, options = {}) {
    const effect = document.createElement("span");
    effect.className = ["attack-fx", classNames].filter(Boolean).join(" ");
    effect.setAttribute("aria-hidden", "true");

    for (const [name, value] of Object.entries(options.style || {})) {
      effect.style.setProperty(name, value);
    }

    if (options.children) {
      for (let index = 0; index < options.children; index += 1) {
        effect.append(document.createElement("i"));
      }
    }

    dom.arena.append(effect);
    return effect;
  }

  function effectDirection(actorSide) {
    return actorSide === "player"
      ? { startX: "25%", startY: "72%", endX: "71%", endY: "35%", sign: 1 }
      : { startX: "72%", startY: "34%", endX: "25%", endY: "72%", sign: -1 };
  }

  function moveAnimationType(moveType, category) {
    if (category === "physical") return ["normal", "fighting", "steel"].includes(moveType)
      ? "strike"
      : "slash";
    if (category === "status") return "status";
    if (["fire", "water", "electric", "grass", "ice", "psychic", "poison", "ground", "rock", "flying", "bug", "ghost", "dragon", "dark", "steel"].includes(moveType)) {
      return moveType;
    }
    return "beam";
  }

  function launchAttackEffect(event) {
    clearAttackEffects();

    const type = event.moveType || "normal";
    const category = event.category || "physical";
    const color = TYPE_COLORS[type] || TYPE_COLORS.normal;
    const direction = effectDirection(event.actorSide);
    const animation = moveAnimationType(type, category);
    const style = {
      "--fx-color": color,
      "--fx-start-x": direction.startX,
      "--fx-start-y": direction.startY,
      "--fx-end-x": direction.endX,
      "--fx-end-y": direction.endY,
      "--fx-sign": String(direction.sign),
    };

    dom.arena.style.setProperty("--fx-color", color);

    if (category === "status" || event.damage === 0) {
      dom.arena.classList.add("arena-status-fx");
    } else if (category === "special") {
      dom.arena.classList.add("arena-special-fx");
    }

    if (animation === "strike") {
      spawnEffect("fx-strike", { style, children: 4 });
      return;
    }

    if (animation === "slash") {
      spawnEffect("fx-slash", { style, children: 3 });
      return;
    }

    if (["fire", "water", "electric", "grass", "ice", "poison", "ground", "rock", "flying", "bug", "ghost", "dragon", "dark", "steel"].includes(animation)) {
      spawnEffect(`fx-projectile fx-${animation}`, { style, children: 5 });
      return;
    }

    if (animation === "psychic" || animation === "status") {
      spawnEffect(`fx-ring fx-${animation}`, { style, children: 3 });
      return;
    }

    spawnEffect("fx-beam", { style, children: 4 });
  }

  function updateSoundButton() {
    dom.soundToggle.textContent = `Lyd: ${soundEnabled ? "til" : "fra"}`;
    dom.soundToggle.setAttribute("aria-pressed", String(soundEnabled));
  }

  async function animateEvent(event, nextBattle) {
    if (event.kind === "move") {
      const actorStage = sideDom[event.actorSide].stage;
      const targetStage = sideDom[event.targetSide].stage;
      actorStage.classList.add("attack-forward");
      launchAttackEffect(event);
      playTone(event.category === "special" ? 660 : 320, 0.12, "square", 0.035);
      await wait(240);

      if (event.damage > 0) {
        targetStage.classList.add("hit-shake");
        dom.arena.classList.add("hit-flash");
        if (event.critical) dom.arena.classList.add("critical-hit");
        playTone(event.effectiveness > 1 ? 145 : 190, 0.16, "sawtooth", 0.05);
        const target = nextBattle[event.targetSide];
        updateHp(event.targetSide, event.targetHp, target.maxHp);
      } else if (event.missed || event.effectiveness === 0) {
        playTone(130, 0.08, "square", 0.025);
      }

      if (event.statusApplied) updateStatus(event.targetSide, event.statusApplied);
      for (const message of event.logs) {
        appendLog(message);
        await wait(115);
      }
      if (event.fainted) targetStage.classList.add("fainted");
      await wait(260);
      actorStage.classList.remove("attack-forward");
      targetStage.classList.remove("hit-shake");
      dom.arena.classList.remove("hit-flash", "critical-hit");
      clearAttackEffects();
      return;
    }

    if (event.kind === "status") {
      const target = nextBattle[event.targetSide];
      updateHp(event.targetSide, event.targetHp, target.maxHp);
      sideDom[event.targetSide].stage.classList.add("hit-shake");
      playTone(115, 0.12, "sawtooth", 0.035);
      for (const message of event.logs) {
        appendLog(message);
        await wait(120);
      }
      if (event.fainted) sideDom[event.targetSide].stage.classList.add("fainted");
      await wait(220);
      sideDom[event.targetSide].stage.classList.remove("hit-shake");
      clearAttackEffects();
    }
  }

  async function useMove(moveIndex) {
    if (busy || !engine.canUseMove(currentBattle.player, moveIndex)) return;
    busy = true;
    renderMoves();
    const next = engine.resolveTurn(currentBattle, moveIndex);

    for (const event of next.events) {
      await animateEvent(event, next);
    }

    currentBattle = next;
    renderBattleState();
    busy = false;

    if (currentBattle.finished) {
      window.setTimeout(showResult, 450);
    } else {
      hideMoveMenu();
    }
  }

  function showResult() {
    const won = currentBattle.winner === "player";
    dom.resultKicker.textContent = won ? "Arena victory" : "Battle afsluttet";
    dom.resultTitle.textContent = won ? "Sejr!" : "Nederlag";
    dom.resultCopy.textContent = won
      ? `${currentBattle.player.displayName} vandt over ${currentBattle.opponent.displayName} efter ${currentBattle.turn} ture.`
      : `${currentBattle.opponent.displayName} vandt kampen. Justér matchup eller prøv samme duel igen.`;
    dom.result.hidden = false;
    void window.WutborgHighscores?.submit({
      gameKey: "monster-battle-arena",
      gameTitle: "Monster Battle Arena",
      score:
        (won ? 1000 : 0) +
        Math.round((currentBattle.player.hp / currentBattle.player.maxHp) * 1000) +
        Math.max(0, 200 - currentBattle.turn * 10),
      outcome: won ? "won" : "lost",
      details: {
        player: currentBattle.player.displayName,
        opponent: currentBattle.opponent.displayName,
        difficulty: currentBattle.difficulty,
        turns: currentBattle.turn,
        playerHp: currentBattle.player.hp,
        opponentHp: currentBattle.opponent.hp
      }
    });
    playVictorySound(won);
    dom.result.querySelector("button")?.focus();
  }

  function startBattle() {
    const playerPokemon = selectedPokemon("player");
    const opponentPokemon = selectedPokemon("opponent");
    initialMatchup = {
      playerPokemon,
      opponentPokemon,
      playerLevel: Number(sideDom.player.level.value),
      opponentLevel: Number(sideDom.opponent.level.value),
      difficulty: dom.difficulty.value
    };
    currentBattle = {
      player: engine.createCombatant(playerPokemon, initialMatchup.playerLevel),
      opponent: engine.createCombatant(opponentPokemon, initialMatchup.opponentLevel),
      difficulty: initialMatchup.difficulty,
      turn: 0,
      finished: false,
      winner: null,
      events: []
    };
    busy = false;
    dom.log.innerHTML = "";
    dom.setup.hidden = true;
    dom.battle.hidden = false;
    dom.result.hidden = true;
    dom.moveMenu.hidden = true;
    dom.mainCommands.hidden = false;
    appendLog(`${opponentPokemon.displayName} træder ind i arenaen!`);
    appendLog(`Gå, ${playerPokemon.displayName}!`);
    renderBattleState();
    savePreferences();
    playTone(523, 0.09, "square", 0.035);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function restartBattle() {
    if (!initialMatchup || busy) return;
    selection.player = initialMatchup.playerPokemon.id;
    selection.opponent = initialMatchup.opponentPokemon.id;
    sideDom.player.level.value = initialMatchup.playerLevel;
    sideDom.opponent.level.value = initialMatchup.opponentLevel;
    dom.difficulty.value = initialMatchup.difficulty;
    startBattle();
  }

  function newBattle() {
    if (busy) return;
    dom.result.hidden = true;
    dom.battle.hidden = true;
    dom.setup.hidden = false;
    currentBattle = null;
    renderSelected("player");
    renderSelected("opponent");
    renderRoster("player");
    renderRoster("opponent");
    renderMatchup();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showInfo() {
    if (!currentBattle) return;
    dom.infoGrid.innerHTML = ["player", "opponent"].map((side) => {
      const fighter = currentBattle[side];
      const stats = [
        ["HP", `${fighter.hp} / ${fighter.maxHp}`],
        ["Attack", fighter.stats.attack],
        ["Defense", fighter.stats.defense],
        ["Sp. Attack", fighter.stats.specialAttack],
        ["Sp. Defense", fighter.stats.specialDefense],
        ["Speed", fighter.stats.speed],
        ["Status", fighter.status ? statusLabels[fighter.status] : "Ingen"]
      ];
      return `
        <article class="info-fighter">
          <span class="selected-number">${side === "player" ? "DIN FIGHTER" : "MODSTANDER"}</span>
          <h3>${escapeHtml(fighter.displayName)} · Lv. ${fighter.level}</h3>
          <div class="type-row">${typeBadges(fighter.types)}</div>
          <div class="stat-list">
            ${stats.map(([label, value]) =>
              `<div class="stat-row"><span>${label}</span><strong>${value}</strong></div>`
            ).join("")}
          </div>
        </article>
      `;
    }).join("");
    dom.infoDialog.showModal();
  }

  function handleAction(action) {
    if (action === "fight") showMoveMenu();
    if (action === "back") hideMoveMenu();
    if (action === "info") showInfo();
    if (action === "restart") restartBattle();
    if (action === "new") newBattle();
  }

  function bindEvents() {
    document.addEventListener("error", (event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement) || !image.classList.contains("pokemon-art")) {
        return;
      }

      const fallback = image.dataset.artFallback;
      if (fallback && !image.dataset.fallbackApplied) {
        image.dataset.fallbackApplied = "true";
        image.src = fallback;
        return;
      }

      image.hidden = true;
      image.closest(".monster-stage")?.classList.remove("has-art");
    }, true);

    for (const side of ["player", "opponent"]) {
      sideDom[side].roster.addEventListener("click", (event) => {
        const button = event.target.closest("[data-pokemon-id]");
        if (button) pickPokemon(side, Number(button.dataset.pokemonId));
      });
      sideDom[side].search.addEventListener("input", (event) => {
        filters[side].search = event.target.value.trim().toLowerCase();
        renderRoster(side);
      });
      sideDom[side].type.addEventListener("change", (event) => {
        filters[side].type = event.target.value;
        renderRoster(side);
      });
      sideDom[side].method.addEventListener("change", (event) => {
        filters[side].method = event.target.value;
        renderRoster(side);
      });
      sideDom[side].level.addEventListener("input", () => updateLevel(side));
    }

    document.querySelectorAll("[data-random]").forEach((button) => {
      button.addEventListener("click", () => randomPokemon(button.dataset.random));
    });
    document.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-action]");
      if (actionButton) handleAction(actionButton.dataset.action);
    });
    dom.moveMenu.addEventListener("click", (event) => {
      const moveButton = event.target.closest("[data-move-index]");
      if (moveButton) useMove(Number(moveButton.dataset.moveIndex));
    });
    dom.start.addEventListener("click", startBattle);
    dom.difficulty.addEventListener("change", () => {
      renderMatchup();
      savePreferences();
    });
    dom.soundToggle.addEventListener("click", () => {
      soundEnabled = !soundEnabled;
      updateSoundButton();
      savePreferences();
      if (soundEnabled) playTone(523, 0.08);
    });
    dom.infoDialog.querySelector(".dialog-close").addEventListener("click", () => {
      dom.infoDialog.close();
    });
    dom.infoDialog.addEventListener("click", (event) => {
      if (event.target === dom.infoDialog) dom.infoDialog.close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !dom.moveMenu.hidden && !busy) {
        event.preventDefault();
        hideMoveMenu();
      }
    });
  }

  async function init() {
    try {
      pokemonData = await window.PokemonDataLoader.loadPokemonData();
      loadPreferences();
      populateFilters();
      for (const side of ["player", "opponent"]) {
        sideDom[side].levelOutput.value = sideDom[side].level.value;
        renderSelected(side);
        renderRoster(side);
      }
      renderMatchup();
      updateSoundButton();
      bindEvents();
      dom.loading.hidden = true;
      dom.setup.hidden = false;
    } catch (error) {
      dom.loading.hidden = true;
      dom.error.hidden = false;
      dom.errorMessage.textContent = error.message;
    }
  }

  init();
})();
