(() => {
  "use strict";

  const ALL_SONGS = Array.isArray(window.SANGQUIZ_SONGS) ? window.SANGQUIZ_SONGS : [];
  const STORAGE_KEY = "wutborg.sangquiz.game.v1";
  const TEAM_NAMES_KEY = "wutborg.sangquiz.teams.v1";
  const MODE_KEY = "wutborg.sangquiz.mode.v1";
  const CATEGORY_KEY = "wutborg.sangquiz.category.v1";
  const CLIENT_ID_KEY = "wutborg.sangquiz.spotify.clientId";
  const DEFAULT_CLIENT_ID = "cbb2b24b20c94b12bf0682e5fb88d860";
  const TOKEN_KEY = "wutborg.sangquiz.spotify.token";
  const PKCE_KEY = "wutborg.sangquiz.spotify.pkce";
  const SOUND_KEY = "wutborg.sangquiz.sound.v1";
  const WINNING_SCORE = 10;
  const TEAM_COLORS = ["#D0502C", "#5B84A8"];
  const TURN_SPLASH_MS = 1500;
  const SPOTIFY_SCOPES = [
    "streaming",
    "user-read-email",
    "user-read-private",
    "user-modify-playback-state",
    "user-read-playback-state",
  ].join(" ");

  const $ = (id) => document.getElementById(id);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const byYear = (a, b) => a.year - b.year || a.title.localeCompare(b.title, "da");
  const CATEGORY_LABELS = {
    mixed: "Blandet",
    danish: "Dansk",
    international: "Internationalt",
  };

  const els = {};
  let selectedCategory = normalizeCategory(readTextStorage(CATEGORY_KEY, "mixed"));
  let state = createEmptyState();
  let setupTeamNames = ["Hold 1", "Hold 2"];
  let mode = readTextStorage(MODE_KEY, "screen");
  let playbackActive = false;
  let soundEnabled = readTextStorage(SOUND_KEY, "false") === "true";
  let audioContext = null;
  let splashTimer = 0;
  let feedbackTimer = 0;
  let lastRecordCounter = "";
  let spotify = {
    deviceId: "",
    player: null,
    sdkPromise: null,
    connecting: false,
    ready: false,
    status: "Manuel DJ klar",
    resolvedUris: {},
  };

  function init() {
    bindElements();
    setupTeamNames = loadSetupTeams();
    state = normalizeState(readStorage(STORAGE_KEY, createEmptyState()));

    bindEvents();
    updateRedirectUri();
    renderSetupTeams();
    render();

    handleSpotifyCallback()
      .then(() => autoConnectSpotifyFromSavedLogin())
      .catch((error) => {
        setSpotifyStatus(`Spotify login fejlede: ${error.message}`);
      });
  }

  function bindElements() {
    [
      "sangquiz-app",
      "app-status",
      "setup-screen",
      "game-screen",
      "finish-screen",
      "setup-teams",
      "add-team-button",
      "start-game-button",
      "restore-game-button",
      "spotify-client-id",
      "spotify-redirect-uri",
      "spotify-login-button",
      "spotify-connect-button",
      "spotify-mode-status",
      "category-status",
      "round-number",
      "deck-status",
      "active-team-name",
      "hidden-song-label",
      "record-counter",
      "record-label",
      "now-song-card",
      "current-card-back-number",
      "current-card-front-year",
      "current-card-front-title",
      "current-card-front-artist",
      "play-hidden-button",
      "pause-button",
      "dj-fallback-link",
      "reveal-button",
      "placement-slots",
      "reveal-panel",
      "reveal-title",
      "reveal-artist",
      "reveal-year",
      "placement-result",
      "bonus-guess",
      "scoreboard",
      "game-actions",
      "host-panel",
      "sound-toggle-button",
      "end-game-button",
      "reset-game-button",
      "finish-title",
      "finish-summary",
      "winner-list",
      "new-game-button",
      "turn-splash",
      "turn-splash-team",
      "turn-splash-song",
    ].forEach((id) => {
      els[toCamel(id)] = $(id);
    });

    els.modeButtons = [...document.querySelectorAll("[data-sangquiz-mode]")];
    els.categoryButtons = [...document.querySelectorAll("[data-song-category]")];
    els.scoreButtons = [...document.querySelectorAll("[data-score-action]")];
  }

  function bindEvents() {
    els.addTeamButton.addEventListener("click", addSetupTeam);
    els.startGameButton.addEventListener("click", startGame);
    els.restoreGameButton.addEventListener("click", restoreGame);
    els.resetGameButton.addEventListener("click", resetGame);
    els.endGameButton.addEventListener("click", () => finishGame("manual"));
    els.newGameButton.addEventListener("click", resetGame);
    els.revealButton.addEventListener("click", revealSong);
    els.playHiddenButton.addEventListener("click", playCurrentSong);
    els.pauseButton.addEventListener("click", pausePlayback);
    els.spotifyLoginButton.addEventListener("click", startSpotifyLogin);
    els.spotifyConnectButton.addEventListener("click", connectSpotifyPlayer);
    els.soundToggleButton.addEventListener("click", toggleSound);

    els.spotifyClientId.addEventListener("input", () => {
      safeSetStorage(CLIENT_ID_KEY, els.spotifyClientId.value.trim());
      updateSpotifyUi();
    });

    els.placementSlots.addEventListener("click", (event) => {
      const button = event.target.closest("[data-slot]");
      if (!button) return;
      state.selectedSlot = Number(button.dataset.slot);
      saveGame();
      renderRound();
    });

    els.scoreboard.addEventListener("click", (event) => {
      const button = event.target.closest("[data-score-team]");
      if (!button) return;
      adjustTeamScore(Number(button.dataset.scoreTeam), Number(button.dataset.scoreDelta));
    });

    els.scoreButtons.forEach((button) => {
      button.addEventListener("click", () => applyScoreAction(button.dataset.scoreAction));
    });

    els.modeButtons.forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.sangquizMode));
    });

    els.categoryButtons.forEach((button) => {
      button.addEventListener("click", () => setSongCategory(button.dataset.songCategory));
    });
  }

  function toCamel(id) {
    return id.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
  }

  function createEmptyState() {
    return {
      version: 1,
      started: false,
      finished: false,
      phase: "setup",
      round: 0,
      activeTeamIndex: 0,
      selectedSlot: -1,
      currentSongId: "",
      songCategory: selectedCategory,
      usedSongIds: [],
      teams: [],
      finishReason: "",
      highscoreSubmitted: false,
    };
  }

  function createGameState(names) {
    return {
      ...createEmptyState(),
      started: true,
      phase: "guess",
      songCategory: selectedCategory,
      teams: names.map((name, index) => ({
        id: `team-${Date.now()}-${index}`,
        name,
        score: 0,
        playedSongIds: [],
        timeline: [],
      })),
    };
  }

  function normalizeState(value) {
    const next = value && typeof value === "object" ? value : createEmptyState();
    next.usedSongIds = Array.isArray(next.usedSongIds) ? next.usedSongIds : [];
    next.teams = Array.isArray(next.teams) ? next.teams : [];
    next.teams = next.teams.map((team, index) => ({
      id: team.id || `team-${index}`,
      name: String(team.name || `Hold ${index + 1}`),
      score: Number.isFinite(Number(team.score)) ? Number(team.score) : 0,
      playedSongIds: Array.isArray(team.playedSongIds) ? team.playedSongIds : [],
      timeline: Array.isArray(team.timeline) ? team.timeline.slice().sort(byYear) : [],
    }));
    next.activeTeamIndex = clamp(Number(next.activeTeamIndex) || 0, 0, Math.max(0, next.teams.length - 1));
    const activeTimelineLength = getActiveTimeline(next).length;
    const slotValue = Number.isFinite(Number(next.selectedSlot)) ? Number(next.selectedSlot) : -1;
    next.selectedSlot = clamp(slotValue, activeTimelineLength ? -1 : 0, activeTimelineLength);
    next.songCategory = normalizeCategory(next.songCategory || selectedCategory);
    next.phase = next.phase === "reveal" ? "reveal" : next.started ? "guess" : "setup";
    next.finished = Boolean(next.finished);
    next.highscoreSubmitted = Boolean(next.highscoreSubmitted);
    return next;
  }

  function loadSetupTeams() {
    const saved = readStorage(TEAM_NAMES_KEY, null);
    if (Array.isArray(saved) && saved.length >= 2) {
      return saved.slice(0, 6).map((name, index) => String(name || `Hold ${index + 1}`));
    }

    if (state.teams.length >= 2) return state.teams.map((team) => team.name).slice(0, 6);
    return ["Hold 1", "Hold 2"];
  }

  function render() {
    const pagePhase = state.finished ? "finish" : state.started ? "game" : "setup";
    const colorIndex = state.finished ? getWinnerTeamIndex() : state.activeTeamIndex;
    const activeColor = getTeamColor(colorIndex);

    document.body.dataset.sangquizMode = mode;
    document.body.dataset.sangquizPhase = pagePhase;
    document.body.dataset.playback = playbackActive ? "playing" : "idle";
    document.body.style.setProperty("--active-team-color", activeColor);
    els.sangquizApp.style.setProperty("--active-team-color", activeColor);
    els.sangquizApp.dataset.mode = mode;
    els.setupScreen.hidden = state.started;
    els.gameScreen.hidden = !state.started || state.finished;
    els.finishScreen.hidden = !state.finished;
    els.gameActions.hidden = !state.started || state.finished;
    if (els.hostPanel && mode === "phone") els.hostPanel.open = true;

    els.appStatus.textContent = getAppStatus();
    renderSetupState();
    renderRound();
    renderScoreboard();
    renderFinish();
    updateModeUi();
    updateSpotifyUi();
    updateSoundUi();
  }

  function getAppStatus() {
    const pool = getActiveSongPool();
    if (!ALL_SONGS.length) return "Sanglisten mangler";
    if (state.finished) return "Spil afsluttet";
    if (state.started) {
      const team = getActiveTeam();
      return team ? `${team.name}: ${teamSongCount(team)} sange spillet` : "Spil i gang";
    }
    return `${pool.length} sange klar · ${CATEGORY_LABELS[selectedCategory]}`;
  }

  function renderSetupState() {
    const hasSavedGame = Boolean(state.started && !state.finished && state.teams.length);
    els.restoreGameButton.hidden = !hasSavedGame;
    els.restoreGameButton.textContent = hasSavedGame
      ? `Fortsæt spil (${state.round || 1})`
      : "Fortsæt spil";

    const clientId = getSpotifyClientId();
    if (els.spotifyClientId.value !== clientId) els.spotifyClientId.value = clientId;
    updateCategoryUi();
  }

  function renderSetupTeams() {
    els.setupTeams.replaceChildren();

    setupTeamNames.forEach((name, index) => {
      const row = document.createElement("div");
      row.className = "team-row";

      const label = document.createElement("label");
      label.className = "team-label";
      label.textContent = `Hold ${index + 1}`;

      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 24;
      input.value = name;
      input.autocomplete = "off";
      input.addEventListener("input", () => {
        setupTeamNames[index] = input.value;
        saveSetupTeams();
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-button";
      remove.textContent = "-";
      remove.ariaLabel = `Fjern ${name || `hold ${index + 1}`}`;
      remove.disabled = setupTeamNames.length <= 2;
      remove.addEventListener("click", () => {
        setupTeamNames.splice(index, 1);
        saveSetupTeams();
        renderSetupTeams();
      });

      row.append(label, input, remove);
      els.setupTeams.append(row);
    });

    els.addTeamButton.disabled = setupTeamNames.length >= 6;
  }

  function addSetupTeam() {
    if (setupTeamNames.length >= 6) return;
    setupTeamNames.push(`Hold ${setupTeamNames.length + 1}`);
    saveSetupTeams();
    renderSetupTeams();
  }

  function saveSetupTeams() {
    safeSetStorage(TEAM_NAMES_KEY, JSON.stringify(setupTeamNames));
  }

  function collectTeamNames() {
    const names = [...els.setupTeams.querySelectorAll("input")]
      .map((input, index) => input.value.trim() || `Hold ${index + 1}`)
      .slice(0, 6);
    return names.length >= 2 ? names : ["Hold 1", "Hold 2"];
  }

  function startGame() {
    if (!getSongPool(selectedCategory).length) return;
    setupTeamNames = collectTeamNames();
    saveSetupTeams();
    state = createGameState(setupTeamNames);
    drawNextSong();
    saveGame();
    render();
    showTurnSplash(getActiveTeam(), state.round || 1);
  }

  function restoreGame() {
    const saved = normalizeState(readStorage(STORAGE_KEY, createEmptyState()));
    if (!saved.started || saved.finished) return;
    state = saved;
    render();
  }

  function resetGame() {
    setPlaybackActive(false);
    state = createEmptyState();
    safeRemoveStorage(STORAGE_KEY);
    render();
  }

  function drawNextSong() {
    const unused = getActiveSongPool().filter((song) => !state.usedSongIds.includes(song.id));
    if (!unused.length) {
      finishGame("deck");
      return false;
    }

    const song = unused[Math.floor(Math.random() * unused.length)];
    const team = getActiveTeam();
    state.currentSongId = song.id;
    state.round += 1;
    state.phase = "guess";
    state.selectedSlot = team?.timeline.length ? -1 : 0;
    if (els.bonusGuess) els.bonusGuess.checked = false;
    return true;
  }

  function revealSong() {
    const song = getCurrentSong();
    const team = getActiveTeam();
    const timeline = team ? team.timeline.slice().sort(byYear) : [];
    if (!song || state.selectedSlot < 0) return;

    const result = evaluatePlacement(timeline, song, state.selectedSlot);
    state.phase = "reveal";
    saveGame();
    renderRound();
    triggerRevealFeedback(result.correct, getTeamColor(state.activeTeamIndex));
    playUiSound(result.correct ? "flip" : "wrong");
  }

  function applyScoreAction(action) {
    const song = getCurrentSong();
    const team = getActiveTeam();
    if (!song || !team) return;

    const pointDelta = action === "award" ? 1 : action === "penalty" ? -1 : 0;
    const bonusDelta = els.bonusGuess.checked ? 1 : 0;
    const shouldKeep = action === "award" || action === "keep";
    const awardedPoints = pointDelta + bonusDelta > 0;

    team.score += pointDelta + bonusDelta;
    team.playedSongIds = [...new Set([...(team.playedSongIds || []), song.id])];
    if (shouldKeep) addSongToTimeline(team, song);
    if (awardedPoints) playUiSound("point");

    state.usedSongIds = [...new Set([...state.usedSongIds, song.id])];
    state.currentSongId = "";
    state.selectedSlot = -1;
    els.bonusGuess.checked = false;

    pausePlayback();

    if (team.score >= WINNING_SCORE) {
      finishGame("score");
      return;
    }

    state.phase = "guess";
    state.activeTeamIndex = (state.activeTeamIndex + 1) % state.teams.length;

    if (remainingSongCount() <= 0) {
      finishGame("deck");
      return;
    }

    if (!drawNextSong()) return;
    saveGame();
    render();
    showTurnSplash(getActiveTeam(), state.round || 1);
  }

  function addSongToTimeline(team, song) {
    const item = {
      songId: song.id,
      title: song.title,
      artist: song.artist,
      year: song.year,
      round: state.round,
    };
    team.timeline = team.timeline.filter((entry) => entry.songId !== song.id).concat(item).sort(byYear);
  }

  function adjustTeamScore(index, delta) {
    const team = state.teams[index];
    if (!team) return;
    team.score += delta;
    if (!state.finished && team.score >= WINNING_SCORE) {
      finishGame("score");
      return;
    }
    saveGame();
    renderScoreboard();
  }

  function finishGame(reason) {
    state.finished = true;
    state.phase = "finished";
    state.finishReason = reason;
    state.currentSongId = "";
    setPlaybackActive(false);
    pausePlayback();
    saveGame();
    render();
    submitHighscore();
    launchConfetti(getTeamColor(getWinnerTeamIndex()), true);
    playUiSound("fanfare");
  }

  function renderRound() {
    if (!els.gameScreen || els.gameScreen.hidden) return;

    const team = getActiveTeam();
    const song = getCurrentSong();
    const timeline = team ? team.timeline.slice().sort(byYear) : [];
    const songNumber = getTeamTurnNumber(team, song);
    const songLabel = song ? `Sang nr. ${songNumber}` : "Ingen sang";
    const activeColor = getTeamColor(state.activeTeamIndex);

    document.body.style.setProperty("--active-team-color", activeColor);
    els.sangquizApp.style.setProperty("--active-team-color", activeColor);
    els.roundNumber.textContent = songLabel;
    els.deckStatus.textContent = team
      ? `${team.name}: ${teamSongCount(team)} spillet · ${remainingSongCount()} i puljen`
      : `${remainingSongCount()} i puljen`;
    els.activeTeamName.textContent = team ? team.name : "Hold";
    els.hiddenSongLabel.textContent = songLabel;
    els.recordLabel.textContent = team ? team.name : "Plade";
    renderCurrentSongCard(song, songNumber);
    els.revealButton.disabled = !song || state.phase === "reveal" || state.selectedSlot < 0;
    els.playHiddenButton.disabled = !song;
    els.pauseButton.disabled = !song || (!spotify.deviceId && !playbackActive);

    if (song) {
      els.djFallbackLink.href = getSpotifyUrl(song);
      els.djFallbackLink.removeAttribute("aria-disabled");
    } else {
      els.djFallbackLink.href = "#";
      els.djFallbackLink.setAttribute("aria-disabled", "true");
    }

    renderPlacementTimeline(timeline);
    renderRevealPanel(song, timeline);
    updateSpotifyUi();
  }

  function renderCurrentSongCard(song, songNumber) {
    const counterText = song ? `SANG ${String(state.round || songNumber || 1).padStart(4, "0")}` : "SANG 0000";
    if (els.recordCounter.textContent !== counterText) {
      els.recordCounter.textContent = counterText;
      if (lastRecordCounter && lastRecordCounter !== counterText) {
        els.recordCounter.classList.remove("is-rolling");
        void els.recordCounter.offsetWidth;
        els.recordCounter.classList.add("is-rolling");
      }
      lastRecordCounter = counterText;
    }

    els.currentCardBackNumber.textContent = counterText;
    els.nowSongCard.classList.toggle("is-revealed", state.phase === "reveal" && Boolean(song));
    els.nowSongCard.toggleAttribute("aria-busy", !song);
    if (!song) {
      els.currentCardFrontYear.textContent = "0000";
      els.currentCardFrontTitle.textContent = "Ingen sang";
      els.currentCardFrontArtist.textContent = "";
      return;
    }

    els.currentCardFrontYear.textContent = String(song.year);
    els.currentCardFrontTitle.textContent = song.title;
    els.currentCardFrontArtist.textContent = song.artist;
  }

  function renderPlacementTimeline(timeline) {
    els.placementSlots.replaceChildren();
    const song = state.phase === "reveal" ? getCurrentSong() : null;
    const correctSlot = song ? getCorrectSlot(timeline, song.year) : -1;

    if (!timeline.length) {
      els.placementSlots.append(createSlotButton(0, "Læg her", "som første sang", correctSlot));
      state.selectedSlot = 0;
      return;
    }

    for (let index = 0; index <= timeline.length; index += 1) {
      els.placementSlots.append(createSlotButton(index, "Læg her", formatSlot(timeline, index), correctSlot));
      if (timeline[index]) els.placementSlots.append(createTimelineCard(timeline[index], index));
    }
  }

  function createSlotButton(index, mainLabel, hint, correctSlot) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "slot-button";
    button.dataset.slot = String(index);
    button.setAttribute("aria-label", `Placér ${hint}`);
    button.setAttribute("aria-pressed", index === state.selectedSlot ? "true" : "false");
    if (index === correctSlot) button.dataset.correctSlot = "true";
    if (state.phase === "reveal" && index === state.selectedSlot && index !== correctSlot) {
      button.dataset.missedSlot = "true";
    }

    const main = document.createElement("span");
    main.className = "slot-main";
    main.textContent = mainLabel;

    const detail = document.createElement("span");
    detail.className = "slot-hint";
    detail.textContent = hint;

    button.append(main, detail);
    return button;
  }

  function createTimelineCard(entry, index) {
    const card = document.createElement("article");
    card.className = "timeline-card song-card is-revealed";
    card.setAttribute("aria-label", `${entry.title} af ${entry.artist} fra ${entry.year}`);

    const inner = document.createElement("div");
    inner.className = "song-card-inner";

    const back = document.createElement("div");
    back.className = "song-card-face song-card-back";

    const mark = document.createElement("span");
    mark.className = "song-card-mark";
    mark.textContent = "?";

    const number = document.createElement("span");
    number.className = "song-card-number";
    number.textContent = `SANG ${String(entry.round || index + 1).padStart(4, "0")}`;

    back.append(mark, number);

    const front = document.createElement("div");
    front.className = "song-card-face song-card-front";

    const year = document.createElement("strong");
    year.className = "song-card-year";
    year.textContent = entry.year;

    const title = document.createElement("span");
    title.className = "song-card-title";
    title.textContent = entry.title;

    const artist = document.createElement("small");
    artist.className = "song-card-artist";
    artist.textContent = entry.artist;

    front.append(year, title, artist);
    inner.append(back, front);
    card.append(inner);
    return card;
  }

  function renderRevealPanel(song, timeline) {
    els.revealPanel.hidden = state.phase !== "reveal" || !song;
    if (!song) return;

    const result = evaluatePlacement(timeline, song, state.selectedSlot);
    els.revealTitle.textContent = song.title;
    els.revealArtist.textContent = song.artist;
    els.revealYear.textContent = String(song.year);
    els.placementResult.textContent = result.correct
      ? `Korrekt placering: ${formatSlot(timeline, state.selectedSlot)}`
      : `Ikke korrekt. Rigtig placering: ${formatSlot(timeline, getCorrectSlot(timeline, song.year))}`;
    els.placementResult.dataset.correct = result.correct ? "true" : "false";
  }

  function renderScoreboard() {
    els.scoreboard.replaceChildren();

    if (!state.teams.length) {
      const empty = document.createElement("p");
      empty.className = "empty-note";
      empty.textContent = "Ingen hold startet";
      els.scoreboard.append(empty);
      return;
    }

    const maxScore = Math.max(...state.teams.map((team) => team.score));

    state.teams.forEach((team, index) => {
      const teamColor = getTeamColor(index);
      const row = document.createElement("article");
      row.className = "score-row";
      row.style.setProperty("--team-color", teamColor);
      row.dataset.active = index === state.activeTeamIndex && !state.finished ? "true" : "false";
      row.dataset.leading = maxScore > 0 && team.score === maxScore ? "true" : "false";
      row.dataset.matchball = team.score >= WINNING_SCORE - 1 && team.score < WINNING_SCORE ? "true" : "false";

      const name = document.createElement("div");
      name.className = "score-name";

      const strong = document.createElement("strong");
      strong.textContent = team.name;

      const roundCount = teamSongCount(team);
      const small = document.createElement("small");
      small.textContent = `${roundCount} ${roundCount === 1 ? "runde" : "runder"} spillet`;

      name.append(strong, small);

      const score = document.createElement("div");
      score.className = "score-value";
      score.textContent = String(team.score);

      const controls = document.createElement("div");
      controls.className = "score-controls";
      controls.append(createScoreButton(index, -1), createScoreButton(index, 1));

      const track = createScoreTrack(team.score);

      row.append(name, controls, score, track);
      els.scoreboard.append(row);
    });
  }

  function createScoreTrack(score) {
    const track = document.createElement("div");
    track.className = "score-track";
    track.setAttribute("aria-label", `Aktuel score: ${score} af ${WINNING_SCORE} point`);

    const currentScore = clamp(Number(score) || 0, 0, WINNING_SCORE);
    for (let value = 1; value <= WINNING_SCORE; value += 1) {
      const tick = document.createElement("span");
      tick.className = "score-tick";
      tick.textContent = String(value);
      tick.dataset.filled = value <= currentScore ? "true" : "false";
      if (value === WINNING_SCORE) tick.dataset.target = "true";
      track.append(tick);
    }

    return track;
  }

  function createScoreButton(index, delta) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-button";
    button.dataset.scoreTeam = String(index);
    button.dataset.scoreDelta = String(delta);
    button.textContent = delta > 0 ? "+" : "-";
    button.ariaLabel = `${delta > 0 ? "Giv" : "Fjern"} point`;
    return button;
  }

  function renderFinish() {
    if (!state.finished) return;

    const winners = getWinners();
    const maxScore = winners.length ? winners[0].score : 0;
    els.finishTitle.textContent = winners.length
      ? winners.map((winner) => winner.name).join(" & ")
      : "Spillet er slut";
    els.finishSummary.textContent = state.finishReason === "score"
      ? `Først til ${WINNING_SCORE} point · ${state.round} runder spillet`
      : `${state.round} runder spillet · vinderpoint ${maxScore}`;
    els.winnerList.replaceChildren();

    state.teams.forEach((team, index) => {
      const item = document.createElement("li");
      item.style.setProperty("--team-color", getTeamColor(index));

      const name = document.createElement("strong");
      name.textContent = team.name;

      const score = document.createElement("span");
      score.textContent = `${team.score} point`;

      const years = team.timeline
        .slice()
        .sort(byYear)
        .map((entry) => entry.year)
        .join(" · ");
      const path = document.createElement("small");
      path.textContent = years ? `${team.timeline.length} gemte kort: ${years}` : "Ingen gemte kort";

      item.append(name, score, path);
      els.winnerList.append(item);
    });
  }

  function updateModeUi() {
    els.modeButtons.forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.sangquizMode === mode ? "true" : "false");
    });
  }

  function setMode(nextMode) {
    mode = nextMode === "phone" ? "phone" : "screen";
    safeSetStorage(MODE_KEY, mode);
    render();
  }

  function updateSoundUi() {
    if (!els.soundToggleButton) return;
    els.soundToggleButton.textContent = soundEnabled ? "Lyde til" : "Lyde fra";
    els.soundToggleButton.setAttribute("aria-pressed", soundEnabled ? "true" : "false");
  }

  function toggleSound() {
    soundEnabled = !soundEnabled;
    safeSetStorage(SOUND_KEY, String(soundEnabled));
    updateSoundUi();
    if (soundEnabled) {
      ensureAudioContext();
      playUiSound("point");
    }
  }

  function getActiveTeam() {
    return state.teams[state.activeTeamIndex] || null;
  }

  function getActiveTimeline(source = state) {
    return source.teams[source.activeTeamIndex]?.timeline || [];
  }

  function getCurrentSong() {
    return ALL_SONGS.find((song) => song.id === state.currentSongId) || null;
  }

  function remainingSongCount() {
    return getActiveSongPool().filter((song) => !state.usedSongIds.includes(song.id)).length;
  }

  function teamSongCount(team) {
    if (Array.isArray(team.playedSongIds)) return team.playedSongIds.length;
    return team.timeline.length;
  }

  function getTeamTurnNumber(team, song) {
    if (!team) return state.round || 1;
    return teamSongCount(team) + (song ? 1 : 0);
  }

  function evaluatePlacement(timeline, song, slot) {
    const before = timeline[slot - 1];
    const after = timeline[slot];
    return {
      correct: (!before || song.year >= before.year) && (!after || song.year <= after.year),
    };
  }

  function getCorrectSlot(timeline, year) {
    const sorted = timeline.slice().sort(byYear);
    const index = sorted.findIndex((entry) => year < entry.year);
    return index === -1 ? sorted.length : index;
  }

  function formatSlot(timeline, slot) {
    if (!timeline.length) return "som første sang";
    if (slot <= 0) return `før ${timeline[0].year}`;
    if (slot >= timeline.length) return `efter ${timeline[timeline.length - 1].year}`;
    return `mellem ${timeline[slot - 1].year} og ${timeline[slot].year}`;
  }

  function getWinners() {
    if (!state.teams.length) return [];
    const maxScore = Math.max(...state.teams.map((team) => team.score));
    return state.teams.filter((team) => team.score === maxScore);
  }

  function getWinnerTeamIndex() {
    const winner = getWinners()[0];
    if (!winner) return state.activeTeamIndex || 0;
    const index = state.teams.findIndex((team) => team.id === winner.id);
    return index >= 0 ? index : 0;
  }

  function getTeamColor(index) {
    const safeIndex = Number.isFinite(Number(index)) ? Number(index) : 0;
    return TEAM_COLORS[((safeIndex % TEAM_COLORS.length) + TEAM_COLORS.length) % TEAM_COLORS.length];
  }

  function setSongCategory(category) {
    selectedCategory = normalizeCategory(category);
    safeSetStorage(CATEGORY_KEY, selectedCategory);
    if (!state.started || state.finished) state.songCategory = selectedCategory;
    render();
  }

  function updateCategoryUi() {
    if (!els.categoryButtons) return;
    const category = state.started && !state.finished ? state.songCategory : selectedCategory;
    els.categoryButtons.forEach((button) => {
      const pressed = button.dataset.songCategory === category;
      button.setAttribute("aria-pressed", pressed ? "true" : "false");
    });
    if (els.categoryStatus) {
      els.categoryStatus.textContent = `${getSongPool(category).length} sange i ${CATEGORY_LABELS[category].toLowerCase()} pulje`;
    }
  }

  function getActiveSongPool() {
    return getSongPool(state.started && !state.finished ? state.songCategory : selectedCategory);
  }

  function getSongPool(category) {
    const normalized = normalizeCategory(category);
    if (normalized === "mixed") return ALL_SONGS;
    return ALL_SONGS.filter((song) => song.category === normalized);
  }

  function normalizeCategory(category) {
    return Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, category) ? category : "mixed";
  }

  function saveGame() {
    safeSetStorage(STORAGE_KEY, JSON.stringify(state));
  }

  function readStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function readTextStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : raw;
    } catch {
      return fallback;
    }
  }

  function getSpotifyClientId() {
    return readTextStorage(CLIENT_ID_KEY, DEFAULT_CLIENT_ID).trim() || DEFAULT_CLIENT_ID;
  }

  function safeSetStorage(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* localStorage is optional for the quiz flow. */
    }
  }

  function safeRemoveStorage(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* localStorage is optional for the quiz flow. */
    }
  }

  function setPlaybackActive(active) {
    playbackActive = Boolean(active);
    document.body.dataset.playback = playbackActive ? "playing" : "idle";
    if (els.playHiddenButton) updateSpotifyUi();
  }

  function showTurnSplash(team, songNumber) {
    if (!els.turnSplash || !team) return;
    window.clearTimeout(splashTimer);

    const color = getTeamColor(state.activeTeamIndex);
    els.turnSplash.style.background = color;
    els.turnSplashTeam.textContent = team.name;
    els.turnSplashSong.textContent = `Sang nr. ${songNumber}`;
    els.turnSplash.hidden = false;
    els.turnSplash.setAttribute("aria-hidden", "false");

    splashTimer = window.setTimeout(() => {
      els.turnSplash.setAttribute("aria-hidden", "true");
      window.setTimeout(() => {
        els.turnSplash.hidden = true;
      }, 220);
    }, TURN_SPLASH_MS);
  }

  function triggerRevealFeedback(correct, color) {
    if (!els.nowSongCard) return;

    delete els.nowSongCard.dataset.feedback;
    void els.nowSongCard.offsetWidth;
    els.nowSongCard.dataset.feedback = correct ? "correct" : "wrong";

    window.clearTimeout(feedbackTimer);
    feedbackTimer = window.setTimeout(() => {
      delete els.nowSongCard.dataset.feedback;
    }, 760);

    if (correct) launchConfetti(color, false);
  }

  function launchConfetti(color, big) {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const layer = document.createElement("div");
    layer.className = "confetti-layer";
    layer.dataset.big = big ? "true" : "false";
    layer.setAttribute("aria-hidden", "true");

    const count = big ? 86 : 26;
    const colors = [color, "#E5A83B", "#F6EFE2"];
    for (let index = 0; index < count; index += 1) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.style.setProperty("--piece-color", colors[index % colors.length]);
      piece.style.setProperty("--piece-rotate", `${Math.round(Math.random() * 360)}deg`);

      if (big) {
        piece.style.left = `${Math.random() * 100}%`;
        piece.style.setProperty("--piece-x", `${Math.round((Math.random() - 0.5) * 180)}px`);
        piece.style.animationDelay = `${Math.random() * 0.55}s`;
      } else {
        piece.style.setProperty("--piece-x", `${Math.round((Math.random() - 0.5) * 520)}px`);
        piece.style.setProperty("--piece-y", `${Math.round(-120 - Math.random() * 310)}px`);
      }

      layer.append(piece);
    }

    document.body.append(layer);
    window.setTimeout(() => layer.remove(), big ? 3100 : 1150);
  }

  function ensureAudioContext() {
    if (audioContext) return audioContext;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioContext = new AudioContextClass();
    return audioContext;
  }

  function playUiSound(kind) {
    if (!soundEnabled) return;

    const context = ensureAudioContext();
    if (!context) return;
    if (context.state === "suspended") void context.resume().catch(() => {});

    const now = context.currentTime + 0.01;
    const patterns = {
      flip: [[420, 0.07, 0], [680, 0.09, 0.08]],
      wrong: [[180, 0.12, 0], [130, 0.14, 0.12]],
      point: [[520, 0.08, 0], [830, 0.11, 0.09]],
      fanfare: [[440, 0.16, 0], [660, 0.16, 0.16], [880, 0.24, 0.32]],
    };

    (patterns[kind] || patterns.flip).forEach(([frequency, duration, delay]) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = kind === "wrong" ? "sawtooth" : "triangle";
      oscillator.frequency.setValueAtTime(frequency, now + delay);
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.055, now + delay + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + delay);
      oscillator.stop(now + delay + duration + 0.02);
    });
  }

  function submitHighscore() {
    if (state.highscoreSubmitted || !window.WutborgHighscores?.submit) return;

    const winners = getWinners();
    const score = winners.length ? winners[0].score : 0;
    state.highscoreSubmitted = true;
    saveGame();

    void window.WutborgHighscores.submit({
      gameKey: "sangquiz",
      gameTitle: "Sangquiz",
      playerName: winners.map((winner) => winner.name).join(" & ") || "Sangquiz",
      score,
      outcome: "completed",
      details: {
        rounds: state.round,
        finishReason: state.finishReason,
        teams: state.teams.map((team) => ({
          name: team.name,
          score: team.score,
          songsPlayed: teamSongCount(team),
          cards: team.timeline.length,
        })),
      },
    });
  }

  function updateRedirectUri() {
    els.spotifyRedirectUri.value = getRedirectUri();
  }

  function updateSpotifyUi() {
    const clientId = els.spotifyClientId.value.trim() || DEFAULT_CLIENT_ID;
    const token = readToken();
    const hasToken = Boolean(token?.access_token || token?.refresh_token);
    els.spotifyLoginButton.disabled = !clientId;
    els.spotifyConnectButton.disabled = !clientId || spotify.connecting || !hasToken;
    els.spotifyModeStatus.textContent = spotify.status;
    const fallbackLabel = mode === "screen" ? "Start musikvisning" : "Åbn Spotify";
    els.playHiddenButton.textContent = playbackActive ? "Musik kører" : hasToken && spotify.ready ? "Afspil" : fallbackLabel;
    els.pauseButton.disabled = !getCurrentSong() || (!spotify.deviceId && !playbackActive);
  }

  function setSpotifyStatus(message) {
    spotify.status = message;
    if (els.spotifyModeStatus) els.spotifyModeStatus.textContent = message;
  }

  async function autoConnectSpotifyFromSavedLogin() {
    const token = readToken();
    if (!token?.access_token && !token?.refresh_token) return;
    if (spotify.ready || spotify.connecting) return;

    setSpotifyStatus("Forbinder Spotify automatisk");
    updateSpotifyUi();
    await connectSpotifyPlayer();
  }

  function getRedirectUri() {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    return url.toString();
  }

  async function startSpotifyLogin() {
    const clientId = els.spotifyClientId.value.trim() || DEFAULT_CLIENT_ID;
    if (!clientId) return;
    if (!window.crypto?.subtle) {
      setSpotifyStatus("Spotify login kræver HTTPS eller localhost");
      return;
    }

    safeSetStorage(CLIENT_ID_KEY, clientId);
    const verifier = randomString(96);
    const challenge = await createCodeChallenge(verifier);
    const authState = randomString(24);
    const redirectUri = getRedirectUri();

    safeSetStorage(PKCE_KEY, JSON.stringify({ verifier, authState, clientId, redirectUri }));

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      scope: SPOTIFY_SCOPES,
      redirect_uri: redirectUri,
      state: authState,
      code_challenge_method: "S256",
      code_challenge: challenge,
    });

    window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  async function handleSpotifyCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");
    if (error) {
      setSpotifyStatus(`Spotify afviste login: ${error}`);
      return;
    }
    if (!code) {
      const token = readToken();
      setSpotifyStatus(token?.refresh_token ? "Spotify login gemt" : spotify.status);
      updateSpotifyUi();
      return;
    }

    const saved = readStorage(PKCE_KEY, null);
    if (!saved?.verifier || saved.authState !== params.get("state")) {
      throw new Error("manglende PKCE state");
    }

    const body = new URLSearchParams({
      client_id: saved.clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: saved.redirectUri,
      code_verifier: saved.verifier,
    });

    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) throw new Error(`token status ${response.status}`);

    const token = await response.json();
    saveToken(token);
    safeSetStorage(CLIENT_ID_KEY, saved.clientId);
    safeRemoveStorage(PKCE_KEY);
    window.history.replaceState(null, document.title, saved.redirectUri);
    setSpotifyStatus("Spotify login gemt");
    updateSpotifyUi();
  }

  function readToken() {
    return readStorage(TOKEN_KEY, null);
  }

  function saveToken(token) {
    const current = readToken() || {};
    const expiresIn = Number(token.expires_in) || 3600;
    safeSetStorage(
      TOKEN_KEY,
      JSON.stringify({
        ...current,
        ...token,
        refresh_token: token.refresh_token || current.refresh_token,
        expires_at: Date.now() + expiresIn * 1000 - 60000,
      }),
    );
  }

  async function getAccessToken() {
    const token = readToken();
    if (token?.access_token && Number(token.expires_at) > Date.now()) return token.access_token;
    if (!token?.refresh_token) return "";

    const clientId = els.spotifyClientId.value.trim() || getSpotifyClientId();
    if (!clientId) return "";

    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
    });

    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) {
      setSpotifyStatus(`Spotify token kunne ikke fornyes (${response.status})`);
      return "";
    }

    const refreshed = await response.json();
    saveToken(refreshed);
    return refreshed.access_token;
  }

  async function connectSpotifyPlayer() {
    const token = await getAccessToken();
    if (!token) {
      setSpotifyStatus("Log ind med Spotify først");
      updateSpotifyUi();
      return;
    }

    spotify.connecting = true;
    updateSpotifyUi();

    try {
      await loadSpotifySdk();
      if (!spotify.player) {
        spotify.player = new Spotify.Player({
          name: "Wutborg Sangquiz",
          getOAuthToken: async (callback) => callback(await getAccessToken()),
          volume: 0.85,
        });

        spotify.player.addListener("ready", ({ device_id: deviceId }) => {
          spotify.deviceId = deviceId;
          spotify.ready = true;
          setSpotifyStatus("Spotify afspiller klar");
          updateSpotifyUi();
        });

        spotify.player.addListener("not_ready", () => {
          spotify.ready = false;
          setSpotifyStatus("Spotify afspiller ikke klar");
          updateSpotifyUi();
        });

        spotify.player.addListener("autoplay_failed", () => {
          setSpotifyStatus("iPad blokerede autoplay. Tryk Afspil igen.");
          updateSpotifyUi();
        });

        ["initialization_error", "authentication_error", "account_error", "playback_error"].forEach(
          (eventName) => {
            spotify.player.addListener(eventName, ({ message }) => {
              setSpotifyStatus(`Spotify fejl: ${message}`);
              updateSpotifyUi();
            });
          },
        );
      }

      await spotify.player.connect();
      setSpotifyStatus(spotify.ready ? "Spotify afspiller klar" : "Forbinder Spotify afspiller");
    } catch (error) {
      setSpotifyStatus(`Spotify SDK fejlede: ${error.message}`);
    } finally {
      spotify.connecting = false;
      updateSpotifyUi();
    }
  }

  function loadSpotifySdk() {
    if (window.Spotify?.Player) return Promise.resolve();
    if (spotify.sdkPromise) return spotify.sdkPromise;

    spotify.sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      script.onerror = () => reject(new Error("SDK script kunne ikke hentes"));
      window.onSpotifyWebPlaybackSDKReady = () => resolve();
      document.head.append(script);
    });

    return spotify.sdkPromise;
  }

  async function playCurrentSong() {
    activateSpotifyElement();

    const song = getCurrentSong();
    if (!song) return;

    const savedToken = readToken();
    if (!savedToken?.access_token && !savedToken?.refresh_token) {
      const fallbackOpened = openDjFallback(song);
      setPlaybackActive(fallbackOpened);
      setSpotifyStatus(getFallbackStatus(fallbackOpened));
      updateSpotifyUi();
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      const fallbackOpened = openDjFallback(song);
      setPlaybackActive(fallbackOpened);
      setSpotifyStatus(getFallbackStatus(fallbackOpened));
      updateSpotifyUi();
      return;
    }

    if (!spotify.ready || !spotify.deviceId) {
      await connectSpotifyPlayer();
      if (!spotify.deviceId) {
        const fallbackOpened = openDjFallback(song);
        setPlaybackActive(fallbackOpened);
        setSpotifyStatus(getFallbackStatus(fallbackOpened));
        updateSpotifyUi();
        return;
      }
    }

    let uri = spotify.resolvedUris[song.id] || song.spotifyUri || "";
    let ok = uri ? await startSpotifyUri(token, uri) : false;
    if (!ok) {
      uri = await resolveSongUri(token, song);
      ok = Boolean(uri) && (await startSpotifyUri(token, uri));
    }

    const fallbackOpened = ok ? false : openDjFallback(song);
    setPlaybackActive(ok || fallbackOpened);
    setSpotifyStatus(ok ? "Afspiller sang" : getFallbackStatus(fallbackOpened));
    updateSpotifyUi();
  }

  function openDjFallback(song) {
    if (mode === "screen") return true;
    return Boolean(window.open(getSpotifyUrl(song), "_blank", "noopener,noreferrer"));
  }

  function getFallbackStatus(opened) {
    if (!opened) return "Brug Åbn manuelt";
    return mode === "screen" ? "Musikvisning startet" : "Manuel DJ åbnet i Spotify";
  }

  function activateSpotifyElement() {
    if (!spotify.player?.activateElement) return false;
    try {
      const activation = spotify.player.activateElement();
      if (activation?.catch) void activation.catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  function getSpotifyUrl(song) {
    if (song.spotifyUrl) return song.spotifyUrl;
    return `https://open.spotify.com/search/${encodeURIComponent(`${song.title} ${song.artist}`)}`;
  }

  async function startSpotifyUri(token, uri) {
    const response = await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(spotify.deviceId)}`,
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ uris: [uri] }),
      },
    );

    if (response.ok || response.status === 204) return true;
    if (response.status === 403) setSpotifyStatus("Spotify Premium kræves til browserafspilning");
    return false;
  }

  async function resolveSongUri(token, song) {
    const query = encodeURIComponent(`track:${song.title} artist:${song.artist.split(" feat. ")[0]}`);
    const response = await fetch(`https://api.spotify.com/v1/search?type=track&limit=1&q=${query}`, {
      headers: { authorization: `Bearer ${token}` },
    });

    if (!response.ok) return "";
    const data = await response.json();
    const uri = data.tracks?.items?.[0]?.uri || "";
    if (uri) spotify.resolvedUris[song.id] = uri;
    return uri;
  }

  async function pausePlayback() {
    setPlaybackActive(false);
    if (!spotify.deviceId) return;
    const token = await getAccessToken();
    if (!token) return;

    await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${encodeURIComponent(spotify.deviceId)}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

  function randomString(length) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = new Uint8Array(length);
    if (window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      bytes.forEach((_, index) => {
        bytes[index] = Math.floor(Math.random() * 256);
      });
    }
    return [...bytes].map((byte) => chars[byte % chars.length]).join("");
  }

  async function createCodeChallenge(verifier) {
    const data = new TextEncoder().encode(verifier);
    const digest = await window.crypto.subtle.digest("SHA-256", data);
    return base64UrlEncode(digest);
  }

  function base64UrlEncode(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
