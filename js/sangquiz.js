(() => {
  "use strict";

  const SONGS = Array.isArray(window.SANGQUIZ_SONGS) ? window.SANGQUIZ_SONGS : [];
  const STORAGE_KEY = "wutborg.sangquiz.game.v1";
  const TEAM_NAMES_KEY = "wutborg.sangquiz.teams.v1";
  const MODE_KEY = "wutborg.sangquiz.mode.v1";
  const CLIENT_ID_KEY = "wutborg.sangquiz.spotify.clientId";
  const TOKEN_KEY = "wutborg.sangquiz.spotify.token";
  const PKCE_KEY = "wutborg.sangquiz.spotify.pkce";
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

  const els = {};
  let state = createEmptyState();
  let setupTeamNames = ["Hold 1", "Hold 2"];
  let mode = readTextStorage(MODE_KEY, "screen");
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

    handleSpotifyCallback().catch((error) => {
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
      "round-number",
      "deck-status",
      "active-team-name",
      "hidden-song-label",
      "play-hidden-button",
      "pause-button",
      "dj-fallback-link",
      "reveal-button",
      "placement-slots",
      "active-timeline",
      "reveal-panel",
      "reveal-title",
      "reveal-artist",
      "reveal-year",
      "placement-result",
      "scoreboard",
      "end-game-button",
      "reset-game-button",
      "finish-summary",
      "winner-list",
      "new-game-button",
    ].forEach((id) => {
      els[toCamel(id)] = $(id);
    });

    els.modeButtons = [...document.querySelectorAll("[data-sangquiz-mode]")];
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
      selectedSlot: 0,
      currentSongId: "",
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
      teams: names.map((name, index) => ({
        id: `team-${Date.now()}-${index}`,
        name,
        score: 0,
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
      timeline: Array.isArray(team.timeline) ? team.timeline.slice().sort(byYear) : [],
    }));
    next.activeTeamIndex = clamp(Number(next.activeTeamIndex) || 0, 0, Math.max(0, next.teams.length - 1));
    next.selectedSlot = clamp(Number(next.selectedSlot) || 0, 0, getActiveTimeline(next).length);
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
    document.body.dataset.sangquizMode = mode;
    els.sangquizApp.dataset.mode = mode;
    els.setupScreen.hidden = state.started && !state.finished;
    els.gameScreen.hidden = !state.started || state.finished;
    els.finishScreen.hidden = !state.finished;

    els.appStatus.textContent = getAppStatus();
    renderSetupState();
    renderRound();
    renderScoreboard();
    renderFinish();
    updateModeUi();
    updateSpotifyUi();
  }

  function getAppStatus() {
    if (!SONGS.length) return "Sanglisten mangler";
    if (state.finished) return "Spil afsluttet";
    if (state.started) return `${remainingSongCount()} sange tilbage`;
    return `${SONGS.length} sange klar`;
  }

  function renderSetupState() {
    const hasSavedGame = Boolean(state.started && !state.finished && state.teams.length);
    els.restoreGameButton.hidden = !hasSavedGame;
    els.restoreGameButton.textContent = hasSavedGame
      ? `Fortsæt spil (${state.round || 1})`
      : "Fortsæt spil";

    const clientId = readTextStorage(CLIENT_ID_KEY, "");
    if (els.spotifyClientId.value !== clientId) els.spotifyClientId.value = clientId;
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
    if (!SONGS.length) return;
    setupTeamNames = collectTeamNames();
    saveSetupTeams();
    state = createGameState(setupTeamNames);
    drawNextSong();
    saveGame();
    render();
  }

  function restoreGame() {
    const saved = normalizeState(readStorage(STORAGE_KEY, createEmptyState()));
    if (!saved.started || saved.finished) return;
    state = saved;
    render();
  }

  function resetGame() {
    state = createEmptyState();
    safeRemoveStorage(STORAGE_KEY);
    render();
  }

  function drawNextSong() {
    const unused = SONGS.filter((song) => !state.usedSongIds.includes(song.id));
    if (!unused.length) {
      finishGame("deck");
      return;
    }

    const song = unused[Math.floor(Math.random() * unused.length)];
    const team = getActiveTeam();
    state.currentSongId = song.id;
    state.round += 1;
    state.phase = "guess";
    state.selectedSlot = team ? getCorrectSlot(team.timeline, song.year) : 0;
  }

  function revealSong() {
    if (!getCurrentSong()) return;
    state.phase = "reveal";
    saveGame();
    renderRound();
  }

  function applyScoreAction(action) {
    const song = getCurrentSong();
    const team = getActiveTeam();
    if (!song || !team) return;

    const pointDelta = action === "award" ? 1 : action === "penalty" ? -1 : 0;
    const shouldKeep = action === "award" || action === "keep";

    team.score += pointDelta;
    if (shouldKeep) addSongToTimeline(team, song);

    state.usedSongIds = [...new Set([...state.usedSongIds, song.id])];
    state.currentSongId = "";
    state.selectedSlot = 0;
    state.phase = "guess";
    state.activeTeamIndex = (state.activeTeamIndex + 1) % state.teams.length;

    pausePlayback();

    if (remainingSongCount() <= 0) {
      finishGame("deck");
      return;
    }

    drawNextSong();
    saveGame();
    render();
  }

  function addSongToTimeline(team, song) {
    const item = {
      songId: song.id,
      title: song.title,
      artist: song.artist,
      year: song.year,
    };
    team.timeline = team.timeline.filter((entry) => entry.songId !== song.id).concat(item).sort(byYear);
  }

  function adjustTeamScore(index, delta) {
    const team = state.teams[index];
    if (!team) return;
    team.score += delta;
    saveGame();
    renderScoreboard();
  }

  function finishGame(reason) {
    state.finished = true;
    state.phase = "finished";
    state.finishReason = reason;
    state.currentSongId = "";
    pausePlayback();
    saveGame();
    render();
    submitHighscore();
  }

  function renderRound() {
    if (!els.gameScreen || els.gameScreen.hidden) return;

    const team = getActiveTeam();
    const song = getCurrentSong();
    const timeline = team ? team.timeline.slice().sort(byYear) : [];

    els.roundNumber.textContent = `Runde ${state.round}`;
    els.deckStatus.textContent = `${state.usedSongIds.length} brugt · ${remainingSongCount()} tilbage`;
    els.activeTeamName.textContent = team ? team.name : "Hold";
    els.hiddenSongLabel.textContent = song ? `Skjult sang ${state.round}` : "Ingen sang";
    els.revealButton.disabled = !song || state.phase === "reveal";
    els.playHiddenButton.disabled = !song;
    els.pauseButton.disabled = !song || !spotify.deviceId;

    if (song) {
      els.djFallbackLink.href = song.spotifyUrl;
      els.djFallbackLink.removeAttribute("aria-disabled");
    } else {
      els.djFallbackLink.href = "#";
      els.djFallbackLink.setAttribute("aria-disabled", "true");
    }

    renderPlacementSlots(timeline);
    renderTimeline(timeline);
    renderRevealPanel(song, timeline);
    updateSpotifyUi();
  }

  function renderPlacementSlots(timeline) {
    els.placementSlots.replaceChildren();

    if (!timeline.length) {
      els.placementSlots.append(createSlotButton(0, "Første kort"));
      state.selectedSlot = 0;
      return;
    }

    for (let index = 0; index <= timeline.length; index += 1) {
      els.placementSlots.append(createSlotButton(index, formatSlot(timeline, index)));
    }
  }

  function createSlotButton(index, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "slot-button";
    button.dataset.slot = String(index);
    button.textContent = label;
    button.setAttribute("aria-pressed", index === state.selectedSlot ? "true" : "false");
    return button;
  }

  function renderTimeline(timeline) {
    els.activeTimeline.replaceChildren();

    if (!timeline.length) {
      const empty = document.createElement("p");
      empty.className = "empty-note";
      empty.textContent = "Ingen kort endnu";
      els.activeTimeline.append(empty);
      return;
    }

    timeline.forEach((entry) => {
      const card = document.createElement("article");
      card.className = "timeline-card";

      const year = document.createElement("strong");
      year.textContent = entry.year;

      const title = document.createElement("span");
      title.textContent = entry.title;

      const artist = document.createElement("small");
      artist.textContent = entry.artist;

      card.append(year, title, artist);
      els.activeTimeline.append(card);
    });
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

    state.teams.forEach((team, index) => {
      const row = document.createElement("article");
      row.className = "score-row";
      row.dataset.active = index === state.activeTeamIndex && !state.finished ? "true" : "false";

      const name = document.createElement("div");
      name.className = "score-name";

      const strong = document.createElement("strong");
      strong.textContent = team.name;

      const small = document.createElement("small");
      small.textContent = `${team.timeline.length} kort`;

      name.append(strong, small);

      const score = document.createElement("div");
      score.className = "score-value";
      score.textContent = String(team.score);

      const controls = document.createElement("div");
      controls.className = "score-controls";
      controls.append(createScoreButton(index, -1), createScoreButton(index, 1));

      row.append(name, score, controls);
      els.scoreboard.append(row);
    });
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
    els.finishSummary.textContent = `${state.round} runder spillet · vinderpoint ${maxScore}`;
    els.winnerList.replaceChildren();

    winners.forEach((winner) => {
      const item = document.createElement("li");
      item.textContent = `${winner.name} (${winner.score})`;
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

  function getActiveTeam() {
    return state.teams[state.activeTeamIndex] || null;
  }

  function getActiveTimeline(source = state) {
    return source.teams[source.activeTeamIndex]?.timeline || [];
  }

  function getCurrentSong() {
    return SONGS.find((song) => song.id === state.currentSongId) || null;
  }

  function remainingSongCount() {
    return SONGS.filter((song) => !state.usedSongIds.includes(song.id)).length;
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
    if (!timeline.length) return "Første kort";
    if (slot <= 0) return `Før ${timeline[0].year}`;
    if (slot >= timeline.length) return `Efter ${timeline[timeline.length - 1].year}`;
    return `${timeline[slot - 1].year} - ${timeline[slot].year}`;
  }

  function getWinners() {
    if (!state.teams.length) return [];
    const maxScore = Math.max(...state.teams.map((team) => team.score));
    return state.teams.filter((team) => team.score === maxScore);
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
          cards: team.timeline.length,
        })),
      },
    });
  }

  function updateRedirectUri() {
    els.spotifyRedirectUri.value = getRedirectUri();
  }

  function updateSpotifyUi() {
    const clientId = els.spotifyClientId.value.trim();
    const token = readToken();
    const hasToken = Boolean(token?.access_token || token?.refresh_token);
    els.spotifyLoginButton.disabled = !clientId;
    els.spotifyConnectButton.disabled = !clientId || spotify.connecting || !hasToken;
    els.spotifyModeStatus.textContent = spotify.status;
    els.playHiddenButton.textContent = hasToken && spotify.ready ? "Afspil skjult" : "Åbn i Spotify";
    els.pauseButton.disabled = !spotify.deviceId || !getCurrentSong();
  }

  function setSpotifyStatus(message) {
    spotify.status = message;
    if (els.spotifyModeStatus) els.spotifyModeStatus.textContent = message;
  }

  function getRedirectUri() {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    return url.toString();
  }

  async function startSpotifyLogin() {
    const clientId = els.spotifyClientId.value.trim();
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

    const clientId = els.spotifyClientId.value.trim() || readTextStorage(CLIENT_ID_KEY, "");
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
    const song = getCurrentSong();
    if (!song) return;

    const savedToken = readToken();
    if (!savedToken?.access_token && !savedToken?.refresh_token) {
      setSpotifyStatus(openDjFallback(song) ? "Manuel DJ åbnet i Spotify" : "Brug Åbn manuelt");
      updateSpotifyUi();
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      setSpotifyStatus(openDjFallback(song) ? "Manuel DJ åbnet i Spotify" : "Brug Åbn manuelt");
      updateSpotifyUi();
      return;
    }

    if (!spotify.ready || !spotify.deviceId) {
      await connectSpotifyPlayer();
      if (!spotify.deviceId) {
        setSpotifyStatus(openDjFallback(song) ? "Manuel DJ åbnet i Spotify" : "Brug Åbn manuelt");
        updateSpotifyUi();
        return;
      }
    }

    let uri = spotify.resolvedUris[song.id] || song.spotifyUri;
    let ok = await startSpotifyUri(token, uri);
    if (!ok) {
      uri = await resolveSongUri(token, song);
      ok = Boolean(uri) && (await startSpotifyUri(token, uri));
    }

    setSpotifyStatus(
      ok ? "Afspiller skjult sang" : openDjFallback(song) ? "Manuel DJ åbnet i Spotify" : "Brug Åbn manuelt",
    );
  }

  function openDjFallback(song) {
    return Boolean(window.open(song.spotifyUrl, "_blank", "noopener,noreferrer"));
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
