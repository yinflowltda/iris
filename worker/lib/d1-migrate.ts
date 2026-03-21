/**
 * Auto-migrate D1 schema on first request.
 *
 * The local D1 SQLite gets wiped whenever `.wrangler/state` is cleaned
 * (dependency re-optimization, manual delete, etc.). This ensures the
 * tables always exist — uses CREATE TABLE IF NOT EXISTS so it's safe
 * to run on every cold start, both locally and in production.
 */

let migrated = false

export async function ensureD1Schema(db: D1Database): Promise<void> {
	if (migrated) return
	migrated = true

	await db.batch([
		db.prepare(`CREATE TABLE IF NOT EXISTS users (
			sub            TEXT PRIMARY KEY,
			email          TEXT NOT NULL,
			name           TEXT,
			avatar_url     TEXT,
			room_slug      TEXT UNIQUE,
			created_at     TEXT NOT NULL DEFAULT (datetime('now')),
			last_seen_at   TEXT NOT NULL DEFAULT (datetime('now'))
		)`),
		db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)`),
		db.prepare(`CREATE TABLE IF NOT EXISTS room_shares (
			room_owner_sub    TEXT NOT NULL,
			shared_with_email TEXT NOT NULL,
			shared_with_sub   TEXT,
			permission        TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit')),
			created_at        TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
			PRIMARY KEY (room_owner_sub, shared_with_email),
			FOREIGN KEY (room_owner_sub) REFERENCES users(sub)
		)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_room_shares_email ON room_shares(shared_with_email)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_room_shares_sub ON room_shares(shared_with_sub)`),
	])
}
