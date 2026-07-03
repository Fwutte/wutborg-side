import {
  bad,
  bodyJson,
  cleanText,
  json,
  withErrors,
} from "../_helpers.js";

const GAME_KEY = /^[a-z0-9._-]{1,60}$/;
const OUTCOMES = new Set(["completed", "won", "lost", "draw", "gameover"]);

const scoreValue = (value) => {
  const score = Number(value);
  return Number.isInteger(score) && score >= 0 && score <= 999999999
    ? score
    : null;
};

const detailsJson = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "object" || Array.isArray(value)) return "";

  const text = JSON.stringify(value);
  return text.length <= 2000 ? text : "";
};

const readDetails = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const onRequestGet = withErrors(async ({ request, env }) => {
  const url = new URL(request.url);
  const gameKey = cleanText(
    url.searchParams.get("game_key") || url.searchParams.get("game"),
    60
  ).toLowerCase();
  const requestedLimit = Number(url.searchParams.get("limit") || 10);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 50)
    : 10;

  const statement = gameKey
    ? env.DB.prepare(
        `SELECT id, game_key, game_title, player_name, score, outcome, details,
                device_id, completed_at
           FROM highscores
          WHERE game_key = ?
          ORDER BY score DESC, completed_at, id
          LIMIT ?`
      ).bind(gameKey, limit)
    : env.DB.prepare(
        `SELECT id, game_key, game_title, player_name, score, outcome, details,
                device_id, completed_at
           FROM highscores
          ORDER BY completed_at DESC, id DESC
          LIMIT ?`
      ).bind(limit);

  const { results } = await statement.all();
  return json(
    results.map((entry) => ({
      ...entry,
      details: readDetails(entry.details),
    }))
  );
});

export const onRequestPost = withErrors(async ({ request, env, data }) => {
  const body = await bodyJson(request);
  if (!body) return bad("Body skal vaere gyldig JSON");

  const gameKey = cleanText(body.game_key || body.gameKey, 60).toLowerCase();
  if (!GAME_KEY.test(gameKey)) {
    return bad("game_key maa kun indeholde a-z, 0-9, punktum, bindestreg og underscore");
  }

  const gameTitle = cleanText(body.game_title || body.gameTitle || gameKey, 80);
  if (!gameTitle) return bad("game_title mangler");

  const score = scoreValue(body.score);
  if (score === null) return bad("score skal vaere et heltal mellem 0 og 999999999");

  const suppliedOutcome = cleanText(body.outcome || "completed", 30).toLowerCase();
  const outcome = OUTCOMES.has(suppliedOutcome) ? suppliedOutcome : "";
  if (!outcome) return bad("outcome er ugyldig");

  const auth = data?.auth || {};
  const playerName =
    cleanText(body.player_name || body.playerName, 40) ||
    cleanText(auth.device_name, 40) ||
    "Spiller";

  const details = detailsJson(body.details);
  if (details === "") return bad("details skal vaere et objekt paa hoejst 2000 tegn");

  const result = await env.DB.prepare(
    `INSERT INTO highscores
       (game_key, game_title, player_name, score, outcome, details, device_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      gameKey,
      gameTitle,
      playerName,
      score,
      outcome,
      details,
      auth.device_id || null
    )
    .run();

  return json(
    {
      id: Number(result.meta.last_row_id),
      game_key: gameKey,
      game_title: gameTitle,
      player_name: playerName,
      score,
      outcome,
      details: readDetails(details),
    },
    201
  );
});
