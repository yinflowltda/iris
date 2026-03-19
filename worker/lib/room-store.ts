export function generateRoomSlug(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(36).slice(-1)).join('').slice(0, 6)
}

export interface ShareRecord {
  room_owner_sub: string
  shared_with_email: string
  shared_with_sub: string | null
  permission: 'view' | 'edit'
  created_at: string
  updated_at: string
}

export async function ensureRoomSlug(
  db: D1Database,
  sub: string,
): Promise<string> {
  const existing = await db
    .prepare('SELECT room_slug FROM users WHERE sub = ?')
    .bind(sub)
    .first<{ room_slug: string | null }>()
  if (existing?.room_slug) return existing.room_slug

  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = generateRoomSlug()
    try {
      const result = await db
        .prepare('UPDATE users SET room_slug = ? WHERE sub = ? AND room_slug IS NULL')
        .bind(slug, sub)
        .run()
      if (result.meta.changes > 0) return slug
      const row = await db.prepare('SELECT room_slug FROM users WHERE sub = ?').bind(sub).first<{ room_slug: string }>()
      if (row?.room_slug) return row.room_slug
    } catch {
      continue
    }
  }
  throw new Error('Failed to generate unique room slug after 3 attempts')
}

export async function createShare(
  db: D1Database,
  share: { roomOwnerSub: string; sharedWithEmail: string; sharedWithSub: string | null; permission: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO room_shares (room_owner_sub, shared_with_email, shared_with_sub, permission)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(room_owner_sub, shared_with_email) DO UPDATE SET
         permission = excluded.permission,
         shared_with_sub = COALESCE(excluded.shared_with_sub, room_shares.shared_with_sub),
         updated_at = datetime('now')`,
    )
    .bind(share.roomOwnerSub, share.sharedWithEmail, share.sharedWithSub, share.permission)
    .run()
}

export async function deleteShare(db: D1Database, roomOwnerSub: string, email: string): Promise<void> {
  await db
    .prepare('DELETE FROM room_shares WHERE room_owner_sub = ? AND shared_with_email = ?')
    .bind(roomOwnerSub, email)
    .run()
}

export async function updateSharePermission(
  db: D1Database,
  roomOwnerSub: string,
  email: string,
  permission: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE room_shares SET permission = ?, updated_at = datetime('now')
       WHERE room_owner_sub = ? AND shared_with_email = ?`,
    )
    .bind(permission, roomOwnerSub, email)
    .run()
}

export async function getShare(
  db: D1Database,
  roomOwnerSub: string,
  userSub: string,
  userEmail: string,
): Promise<ShareRecord | null> {
  return db
    .prepare(
      `SELECT * FROM room_shares
       WHERE room_owner_sub = ? AND (shared_with_sub = ? OR shared_with_email = ?)
       LIMIT 1`,
    )
    .bind(roomOwnerSub, userSub, userEmail)
    .first<ShareRecord>()
}

export async function getSharesForRoom(db: D1Database, roomOwnerSub: string): Promise<ShareRecord[]> {
  const result = await db
    .prepare('SELECT * FROM room_shares WHERE room_owner_sub = ? ORDER BY created_at DESC')
    .bind(roomOwnerSub)
    .all<ShareRecord>()
  return result.results
}

export async function getSharedWithMe(
  db: D1Database,
  userSub: string,
  userEmail: string,
): Promise<Array<{ owner_sub: string; owner_email: string; owner_name: string | null; room_slug: string | null; permission: string }>> {
  const result = await db
    .prepare(
      `SELECT u.sub as owner_sub, u.email as owner_email, u.name as owner_name, u.room_slug,
              rs.permission
       FROM room_shares rs
       JOIN users u ON u.sub = rs.room_owner_sub
       WHERE rs.shared_with_sub = ? OR rs.shared_with_email = ?
       ORDER BY rs.created_at DESC`,
    )
    .bind(userSub, userEmail)
    .all()
  return result.results as any
}

export async function getUserBySlug(
  db: D1Database,
  slug: string,
): Promise<{ sub: string; name: string | null } | null> {
  return db
    .prepare('SELECT sub, name FROM users WHERE room_slug = ?')
    .bind(slug)
    .first()
}

export async function backfillSub(db: D1Database, sub: string, email: string): Promise<void> {
  await db
    .prepare('UPDATE room_shares SET shared_with_sub = ? WHERE shared_with_email = ? AND shared_with_sub IS NULL')
    .bind(sub, email)
    .run()
}
