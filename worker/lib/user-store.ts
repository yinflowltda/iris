import type { User } from '../../shared/types/User'

export interface UserRow extends User {
	created_at: string
	last_seen_at: string
}

/**
 * Insert or update a user. Preserves created_at on conflict.
 * Returns { isNew: true } if this was the user's first login.
 */
export async function upsertUser(
	db: D1Database,
	user: { sub: string; email: string; name: string | null; avatar_url: string | null },
): Promise<{ isNew: boolean }> {
	// Check if user exists before upserting — reliable isNew detection
	const existing = await db.prepare('SELECT 1 FROM users WHERE sub = ?').bind(user.sub).first()
	const isNew = !existing

	await db
		.prepare(
			`INSERT INTO users (sub, email, name, avatar_url)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(sub) DO UPDATE SET
         email = excluded.email,
         name = excluded.name,
         avatar_url = excluded.avatar_url,
         last_seen_at = datetime('now')`,
		)
		.bind(user.sub, user.email, user.name, user.avatar_url)
		.run()

	return { isNew }
}

/**
 * Get a user by their Cloudflare Access sub (unique ID).
 */
export async function getUserBySub(db: D1Database, sub: string): Promise<UserRow | null> {
	return db.prepare('SELECT * FROM users WHERE sub = ?').bind(sub).first<UserRow>()
}
