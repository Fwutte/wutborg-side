-- Highscores for familiens minispil.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS highscores (
    id          INTEGER PRIMARY KEY,
    game_key    TEXT    NOT NULL,
    game_title  TEXT    NOT NULL,
    player_name TEXT    NOT NULL DEFAULT 'Spiller',
    score       INTEGER NOT NULL CHECK (score >= 0),
    outcome     TEXT    NOT NULL DEFAULT 'completed',
    details     TEXT,
    device_id   TEXT REFERENCES auth_devices(id) ON DELETE SET NULL,
    completed_at TEXT   NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_highscores_game_score
    ON highscores(game_key, score DESC, completed_at, id);

CREATE INDEX IF NOT EXISTS ix_highscores_completed
    ON highscores(completed_at DESC, id);

CREATE INDEX IF NOT EXISTS ix_highscores_device
    ON highscores(device_id, completed_at DESC);
