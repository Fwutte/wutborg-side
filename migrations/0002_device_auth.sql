-- Enhedsgodkendelse til madplanen.
-- Privatnøgler gemmes kun på enhederne; D1 gemmer public keys og sessions.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS auth_devices (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    public_key_jwk TEXT NOT NULL,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at   TEXT,
    revoked_at     TEXT
);

CREATE TABLE IF NOT EXISTS auth_challenges (
    id         TEXT PRIMARY KEY,
    device_id  TEXT NOT NULL REFERENCES auth_devices(id) ON DELETE CASCADE,
    challenge  TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    device_id  TEXT NOT NULL REFERENCES auth_devices(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_auth_challenges_device
    ON auth_challenges(device_id);
CREATE INDEX IF NOT EXISTS ix_auth_challenges_expires
    ON auth_challenges(expires_at);
CREATE INDEX IF NOT EXISTS ix_auth_sessions_device
    ON auth_sessions(device_id);
CREATE INDEX IF NOT EXISTS ix_auth_sessions_expires
    ON auth_sessions(expires_at);
