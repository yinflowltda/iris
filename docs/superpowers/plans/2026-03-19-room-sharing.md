# Room Sharing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable room owners to share their tldraw canvas with others by email, with view or edit permissions, via a dedicated room registry page and Google Docs-style share dialog.

**Architecture:** D1 stores room shares and user slugs. Worker routes handle sharing CRUD + slug resolution. The sync route checks permissions and passes `isReadonly` to `TLSocketRoom`. Resend sends invite emails. Client has a room registry page (`/rooms`), share dialog (Radix), and client-side routing.

**Tech Stack:** Cloudflare Workers, D1, Durable Objects, @tldraw/sync-core, Resend, Radix UI, plain CSS

**Spec:** `docs/superpowers/specs/2026-03-19-room-sharing-design.md`

---

### Task 1: D1 Schema + Room Store

**Files:**
- Modify: `worker/d1/schema.sql`
- Create: `worker/lib/room-store.ts`
- Create: `tests/unit/room-store.test.ts`

- [ ] **Step 1: Write failing tests for room store**

```ts
// tests/unit/room-store.test.ts
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

// D1 tests use a mock — real integration tested via wrangler
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run vitest run tests/unit/room-store.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Update D1 schema**

```sql
-- worker/d1/schema.sql — full replacement of users table + new room_shares table

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
```

- [ ] **Step 4: Implement room-store.ts**

```ts
// worker/lib/room-store.ts

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
  // Check if slug already exists
  const existing = await db
    .prepare('SELECT room_slug FROM users WHERE sub = ?')
    .bind(sub)
    .first<{ room_slug: string | null }>()
  if (existing?.room_slug) return existing.room_slug

  // Generate and set slug with retry on collision
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = generateRoomSlug()
    try {
      const result = await db
        .prepare('UPDATE users SET room_slug = ? WHERE sub = ? AND room_slug IS NULL')
        .bind(slug, sub)
        .run()
      if (result.meta.changes > 0) return slug
      // room_slug was set by another request — read it
      const row = await db.prepare('SELECT room_slug FROM users WHERE sub = ?').bind(sub).first<{ room_slug: string }>()
      if (row?.room_slug) return row.room_slug
    } catch {
      // UNIQUE violation — retry with new slug
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run vitest run tests/unit/room-store.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add worker/d1/schema.sql worker/lib/room-store.ts tests/unit/room-store.test.ts
git commit -m "feat(sharing): D1 schema + room-store data layer"
```

---

### Task 2: User Slug + Sub Backfill in Auth Layer

**Files:**
- Modify: `shared/types/User.ts`
- Modify: `worker/lib/user-store.ts`
- Modify: `worker/lib/auth-middleware.ts`
- Modify: `worker/routes/me.ts`
- Modify: `worker/environment.ts`

- [ ] **Step 1: Add room_slug to User type**

In `shared/types/User.ts`, add `room_slug`:

```ts
export interface User {
  sub: string
  email: string
  name: string | null
  avatar_url: string | null
  room_slug: string | null
}
```

- [ ] **Step 2: Update user-store.ts — upsertUser returns isNew**

Replace `upsertUser` in `worker/lib/user-store.ts`:

```ts
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
```

- [ ] **Step 3: Update auth-middleware.ts — slug generation + sub backfill**

In `worker/lib/auth-middleware.ts`, after `await upsertUser(env.DB, user)` (line 104), add:

```ts
import { ensureRoomSlug, backfillSub } from './room-store'

// ... in the dev bypass section (after building dev user, before return):

if (env.DEV_MODE === 'true') {
  const devUserHeader = request.headers.get('X-Dev-User')
  const user = buildDevUser(devUserHeader)
  ;(request as IRequest & { user: AuthUser }).user = user
  // Dev users also need slug + backfill
  await upsertUser(env.DB, user)
  await ensureRoomSlug(env.DB, user.sub)
  return
}

// ... inside the try block, after JWT verification:

const { isNew } = await upsertUser(env.DB, user)

// Generate room slug if needed (first login)
await ensureRoomSlug(env.DB, user.sub)

// Backfill shared_with_sub for any pending shares (only on first login)
if (isNew) {
  await backfillSub(env.DB, user.sub, user.email)
}
```

- [ ] **Step 4: Update /me route to include room_slug**

In `worker/routes/me.ts`:

```ts
import type { IRequest } from 'itty-router'
import type { Environment } from '../environment'
import type { AuthUser } from '../lib/auth-types'
import { getUserBySub } from '../lib/user-store'

export async function me(request: IRequest, env: Environment): Promise<Response> {
  const user = (request as IRequest & { user: AuthUser }).user
  const dbUser = await getUserBySub(env.DB, user.sub)
  return Response.json({
    sub: user.sub,
    email: user.email,
    name: user.name,
    avatar_url: user.avatar_url,
    room_slug: dbUser?.room_slug ?? null,
  })
}
```

- [ ] **Step 5: Add RESEND_API_KEY to Environment**

In `worker/environment.ts`, add:

```ts
// Email
RESEND_API_KEY: string | undefined
```

- [ ] **Step 6: Run existing tests to check nothing broke**

Run: `bun run vitest run`
Expected: All existing tests pass (some pre-existing failures in agent-actions are acceptable)

- [ ] **Step 7: Commit**

```bash
git add shared/types/User.ts worker/lib/user-store.ts worker/lib/auth-middleware.ts worker/routes/me.ts worker/environment.ts
git commit -m "feat(sharing): user slugs, sub backfill, /me returns room_slug"
```

---

### Task 3: Email Integration (Resend)

> **Note:** This task must come before the API routes task because `rooms.ts` imports `sendInviteEmail` from `email.ts`.

**Files:**
- Create: `worker/lib/email.ts`
- Create: `tests/unit/email.test.ts`

- [ ] **Step 1: Install resend**

Run: `bun add resend`

- [ ] **Step 2: Write failing test**

```ts
// tests/unit/email.test.ts
import { describe, it, expect } from 'vitest'
import { renderInviteEmailHtml } from '../../worker/lib/email'

describe('renderInviteEmailHtml', () => {
  it('includes owner name in the email', () => {
    const html = renderInviteEmailHtml({
      ownerName: 'Rafael',
      permission: 'edit',
      roomSlug: 'k7x9m2',
    })
    expect(html).toContain('Rafael')
  })

  it('includes the room link', () => {
    const html = renderInviteEmailHtml({
      ownerName: 'Rafael',
      permission: 'edit',
      roomSlug: 'k7x9m2',
    })
    expect(html).toContain('iris.yinflow.life/r/k7x9m2')
  })

  it('shows edit permission text', () => {
    const html = renderInviteEmailHtml({
      ownerName: 'Rafael',
      permission: 'edit',
      roomSlug: 'k7x9m2',
    })
    expect(html).toContain('view and edit')
  })

  it('shows view-only permission text', () => {
    const html = renderInviteEmailHtml({
      ownerName: 'Rafael',
      permission: 'view',
      roomSlug: 'k7x9m2',
    })
    expect(html).toContain('view this session')
    expect(html).not.toContain('view and edit')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run vitest run tests/unit/email.test.ts`
Expected: FAIL

- [ ] **Step 4: Implement email.ts**

```ts
// worker/lib/email.ts
import { Resend } from 'resend'
import type { Environment } from '../environment'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderInviteEmailHtml(opts: {
  ownerName: string
  permission: 'view' | 'edit'
  roomSlug: string
}): string {
  const permissionText =
    opts.permission === 'edit'
      ? 'You can view and edit this session.'
      : 'You can view this session.'
  const link = `https://iris.yinflow.life/r/${escapeHtml(opts.roomSlug)}`

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="padding:40px 40px 20px;">
  <h1 style="margin:0;color:#18181b;font-size:24px;">You're invited</h1>
  <p style="color:#52525b;font-size:16px;line-height:1.6;">
    ${escapeHtml(opts.ownerName)} has invited you to their Yinflow session.
  </p>
  <p style="color:#52525b;font-size:14px;">${permissionText}</p>
  <a href="${link}"
     style="display:inline-block;background:#6366f1;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin:16px 0;">
    Join Session
  </a>
</td></tr>
<tr><td style="padding:20px 40px 40px;">
  <p style="color:#a1a1aa;font-size:13px;margin:0;">
    If you didn't expect this email, you can safely ignore it.
  </p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

export async function sendInviteEmail(
  env: Environment,
  opts: {
    ownerName: string
    ownerEmail: string
    recipientEmail: string
    permission: 'view' | 'edit'
    roomSlug: string
  },
): Promise<{ success: boolean; error?: string }> {
  if (!env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set, skipping invite email')
    return { success: false, error: 'API key not configured' }
  }

  const resend = new Resend(env.RESEND_API_KEY)
  const html = renderInviteEmailHtml(opts)

  const { error } = await resend.emails.send({
    from: 'Iris <noreply@yinflow.life>',
    to: opts.recipientEmail,
    subject: `${opts.ownerName} invited you to a Yinflow session`,
    html,
  })

  if (error) {
    console.error('Resend error:', error)
    return { success: false, error: error.message }
  }
  return { success: true }
}
```

- [ ] **Step 5: Run tests**

Run: `bun run vitest run tests/unit/email.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add worker/lib/email.ts tests/unit/email.test.ts package.json bun.lock
git commit -m "feat(sharing): Resend email integration + invite template"
```

---

### Task 4: Room Sharing API Routes

**Files:**
- Create: `worker/routes/rooms.ts`
- Create: `tests/unit/rooms-routes.test.ts`
- Modify: `worker/worker.ts`

- [ ] **Step 1: Write failing tests for room routes**

```ts
// tests/unit/rooms-routes.test.ts
import { describe, it, expect } from 'vitest'

describe('rooms routes', () => {
  it('placeholder — routes file exists and exports handlers', async () => {
    const mod = await import('../../worker/routes/rooms')
    expect(mod.createShareRoute).toBeDefined()
    expect(mod.deleteShareRoute).toBeDefined()
    expect(mod.updateShareRoute).toBeDefined()
    expect(mod.listSharesRoute).toBeDefined()
    expect(mod.sharedWithMeRoute).toBeDefined()
    expect(mod.resolveSlugRoute).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run vitest run tests/unit/rooms-routes.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement room routes**

```ts
// worker/routes/rooms.ts
import type { IRequest } from 'itty-router'
import type { Environment } from '../environment'
import type { AuthenticatedRequest } from '../lib/auth-types'
import {
  createShare,
  deleteShare,
  updateSharePermission,
  getSharesForRoom,
  getSharedWithMe,
  getUserBySlug,
} from '../lib/room-store'
import { getUserBySub } from '../lib/user-store'
import { sendInviteEmail } from '../lib/email'

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** POST /rooms/:roomId/shares */
export async function createShareRoute(request: IRequest, env: Environment): Promise<Response> {
  const user = (request as AuthenticatedRequest).user
  const roomId = request.params?.roomId

  if (user.sub !== roomId) return jsonError('Not authorized', 403)

  const body = await request.json() as { email?: string; permission?: string }
  if (!body.email || !body.permission) return jsonError('email and permission required', 400)
  if (!['view', 'edit'].includes(body.permission)) return jsonError('permission must be view or edit', 400)
  if (body.email === user.email) return jsonError('Cannot share with yourself', 400)

  // Check if invitee already exists
  const existingUser = await env.DB
    .prepare('SELECT sub FROM users WHERE email = ?')
    .bind(body.email)
    .first<{ sub: string }>()

  await createShare(env.DB, {
    roomOwnerSub: roomId,
    sharedWithEmail: body.email,
    sharedWithSub: existingUser?.sub ?? null,
    permission: body.permission,
  })

  // Send invite email (fire-and-forget)
  const owner = await getUserBySub(env.DB, user.sub)
  if (env.RESEND_API_KEY) {
    try {
      await sendInviteEmail(env, {
        ownerName: owner?.name ?? user.email,
        ownerEmail: user.email,
        recipientEmail: body.email,
        permission: body.permission as 'view' | 'edit',
        roomSlug: owner?.room_slug ?? '',
      })
    } catch (err) {
      console.error('Failed to send invite email:', err)
    }
  }

  return Response.json({
    room_owner_sub: roomId,
    shared_with_email: body.email,
    permission: body.permission,
  })
}

/** DELETE /rooms/:roomId/shares */
export async function deleteShareRoute(request: IRequest, env: Environment): Promise<Response> {
  const user = (request as AuthenticatedRequest).user
  const roomId = request.params?.roomId

  if (user.sub !== roomId) return jsonError('Not authorized', 403)

  const body = await request.json() as { email?: string }
  if (!body.email) return jsonError('email required', 400)

  await deleteShare(env.DB, roomId, body.email)
  return new Response(null, { status: 204 })
}

/** PATCH /rooms/:roomId/shares */
export async function updateShareRoute(request: IRequest, env: Environment): Promise<Response> {
  const user = (request as AuthenticatedRequest).user
  const roomId = request.params?.roomId

  if (user.sub !== roomId) return jsonError('Not authorized', 403)

  const body = await request.json() as { email?: string; permission?: string }
  if (!body.email || !body.permission) return jsonError('email and permission required', 400)
  if (!['view', 'edit'].includes(body.permission)) return jsonError('permission must be view or edit', 400)

  await updateSharePermission(env.DB, roomId, body.email, body.permission)
  return Response.json({
    room_owner_sub: roomId,
    shared_with_email: body.email,
    permission: body.permission,
  })
}

/** GET /rooms/:roomId/shares */
export async function listSharesRoute(request: IRequest, env: Environment): Promise<Response> {
  const user = (request as AuthenticatedRequest).user
  const roomId = request.params?.roomId

  if (user.sub !== roomId) return jsonError('Not authorized', 403)

  const shares = await getSharesForRoom(env.DB, roomId)
  return Response.json({ shares })
}

/** GET /rooms/shared-with-me */
export async function sharedWithMeRoute(request: IRequest, env: Environment): Promise<Response> {
  const user = (request as AuthenticatedRequest).user
  const rooms = await getSharedWithMe(env.DB, user.sub, user.email)
  return Response.json({ rooms })
}

/** GET /rooms/resolve/:slug */
export async function resolveSlugRoute(request: IRequest, env: Environment): Promise<Response> {
  const slug = request.params?.slug
  if (!slug) return jsonError('Slug required', 400)

  const owner = await getUserBySlug(env.DB, slug)
  if (!owner) return jsonError('Room not found', 404)

  return Response.json({ owner_sub: owner.sub, owner_name: owner.name })
}
```

- [ ] **Step 4: Wire routes into worker.ts**

In `worker/worker.ts`, add imports and routes:

```ts
import {
  createShareRoute,
  deleteShareRoute,
  updateShareRoute,
  listSharesRoute,
  sharedWithMeRoute,
  resolveSlugRoute,
} from './routes/rooms'
```

Add to router chain (before `.get('/sync/:roomId', syncRoom)`):

```ts
  .get('/rooms/shared-with-me', sharedWithMeRoute)
  .get('/rooms/resolve/:slug', resolveSlugRoute)
  .get('/rooms/:roomId/shares', listSharesRoute)
  .post('/rooms/:roomId/shares', createShareRoute)
  .delete('/rooms/:roomId/shares', deleteShareRoute)
  .patch('/rooms/:roomId/shares', updateShareRoute)
```

Note: `/rooms/shared-with-me` and `/rooms/resolve/:slug` must come before `/rooms/:roomId/shares` to avoid `:roomId` matching "shared-with-me" or "resolve".

- [ ] **Step 5: Run tests**

Run: `bun run vitest run tests/unit/rooms-routes.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add worker/routes/rooms.ts worker/worker.ts tests/unit/rooms-routes.test.ts
git commit -m "feat(sharing): room sharing API routes"
```

---

### Task 5: Sync Route Permission Check + TldrawSyncDO isReadonly

**Files:**
- Modify: `worker/routes/sync.ts`
- Modify: `worker/do/TldrawSyncDO.ts`

- [ ] **Step 1: Update sync.ts with permission check**

Replace the sync route in `worker/routes/sync.ts`:

```ts
import type { IRequest } from 'itty-router'
import type { Environment } from '../environment'
import type { AuthenticatedRequest } from '../lib/auth-types'
import { getShare } from '../lib/room-store'

export async function syncRoom(request: IRequest, env: Environment): Promise<Response> {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 })
  }

  const user = (request as AuthenticatedRequest).user
  const roomId = request.params?.roomId

  if (!roomId) {
    return new Response(JSON.stringify({ error: 'Room ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let isReadonly = false

  if (user.sub === roomId) {
    // Owner always has edit access
    isReadonly = false
  } else {
    // Check room_shares for access
    const share = await getShare(env.DB, roomId, user.sub, user.email)
    if (!share) {
      return new Response(JSON.stringify({ error: 'Not authorized for this room' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    isReadonly = share.permission === 'view'
  }

  const id = env.TLDRAW_SYNC_DO.idFromName(roomId)
  const stub = env.TLDRAW_SYNC_DO.get(id)

  // Forward readonly flag via query param
  const url = new URL(request.url)
  if (isReadonly) url.searchParams.set('readonly', 'true')

  return stub.fetch(new Request(url.toString(), {
    headers: request.headers as unknown as Headers,
    method: request.method,
  }))
}
```

- [ ] **Step 2: Update TldrawSyncDO.ts to read isReadonly**

In `worker/do/TldrawSyncDO.ts`, update the `fetch` method:

```ts
  override async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade')
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 })
    }

    const room = this.getRoom()
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    server.accept()

    const url = new URL(request.url)
    const sessionId = url.searchParams.get('sessionId') ?? crypto.randomUUID()
    const isReadonly = url.searchParams.get('readonly') === 'true'

    room.handleSocketConnect({
      sessionId,
      socket: server as any,
      isReadonly,
    })

    return new Response(null, { status: 101, webSocket: client })
  }
```

- [ ] **Step 3: Run full test suite**

Run: `bun run vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add worker/routes/sync.ts worker/do/TldrawSyncDO.ts
git commit -m "feat(sharing): sync route permission check + isReadonly support"
```

---

### Task 6: Client-Side Routing + useRoom Hook

**Files:**
- Create: `client/lib/use-room.ts`
- Modify: `client/lib/use-auth-sync.ts`
- Modify: `client/App.tsx`

- [ ] **Step 1: Create useRoom hook**

```ts
// client/lib/use-room.ts
import { useCallback, useEffect, useState } from 'react'

export interface RoomInfo {
  /** The owner's sub — used as the roomId for sync */
  ownerSub: string
  /** Whether the current user is the owner */
  isOwner: boolean
  /** Permission level (null = owner) */
  permission: 'view' | 'edit' | null
  /** The slug from the URL */
  slug: string | null
}

interface SharedRoom {
  owner_sub: string
  owner_email: string
  owner_name: string | null
  room_slug: string | null
  permission: string
}

/**
 * Determines the current route and resolves room context.
 * Routes:
 *   /         → redirect to /rooms
 *   /rooms    → room registry (returns null roomInfo)
 *   /r/:slug  → resolve slug, return room info
 *   (else)    → own room (legacy, for canvas)
 */
export function useRoom(userSub: string) {
  const [route, setRoute] = useState<'registry' | 'room' | 'loading'>('loading')
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null)
  const [sharedRooms, setSharedRooms] = useState<SharedRoom[]>([])
  // Counter to force re-run of routing effect on navigation
  const [routeVersion, setRouteVersion] = useState(0)

  // Fetch shared rooms (used for both registry display and permission lookup)
  useEffect(() => {
    if (!userSub) return
    fetch('/rooms/shared-with-me', { credentials: 'include' })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json() as { rooms: SharedRoom[] }
          setSharedRooms(data.rooms)
        }
      })
      .catch(() => {})
  }, [userSub])

  // Routing effect — re-runs on userSub change or navigation
  useEffect(() => {
    if (!userSub) return

    const path = window.location.pathname

    if (path === '/' || path === '') {
      window.history.replaceState(null, '', '/rooms')
      setRoute('registry')
      return
    }

    if (path === '/rooms') {
      setRoute('registry')
      return
    }

    const slugMatch = path.match(/^\/r\/([a-z0-9]+)$/)
    if (slugMatch) {
      const slug = slugMatch[1]
      fetch(`/rooms/resolve/${slug}`, { credentials: 'include' })
        .then(async (res) => {
          if (!res.ok) {
            window.history.replaceState(null, '', '/rooms')
            setRoute('registry')
            return
          }
          const data = await res.json() as { owner_sub: string; owner_name: string | null }
          const isOwner = data.owner_sub === userSub
          // Look up permission from shared rooms data
          const sharedRoom = sharedRooms.find((r) => r.owner_sub === data.owner_sub)
          setRoomInfo({
            ownerSub: data.owner_sub,
            isOwner,
            permission: isOwner ? null : (sharedRoom?.permission as 'view' | 'edit') ?? 'view',
            slug,
          })
          setRoute('room')
        })
        .catch(() => {
          window.history.replaceState(null, '', '/rooms')
          setRoute('registry')
        })
      return
    }

    // Unknown path — treat as room (backward compat)
    setRoomInfo({ ownerSub: userSub, isOwner: true, permission: null, slug: null })
    setRoute('room')
  }, [userSub, routeVersion, sharedRooms])

  const navigateTo = useCallback((path: string) => {
    window.history.pushState(null, '', path)
    setRouteVersion((v) => v + 1) // Trigger routing re-evaluation
  }, [])

  // Listen for popstate (back/forward)
  useEffect(() => {
    const handler = () => setRouteVersion((v) => v + 1)
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  return { route, roomInfo, sharedRooms, navigateTo }
}
```

- [ ] **Step 2: Update use-auth-sync.ts to accept roomId**

In `client/lib/use-auth-sync.ts`, rename `userSub` param to `roomId`:

```ts
export function useAuthSync(
  roomId: string,
  shapeUtils: readonly TLAnyShapeUtilConstructor[],
) {
  const getUri = useCallback(async () => {
    if (!roomId) {
      return new Promise<string>(() => {})
    }
    return `${window.location.origin}/sync/${roomId}`
  }, [roomId])

  return useSync({
    uri: getUri,
    assets: multiplayerAssetStore,
    shapeUtils,
  })
}
```

- [ ] **Step 3: Update App.tsx to use room routing**

This is the most significant change. The App component needs to:
1. Use `useRoom` to determine current route
2. Show RoomRegistry on `/rooms`
3. Show canvas on `/r/:slug`
4. Pass the correct roomId (not always user.sub) to `useAuthSync`

Key changes in `App.tsx`:

```ts
// Add imports
import { useRoom } from './lib/use-room'
import { RoomRegistry } from './components/RoomRegistry'
import { ShareButton } from './components/ShareButton'

// In App():
function App() {
  const { user, loading, error: authError } = useAuth()
  const { route, roomInfo, sharedRooms, navigateTo } = useRoom(user?.sub ?? '')
  const syncRoomId = roomInfo?.ownerSub ?? ''
  const syncStore = useAuthSync(syncRoomId, shapeUtils)

  // ... existing state ...

  if (loading) return <div className="auth-loading">Loading...</div>
  if (authError || !user) return <div className="auth-error">Authentication required. Refreshing...</div>

  if (route === 'loading') return <div className="auth-loading">Loading...</div>

  if (route === 'registry') {
    return (
      <AuthUserContext.Provider value={user}>
        <RoomRegistry
          user={user}
          sharedRooms={sharedRooms}
          onEnterRoom={(slug) => navigateTo(`/r/${slug}`)}
        />
      </AuthUserContext.Provider>
    )
  }

  // route === 'room' — render canvas
  return (
    <AuthUserContext.Provider value={user}>
      {/* Share button — only on own room */}
      {roomInfo?.isOwner && <ShareButton roomId={user.sub} roomSlug={user.room_slug} />}
      {/* Back to rooms */}
      <button className="back-to-rooms" onClick={() => navigateTo('/rooms')}>
        ← Rooms
      </button>
      {/* Read-only indicator */}
      {roomInfo && !roomInfo.isOwner && roomInfo.permission === 'view' && (
        <div className="readonly-badge">View only</div>
      )}
      <MandalaCoverContext.Provider value={{ onCoverSlideClick: handleCoverSlideClick }}>
        {/* ... existing canvas JSX ... */}
      </MandalaCoverContext.Provider>
    </AuthUserContext.Provider>
  )
}
```

- [ ] **Step 4: Build to check for type errors**

Run: `bun run build 2>&1 | tail -20`
Expected: Build succeeds (or only non-related warnings)

- [ ] **Step 5: Commit**

```bash
git add client/lib/use-room.ts client/lib/use-auth-sync.ts client/App.tsx
git commit -m "feat(sharing): client-side routing, useRoom hook, registry/canvas split"
```

---

### Task 7: Room Registry Page

**Files:**
- Create: `client/components/RoomRegistry.tsx`
- Create: `client/components/RoomRegistry.css`

- [ ] **Step 1: Create RoomRegistry component**

```tsx
// client/components/RoomRegistry.tsx
import type { User } from '../../shared/types/User'
import './RoomRegistry.css'

interface SharedRoom {
  owner_sub: string
  owner_email: string
  owner_name: string | null
  room_slug: string | null
  permission: string
}

export function RoomRegistry({
  user,
  sharedRooms,
  onEnterRoom,
}: {
  user: User
  sharedRooms: SharedRoom[]
  onEnterRoom: (slug: string) => void
}) {
  return (
    <div className="rr-container">
      <div className="rr-panel">
        <h1 className="rr-title">Your Rooms</h1>

        {/* Own room */}
        <div className="rr-section">
          <div
            className="rr-card rr-card--own"
            onClick={() => user.room_slug && onEnterRoom(user.room_slug)}
          >
            <div className="rr-card-info">
              <div className="rr-card-name">My Room</div>
              {user.room_slug && (
                <div className="rr-card-slug">iris.yinflow.life/r/{user.room_slug}</div>
              )}
            </div>
            <span className="rr-badge rr-badge--owner">Owner</span>
          </div>
        </div>

        {/* Shared rooms */}
        {sharedRooms.length > 0 && (
          <div className="rr-section">
            <h2 className="rr-section-title">Shared with you</h2>
            {sharedRooms.map((room) => (
              <div
                key={room.owner_sub}
                className="rr-card"
                onClick={() => room.room_slug && onEnterRoom(room.room_slug)}
              >
                <div className="rr-card-info">
                  <div className="rr-card-name">
                    {room.owner_name ?? room.owner_email}'s Room
                  </div>
                  <div className="rr-card-slug">{room.owner_email}</div>
                </div>
                <span className={`rr-badge rr-badge--${room.permission}`}>
                  {room.permission === 'edit' ? 'Can edit' : 'View only'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create RoomRegistry.css**

Follow the existing Iris glassmorphism design system from `FLSettingsPanel.css`:

```css
/* client/components/RoomRegistry.css */

.rr-container {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  font-family: "Source Sans 3", sans-serif;
}

.rr-panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 560px;
  width: calc(100% - 48px);
  padding: 32px;
}

.rr-title {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  color: #ffffff;
  letter-spacing: -0.02em;
}

.rr-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rr-section-title {
  margin: 8px 0 0;
  font-size: 13px;
  font-weight: 500;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.rr-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-radius: 12px;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.rr-card:hover {
  background: rgba(51, 65, 85, 0.8);
  border-color: rgba(255, 255, 255, 0.12);
}

.rr-card--own {
  border-color: rgba(99, 102, 241, 0.3);
}

.rr-card-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rr-card-name {
  font-size: 16px;
  font-weight: 500;
  color: #f1f5f9;
}

.rr-card-slug {
  font-size: 13px;
  color: #64748b;
}

.rr-badge {
  font-size: 12px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 6px;
  white-space: nowrap;
}

.rr-badge--owner {
  background: rgba(99, 102, 241, 0.15);
  color: #a5b4fc;
}

.rr-badge--edit {
  background: rgba(74, 222, 128, 0.12);
  color: #4ade80;
}

.rr-badge--view {
  background: rgba(251, 191, 36, 0.12);
  color: #fbbf24;
}
```

- [ ] **Step 3: Build to verify**

Run: `bun run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add client/components/RoomRegistry.tsx client/components/RoomRegistry.css
git commit -m "feat(sharing): room registry page"
```

---

### Task 8: Share Dialog

**Files:**
- Create: `client/components/ShareDialog.tsx`
- Create: `client/components/ShareDialog.css`
- Create: `client/components/ShareButton.tsx`

- [ ] **Step 0: Install Radix UI dependencies**

Run: `bun add @radix-ui/react-dialog @radix-ui/react-select`

- [ ] **Step 1: Create ShareButton component**

```tsx
// client/components/ShareButton.tsx
import { useState } from 'react'
import { ShareDialog } from './ShareDialog'

export function ShareButton({ roomId, roomSlug }: { roomId: string; roomSlug: string | null }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button className="share-btn" onClick={() => setOpen(true)}>
        Share
      </button>
      <ShareDialog
        open={open}
        onClose={() => setOpen(false)}
        roomId={roomId}
        roomSlug={roomSlug}
      />
    </>
  )
}
```

- [ ] **Step 2: Create ShareDialog component**

```tsx
// client/components/ShareDialog.tsx
import { useCallback, useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Select from '@radix-ui/react-select'
import './ShareDialog.css'

interface ShareEntry {
  shared_with_email: string
  permission: string
  created_at: string
}

export function ShareDialog({
  open,
  onClose,
  roomId,
  roomSlug,
}: {
  open: boolean
  onClose: () => void
  roomId: string
  roomSlug: string | null
}) {
  const [email, setEmail] = useState('')
  const [permission, setPermission] = useState<'view' | 'edit'>('edit')
  const [shares, setShares] = useState<ShareEntry[]>([])
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)

  const fetchShares = useCallback(async () => {
    const res = await fetch(`/rooms/${roomId}/shares`, { credentials: 'include' })
    if (res.ok) {
      const data = await res.json() as { shares: ShareEntry[] }
      setShares(data.shares)
    }
  }, [roomId])

  useEffect(() => {
    if (open) fetchShares()
  }, [open, fetchShares])

  const handleInvite = async () => {
    if (!email.trim()) return
    setSending(true)
    await fetch(`/rooms/${roomId}/shares`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), permission }),
    })
    setEmail('')
    setSending(false)
    fetchShares()
  }

  const handleRemove = async (shareEmail: string) => {
    await fetch(`/rooms/${roomId}/shares`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: shareEmail }),
    })
    fetchShares()
  }

  const handlePermissionChange = async (shareEmail: string, newPerm: string) => {
    await fetch(`/rooms/${roomId}/shares`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: shareEmail, permission: newPerm }),
    })
    fetchShares()
  }

  const handleCopyLink = () => {
    if (!roomSlug) return
    navigator.clipboard.writeText(`https://iris.yinflow.life/r/${roomSlug}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="sd-overlay" />
        <Dialog.Content className="sd-content">
          <div className="sd-header">
            <Dialog.Title className="sd-title">Share</Dialog.Title>
            <Dialog.Close className="sd-close">×</Dialog.Close>
          </div>

          {/* Invite row */}
          <div className="sd-invite-row">
            <input
              className="sd-email-input"
              type="email"
              placeholder="Add people by email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
            />
            <Select.Root value={permission} onValueChange={(v) => setPermission(v as 'view' | 'edit')}>
              <Select.Trigger className="sd-select-trigger">
                <Select.Value />
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="sd-select-content">
                  <Select.Viewport>
                    <Select.Item value="edit" className="sd-select-item">
                      <Select.ItemText>Edit</Select.ItemText>
                    </Select.Item>
                    <Select.Item value="view" className="sd-select-item">
                      <Select.ItemText>View</Select.ItemText>
                    </Select.Item>
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
            <button className="sd-invite-btn" onClick={handleInvite} disabled={sending || !email.trim()}>
              Invite
            </button>
          </div>

          {/* Shares list */}
          <div className="sd-shares-section">
            <div className="sd-shares-label">People with access</div>
            {shares.map((s) => (
              <div key={s.shared_with_email} className="sd-share-row">
                <span className="sd-share-email">{s.shared_with_email}</span>
                <Select.Root
                  value={s.permission}
                  onValueChange={(v) => handlePermissionChange(s.shared_with_email, v)}
                >
                  <Select.Trigger className="sd-select-trigger sd-select-trigger--small">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="sd-select-content">
                      <Select.Viewport>
                        <Select.Item value="edit" className="sd-select-item">
                          <Select.ItemText>Edit</Select.ItemText>
                        </Select.Item>
                        <Select.Item value="view" className="sd-select-item">
                          <Select.ItemText>View</Select.ItemText>
                        </Select.Item>
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
                <button className="sd-remove-btn" onClick={() => handleRemove(s.shared_with_email)}>
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Room link */}
          {roomSlug && (
            <div className="sd-link-row">
              <span className="sd-link-text">iris.yinflow.life/r/{roomSlug}</span>
              <button className="sd-copy-btn" onClick={handleCopyLink}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

- [ ] **Step 3: Create ShareDialog.css**

```css
/* client/components/ShareDialog.css */

.sd-overlay {
  position: fixed;
  inset: 0;
  z-index: 999998;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.sd-content {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 999999;
  max-width: 480px;
  width: calc(100% - 48px);
  padding: 24px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.97), rgba(30, 41, 59, 0.95));
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-family: "Source Sans 3", sans-serif;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sd-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sd-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;
}

.sd-close {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
}

.sd-close:hover { color: #ffffff; }

/* Invite row */
.sd-invite-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.sd-email-input {
  flex: 1;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(15, 23, 42, 0.8);
  color: #f1f5f9;
  font-size: 14px;
  font-family: inherit;
  outline: none;
}

.sd-email-input:focus {
  border-color: rgba(99, 102, 241, 0.5);
}

.sd-email-input::placeholder { color: #64748b; }

.sd-select-trigger {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(15, 23, 42, 0.8);
  color: #f1f5f9;
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}

.sd-select-trigger--small {
  padding: 4px 8px;
  font-size: 13px;
}

.sd-select-content {
  background: rgba(15, 23, 42, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 4px;
  z-index: 1000000;
}

.sd-select-item {
  padding: 6px 12px;
  border-radius: 4px;
  color: #f1f5f9;
  font-size: 14px;
  cursor: pointer;
  outline: none;
}

.sd-select-item[data-highlighted] {
  background: rgba(99, 102, 241, 0.2);
}

.sd-invite-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  background: #6366f1;
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}

.sd-invite-btn:hover { background: #4f46e5; }
.sd-invite-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Shares list */
.sd-shares-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 12px;
}

.sd-shares-label {
  font-size: 13px;
  color: #94a3b8;
  font-weight: 500;
}

.sd-share-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sd-share-email {
  flex: 1;
  font-size: 14px;
  color: #e2e8f0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sd-remove-btn {
  background: none;
  border: none;
  color: #64748b;
  font-size: 16px;
  cursor: pointer;
  padding: 2px 6px;
}

.sd-remove-btn:hover { color: #ef4444; }

/* Link row */
.sd-link-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.sd-link-text {
  flex: 1;
  font-size: 13px;
  color: #64748b;
}

.sd-copy-btn {
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: transparent;
  color: #94a3b8;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}

.sd-copy-btn:hover { color: #ffffff; border-color: rgba(255, 255, 255, 0.2); }

/* Share button (top-right) */
.share-btn {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 99999;
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  background: #6366f1;
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  font-family: "Source Sans 3", sans-serif;
  cursor: pointer;
}

.share-btn:hover { background: #4f46e5; }

/* Back to rooms */
.back-to-rooms {
  position: fixed;
  top: 12px;
  left: 12px;
  z-index: 99999;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(15, 23, 42, 0.8);
  color: #94a3b8;
  font-size: 13px;
  font-family: "Source Sans 3", sans-serif;
  cursor: pointer;
  backdrop-filter: blur(8px);
}

.back-to-rooms:hover { color: #ffffff; border-color: rgba(255, 255, 255, 0.2); }

/* Read-only badge */
.readonly-badge {
  position: fixed;
  top: 12px;
  right: 80px;
  z-index: 99999;
  padding: 6px 12px;
  border-radius: 6px;
  background: rgba(251, 191, 36, 0.12);
  color: #fbbf24;
  font-size: 13px;
  font-weight: 500;
  font-family: "Source Sans 3", sans-serif;
}
```

- [ ] **Step 4: Build to verify**

Run: `bun run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add client/components/ShareButton.tsx client/components/ShareDialog.tsx client/components/ShareDialog.css
git commit -m "feat(sharing): share dialog + share button UI"
```

---

### Task 9: D1 Migration + Deploy

**Files:**
- Modify: `wrangler.toml` (if needed)

- [ ] **Step 1: Run D1 migration to add room_slug column**

```bash
CLOUDFLARE_ACCOUNT_ID=41af5e1254336d35b2af9b693164056e npx wrangler d1 execute iris-users --command "ALTER TABLE users ADD COLUMN room_slug TEXT UNIQUE;"
```

- [ ] **Step 2: Run D1 migration to create room_shares table**

```bash
CLOUDFLARE_ACCOUNT_ID=41af5e1254336d35b2af9b693164056e npx wrangler d1 execute iris-users --command "CREATE TABLE IF NOT EXISTS room_shares (room_owner_sub TEXT NOT NULL, shared_with_email TEXT NOT NULL, shared_with_sub TEXT, permission TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit')), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (room_owner_sub, shared_with_email), FOREIGN KEY (room_owner_sub) REFERENCES users(sub));"
```

- [ ] **Step 3: Create indexes**

```bash
CLOUDFLARE_ACCOUNT_ID=41af5e1254336d35b2af9b693164056e npx wrangler d1 execute iris-users --command "CREATE INDEX IF NOT EXISTS idx_room_shares_email ON room_shares(shared_with_email);"
CLOUDFLARE_ACCOUNT_ID=41af5e1254336d35b2af9b693164056e npx wrangler d1 execute iris-users --command "CREATE INDEX IF NOT EXISTS idx_room_shares_sub ON room_shares(shared_with_sub);"
```

- [ ] **Step 4: Set RESEND_API_KEY secret**

```bash
CLOUDFLARE_ACCOUNT_ID=41af5e1254336d35b2af9b693164056e npx wrangler secret put RESEND_API_KEY
```

(Enter the API key when prompted)

- [ ] **Step 5: Build and deploy**

```bash
CLOUDFLARE_ACCOUNT_ID=41af5e1254336d35b2af9b693164056e bun run build && CLOUDFLARE_ACCOUNT_ID=41af5e1254336d35b2af9b693164056e npx wrangler deploy
```

- [ ] **Step 6: Verify**

1. Open `iris.yinflow.life` — should redirect to `/rooms` registry
2. Click "My Room" — should enter canvas at `/r/:slug`
3. Click "Share" button — dialog opens
4. Invite an email — check Resend dashboard for delivery
5. Open in incognito — verify shared room appears in the other user's registry

- [ ] **Step 7: Commit (if any wrangler.toml changes)**

```bash
git add -A
git commit -m "chore(sharing): D1 migrations + production deployment"
```

---

### Task 10: SPA Routing Fix for Cloudflare

**Files:**
- Modify: `wrangler.toml` (already has `not_found_handling = "single-page-application"`)

- [ ] **Step 1: Verify SPA routing works**

The `wrangler.toml` already has:
```toml
assets = { not_found_handling = "single-page-application" }
```

This means `/rooms` and `/r/:slug` will serve `index.html` and let client-side routing handle it. No changes needed.

Verify by navigating directly to `iris.yinflow.life/rooms` — should load the app (not 404).

- [ ] **Step 2: Commit if any changes needed**

No commit expected — just verification.
