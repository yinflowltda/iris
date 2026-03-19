CREATE TABLE IF NOT EXISTS users (
  sub            TEXT PRIMARY KEY,
  email          TEXT NOT NULL,
  name           TEXT,
  avatar_url     TEXT,
  room_slug      TEXT UNIQUE,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Production migration (run separately via wrangler d1 execute):
-- ALTER TABLE users ADD COLUMN room_slug TEXT UNIQUE;

CREATE TABLE IF NOT EXISTS room_shares (
  room_owner_sub    TEXT NOT NULL,
  shared_with_email TEXT NOT NULL,
  shared_with_sub   TEXT,
  permission        TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (room_owner_sub, shared_with_email),
  FOREIGN KEY (room_owner_sub) REFERENCES users(sub)
);

CREATE INDEX IF NOT EXISTS idx_room_shares_email
  ON room_shares(shared_with_email);

CREATE INDEX IF NOT EXISTS idx_room_shares_sub
  ON room_shares(shared_with_sub);
