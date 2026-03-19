import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateRoomSlug,
  createShare,
  deleteShare,
  updateSharePermission,
  getShare,
  getSharesForRoom,
  getSharedWithMe,
  getUserBySlug,
  backfillSub,
} from '../../worker/lib/room-store'

describe('generateRoomSlug', () => {
  it('returns a 6-character lowercase alphanumeric string', () => {
    const slug = generateRoomSlug()
    expect(slug).toMatch(/^[0-9a-z]{6}$/)
  })

  it('returns different slugs on subsequent calls', () => {
    const a = generateRoomSlug()
    const b = generateRoomSlug()
    expect(a).not.toBe(b)
  })
})

describe('room-store D1 queries', () => {
  let db: any

  beforeEach(() => {
    const results: any[] = []
    db = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          run: vi.fn(async () => ({ success: true, meta: { changes: 1 } })),
          first: vi.fn(async () => results.shift() ?? null),
          all: vi.fn(async () => ({ results })),
        })),
      })),
    }
  })

  it('createShare calls INSERT with correct params', async () => {
    await createShare(db, {
      roomOwnerSub: 'owner-1',
      sharedWithEmail: 'guest@example.com',
      sharedWithSub: null,
      permission: 'edit',
    })
    expect(db.prepare).toHaveBeenCalled()
    const sql = db.prepare.mock.calls[0][0]
    expect(sql).toContain('INSERT')
    expect(sql).toContain('room_shares')
  })

  it('getShare queries by sub then email', async () => {
    await getShare(db, 'owner-1', 'guest-sub', 'guest@example.com')
    expect(db.prepare).toHaveBeenCalled()
    const sql = db.prepare.mock.calls[0][0]
    expect(sql).toContain('shared_with_sub')
    expect(sql).toContain('shared_with_email')
  })

  it('deleteShare removes the record', async () => {
    await deleteShare(db, 'owner-1', 'guest@example.com')
    const sql = db.prepare.mock.calls[0][0]
    expect(sql).toContain('DELETE')
  })

  it('updateSharePermission updates permission and updated_at', async () => {
    await updateSharePermission(db, 'owner-1', 'guest@example.com', 'view')
    const sql = db.prepare.mock.calls[0][0]
    expect(sql).toContain('UPDATE')
    expect(sql).toContain('updated_at')
  })

  it('getUserBySlug queries by room_slug', async () => {
    await getUserBySlug(db, 'k7x9m2')
    const sql = db.prepare.mock.calls[0][0]
    expect(sql).toContain('room_slug')
  })

  it('backfillSub updates rows where sub is null', async () => {
    await backfillSub(db, 'new-sub', 'guest@example.com')
    const sql = db.prepare.mock.calls[0][0]
    expect(sql).toContain('shared_with_sub IS NULL')
  })
})
