CREATE TABLE IF NOT EXISTS users (
  sub            TEXT PRIMARY KEY,
  email          TEXT NOT NULL,
  name           TEXT,
  avatar_url     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
