import type { User } from '../../shared/types/User'

export interface UserRow extends User {
	created_at: string
	last_seen_at: string
}

/**
 * Insert or update a user. Preserves created_at on conflict.
 */
export async function upsertUser(
	db: D1Database,
	user: { sub: string; email: string; name: string | null; avatar_url: string | null },
): Promise<void> {
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
}

/**
 * Get a user by their Cloudflare Access sub (unique ID).
 */
export async function getUserBySub(db: D1Database, sub: string): Promise<UserRow | null> {
	return db.prepare('SELECT * FROM users WHERE sub = ?').bind(sub).first<UserRow>()
}
