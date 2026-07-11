(() => {
  "use strict";

  const STORAGE_KEY = "wutborg.highscores.v1";
  const MAX_ENTRIES_PER_GAME = 10;

  function normalizePayload(payload) {
    if (!payload || typeof payload !== "object") return null;

    const gameKey = String(payload.gameKey || payload.game_key || "")
      .trim()
      .toLowerCase();
    const score = Number(payload.score);

    if (!gameKey || !Number.isFinite(score)) return null;

    return {
      game_key: gameKey,
      game_title: String(payload.gameTitle || payload.game_title || gameKey).trim(),
      player_name:
        String(payload.playerName || payload.player_name || "").trim() ||
        "Spiller",
      score: Math.max(0, Math.round(score)),
      outcome: String(payload.outcome || "completed").trim().toLowerCase(),
      details:
        payload.details && typeof payload.details === "object"
          ? payload.details
          : undefined,
    };
  }

  function readStore() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    } catch {
      return {};
    }
  }

  function writeStore(value) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }

  function normalizeLimit(value) {
    const limit = Number(value);
    return Number.isInteger(limit)
      ? Math.min(Math.max(limit, 1), MAX_ENTRIES_PER_GAME)
      : MAX_ENTRIES_PER_GAME;
  }

  function sortEntries(entries) {
    return entries.sort(
      (left, right) =>
        right.score - left.score ||
        String(left.completed_at).localeCompare(String(right.completed_at)),
    );
  }

  async function submit(payload) {
    const body = normalizePayload(payload);
    if (!body) return { ok: false, skipped: true };

    try {
      const store = readStore();
      const entry = {
        ...body,
        id:
          globalThis.crypto?.randomUUID?.() || `${Date.now()}-${body.score}`,
        completed_at: new Date().toISOString(),
      };
      const entries = Array.isArray(store[body.game_key])
        ? store[body.game_key]
        : [];

      store[body.game_key] = sortEntries([...entries, entry]).slice(
        0,
        MAX_ENTRIES_PER_GAME,
      );
      writeStore(store);

      return { ok: true, local: true, entry };
    } catch (error) {
      console.debug?.("Lokal highscore kunne ikke gemmes", error);
      return { ok: false, error };
    }
  }

  function list(gameKey, limit = MAX_ENTRIES_PER_GAME) {
    const key = String(gameKey || "").trim().toLowerCase();
    const entries = readStore()[key];
    return Array.isArray(entries)
      ? sortEntries([...entries]).slice(0, normalizeLimit(limit))
      : [];
  }

  function best(gameKey) {
    return list(gameKey, 1)[0] || null;
  }

  window.WutborgHighscores = {
    best,
    list,
    submit,
    storage: "local",
  };
})();
