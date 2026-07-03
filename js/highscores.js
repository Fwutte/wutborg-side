(() => {
  "use strict";

  const endpoint = "/api/highscores";

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
      player_name: String(payload.playerName || payload.player_name || "").trim(),
      score: Math.max(0, Math.round(score)),
      outcome: String(payload.outcome || "completed").trim().toLowerCase(),
      details:
        payload.details && typeof payload.details === "object"
          ? payload.details
          : undefined,
    };
  }

  async function submit(payload) {
    const body = normalizePayload(payload);
    if (!body || typeof fetch !== "function") return { ok: false, skipped: true };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        keepalive: true,
        body: JSON.stringify(body),
      });

      return response.ok
        ? { ok: true, entry: await response.json().catch(() => null) }
        : { ok: false, status: response.status };
    } catch (error) {
      console.debug?.("Highscore kunne ikke gemmes", error);
      return { ok: false, error };
    }
  }

  window.WutborgHighscores = {
    submit,
  };
})();
