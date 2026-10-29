CREATE TABLE IF NOT EXISTS oenskelandet_cms_state (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  revision INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  public_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS oenskelandet_cms_history (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  action TEXT NOT NULL,
  state_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS oenskelandet_cms_media (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  record_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS oenskelandet_cms_sessions (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  csrf TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS oenskelandet_cms_session_expiry ON oenskelandet_cms_sessions(expires_at);
CREATE TABLE IF NOT EXISTS oenskelandet_cms_usage (
  id TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0 CHECK(value >= 0)
);
