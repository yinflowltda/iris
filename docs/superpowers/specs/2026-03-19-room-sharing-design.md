# Room Sharing Design Spec

**Date:** 2026-03-19
**Status:** Draft
**Author:** Claude + Rafael

## Problem

Users have no way to share their tldraw canvas with others. Each user gets exactly one room (roomId = user's Cloudflare Access `sub`), and the sync route enforces owner-only access. Facilitators cannot observe or co-create in a participant's session.

## Goals

- Allow a room owner to invite others by email with `view` or `edit` permission
- Server-enforced read-only for view-only users (via `TLSocketRoom.handleSocketConnect({ isReadonly })`)
- Send invite notifications via Resend
- Stable, shareable room URLs using short random slugs
- Google Docs-style share dialog UI built with Radix primitives + plain CSS

## Non-Goals

- Multi-room per user (one room per user for now)
- Anonymous/public share links (Cloudflare Access gates all access)
- In-app notifications for new shares
- Room thumbnails or previews
- Accept/reject invitation flow (shares are active immediately)
- Forcible disconnection on permission change (known limitation: changes take effect on next WebSocket connection)

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│  Share UI   │────▶│  /rooms/*    │────▶│  D1 Database  │
│  (Radix)    │     │  API routes  │     │  room_shares  │
└─────────────┘     └──────┬───────┘     └───────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   Resend     │
                    │   (email)    │
                    └──────────────┘

┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│  useAuth    │────▶│  /sync/:id   │────▶│ TldrawSyncDO  │
│  Sync hook  │     │  auth check  │     │ TLSocketRoom  │
└─────────────┘     └──────────────┘     │ (isReadonly)   │
                                         └───────────────┘
```

## Data Model

### Users table (existing, modified)

Add a `room_slug` column for URL-safe room identification:

```sql
ALTER TABLE users ADD COLUMN room_slug TEXT UNIQUE;
```

The slug is a 6-character lowercase alphanumeric string (`[0-9a-z]`, ~2.18 billion combinations) generated on first login. Example: `k7x9m2`.

**Generation:** `crypto.getRandomValues()` → base36 → truncate to 6 chars. Slug is generated only when `room_slug IS NULL` (first login). Uses conditional update to prevent race conditions:

```sql
UPDATE users SET room_slug = ? WHERE sub = ? AND room_slug IS NULL
```

Retry up to 3 times on UNIQUE constraint violation (collision). At this project's scale, collisions are extremely unlikely.

### Room Shares table (new)

```sql
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

- `room_owner_sub` — the room owner's `sub` (FK to `users.sub`)
- `shared_with_email` — the invited user's email
- `shared_with_sub` — nullable, backfilled when the invited user first logs in via Cloudflare Access
- `permission` — `'view'` or `'edit'` (enforced by CHECK constraint)
- `updated_at` — tracks permission changes for auditing
- Primary key on `(room_owner_sub, shared_with_email)` — one permission per user per room

### Sub backfill

In `auth-middleware.ts`, after upserting the user, run a conditional backfill only on user creation (first login). The `upsertUser` function returns whether the row was newly inserted. If newly inserted, query and update:

```sql
UPDATE room_shares
SET shared_with_sub = ?
WHERE shared_with_email = ? AND shared_with_sub IS NULL
```

This avoids running a D1 query on every authenticated request. The `AND shared_with_sub IS NULL` condition prevents redundant writes.

## URL Scheme

| Context | URL | Behavior |
|---------|-----|----------|
| Root | `iris.yinflow.life` | Redirects to `/rooms` registry |
| Room registry | `iris.yinflow.life/rooms` | Lists your room + rooms shared with you |
| Enter a room | `iris.yinflow.life/r/k7x9m2` | Resolves slug → owner sub, enters the canvas |
| Invite email CTA | `iris.yinflow.life/r/k7x9m2` | Same as above |

### Client-side routing

Routes are handled client-side via `window.location.pathname` parsing (no router library needed):

- **`/`** → redirect to `/rooms`
- **`/rooms`** → render the Room Registry page
- **`/r/:slug`** → resolve slug via `GET /rooms/resolve/:slug`, then enter the canvas with `useAuthSync`

A `useRoom` hook manages the current route state, slug resolution, and room context.

### Slug resolution API

```
GET /rooms/resolve/:slug
```

**Auth:** Required (any authenticated user)

**Behavior:** Look up `users` table by `room_slug`, return the owner's sub. Does NOT reveal whether the requesting user has access — that check happens at WebSocket connect time.

**Response:**
```json
{
  "owner_sub": "owner-sub-123",
  "owner_name": "Rafael"
}
```

Returns `404` if slug doesn't exist.

## API Routes

All routes require authentication (handled by existing `authMiddleware`).

### POST /rooms/:roomId/shares

**Auth:** Owner only (`user.sub === roomId`). The `roomId` existence is implicitly guaranteed since the authenticated user's own `sub` must match.

**Request body:**
```json
{
  "email": "facilitator@example.com",
  "permission": "edit"
}
```

**Behavior:**
1. Validate `permission` is `'view'` or `'edit'`
2. Validate `email` is not the owner's own email
3. Upsert into `room_shares`
4. Look up owner's name/email from `users` table
5. Silently check if invitee already exists in `users`:
   - Exists → set `shared_with_sub`, send lighter "you've been added" email
   - Doesn't exist → send full invite email
6. Send email via Resend (fire-and-forget: share record is created regardless of email delivery success; failures are logged but do not fail the API call)
7. Return the created/updated share record

**Response:**
```json
{
  "room_owner_sub": "owner-sub-123",
  "shared_with_email": "facilitator@example.com",
  "permission": "edit",
  "created_at": "2026-03-19T12:00:00Z"
}
```

### DELETE /rooms/:roomId/shares

**Auth:** Owner only

**Request body:**
```json
{
  "email": "facilitator@example.com"
}
```

Note: email is passed in the request body (not the URL path) to avoid URL-encoding issues with `@` and `+` characters in email addresses.

**Behavior:** Delete the share record. If the shared user is currently connected via WebSocket, they are not forcibly disconnected — they lose access on next connection attempt. This is a known limitation; future enhancement could push a disconnect signal through the DO.

**Response:** `204 No Content`

### PATCH /rooms/:roomId/shares

**Auth:** Owner only

**Request body:**
```json
{
  "email": "facilitator@example.com",
  "permission": "view"
}
```

Note: email is passed in the request body (not the URL path) for the same URL-encoding reasons as DELETE.

**Behavior:** Update the permission and set `updated_at`. Takes effect on next WebSocket connection (existing connections retain their current permission level). This is a known limitation; downgrading from `edit` to `view` while a user is actively editing may allow unintended edits during the gap.

**Response:** Updated share record.

### GET /rooms/shared-with-me

**Auth:** Required (any authenticated user)

**Behavior:** Query `room_shares` joined with `users` to get owner info. Fetched once on app load and cached client-side. Query uses `shared_with_sub = ?` (indexed) as primary lookup, with fallback to `shared_with_email = ?` for users whose sub hasn't been backfilled yet.

**Response:**
```json
{
  "rooms": [
    {
      "owner_sub": "owner-sub-123",
      "owner_email": "rafael@yinflow.com.br",
      "owner_name": "Rafael",
      "room_slug": "k7x9m2",
      "permission": "edit"
    }
  ]
}
```

### GET /rooms/:roomId/shares

**Auth:** Owner only

**Behavior:** List all shares for the room.

**Response:**
```json
{
  "shares": [
    {
      "shared_with_email": "facilitator@example.com",
      "permission": "edit",
      "created_at": "2026-03-19T12:00:00Z"
    }
  ]
}
```

### GET /me (existing, modified)

The `/me` response now includes `room_slug`:

```json
{
  "sub": "user-sub-123",
  "email": "rafael@yinflow.com.br",
  "name": "Rafael",
  "avatar_url": null,
  "room_slug": "k7x9m2"
}
```

This is needed for the share dialog to display the copyable room link.

## Sync Route Changes

### Current (owner-only)
```ts
if (user.sub !== roomId) return 403
```

### New (owner + shared users)
```ts
// 1. Owner always has edit access
if (user.sub === roomId) {
  return connectToRoom(env, roomId, { isReadonly: false })
}

// 2. Check room_shares for access
// user.email is available from AuthUser (attached by auth middleware)
const share = await getShare(env.DB, roomId, user.sub, user.email)
if (!share) return 403

const isReadonly = share.permission === 'view'
return connectToRoom(env, roomId, { isReadonly })
```

The `getShare` function queries by both `shared_with_sub` (fast, indexed) and falls back to `shared_with_email` (for users who haven't had their sub backfilled yet). Both fields are available from `AuthUser` which is attached to the request by `authMiddleware`.

### TldrawSyncDO changes

Pass `isReadonly` through to `handleSocketConnect`:

```ts
room.handleSocketConnect({
  sessionId,
  socket: server as any,
  isReadonly,  // server-enforced
})
```

The `isReadonly` value is passed from the sync route to the DO via query param: `/sync/:roomId?readonly=true` (set by the worker route after auth check). This is consistent with how `sessionId` is already passed.

## Email Integration

### Setup
- Add `resend` npm dependency
- Store `RESEND_API_KEY` as a wrangler secret
- Verify `yinflow.life` domain in Resend dashboard (DNS records for DKIM/SPF)
- Add `RESEND_API_KEY` to `Environment` interface

### Email template

HTML email with inline CSS (no external stylesheet), responsive design. Content:

- **Subject:** "[Owner name] invited you to a Yinflow session"
- **Body:**
  - Owner name and context: "{Name} has invited you to their Yinflow session"
  - Permission level: "You can view this session" / "You can view and edit this session"
  - CTA button: "Join Session" → `https://iris.yinflow.life/r/{slug}`
  - Footer: "If you didn't expect this email, you can safely ignore it."

### Implementation

New file: `worker/lib/email.ts`
- `sendInviteEmail(env, { ownerName, ownerEmail, recipientEmail, permission, roomSlug })`
- Uses Resend SDK
- Share record is created regardless of email delivery success
- Email failures are logged (`console.error`) but do not fail the API call
- Returns `{ success: boolean, error?: string }`

## Client UI

### Share Button

- Position: top-right corner, persistent, outside tldraw's UI layer
- Visibility: only when viewing own room
- Style: matches Iris dark slate theme
- Icon: share/people icon

### Share Dialog (Radix Dialog)

Google Docs-style layout:

```
┌─────────────────────────────────────────┐
│  Share                              [×] │
├─────────────────────────────────────────┤
│  ┌─────────────────────┐ ┌──────┐      │
│  │ Add people by email  │ │ Edit ▾│ [Invite] │
│  └─────────────────────┘ └──────┘      │
├─────────────────────────────────────────┤
│  People with access                     │
│                                         │
│  Rafael (you)              Owner        │
│  facilitator@ex.com        Edit  ▾  [×] │
│  observer@ex.com           View  ▾  [×] │
├─────────────────────────────────────────┤
│  🔗 iris.yinflow.life/r/k7x9m2  [Copy] │
└─────────────────────────────────────────┘
```

Components:
- **Radix Dialog** for the modal
- **Radix Select** for permission dropdown (view/edit)
- Email input: standard `<input>` styled to match
- Share list: simple flexbox list with email, permission dropdown, remove button
- Room link: read-only text with copy button

### Room Registry Page (`/rooms`)

The landing page. Shows all rooms the user can access.

```
┌─────────────────────────────────────────────────┐
│  Your Rooms                                     │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  My Room                        [Share]   │  │
│  │  iris.yinflow.life/r/k7x9m2     Owner     │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  Shared with you                                │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  Rafael's Room                  Can edit   │  │
│  │  rafael@yinflow.com.br                    │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  Ana's Room                     View only  │  │
│  │  ana@example.com                          │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
└─────────────────────────────────────────────────┘
```

- **Your room** is always first, with a "Share" button that opens the share dialog
- **Shared rooms** listed below with owner name, email, and permission badge
- Clicking a room navigates to `/r/:slug` (enters the canvas)
- Styled with Iris dark slate glassmorphism theme
- Data from `GET /me` (own room slug) + `GET /rooms/shared-with-me` (shared rooms)
- A "Back to rooms" link/button is shown inside the canvas view to return to `/rooms`

### Read-Only Indicator

When viewing a room with `view` permission:
- Banner or badge: "Viewing — read only"
- tldraw automatically hides editing tools via the sync readonly signal

## Dev Mode

In dev mode (`DEV_MODE=true`), the dev user (`sub: 'dev-user-1'`) gets a `room_slug` generated like any other user. Room sharing works against the local D1 database. Multiple dev users can be simulated via the `X-Dev-User` header for testing multi-user scenarios.

## File Structure

### New files
- `worker/lib/email.ts` — Resend integration + email templates
- `worker/lib/room-store.ts` — D1 queries for `room_shares` (CRUD + permission lookups)
- `worker/routes/rooms.ts` — Room sharing API routes (including slug resolution)
- `client/components/ShareDialog.tsx` — Share dialog component
- `client/components/ShareDialog.css` — Styles
- `client/components/ShareButton.tsx` — Top-right share button
- `client/components/RoomRegistry.tsx` — Room registry page (`/rooms`)
- `client/components/RoomRegistry.css` — Styles
- `client/lib/use-room.ts` — Room context hook (routing, slug resolution, current room state)

### Modified files
- `worker/worker.ts` — Add room routes + slug resolution route
- `worker/routes/sync.ts` — Relax auth check, pass `isReadonly`
- `worker/routes/me.ts` — Include `room_slug` in response
- `worker/do/TldrawSyncDO.ts` — Accept and forward `isReadonly`
- `worker/lib/auth-middleware.ts` — Backfill `shared_with_sub` on first login
- `worker/lib/user-store.ts` — Add `room_slug` generation + queries
- `worker/d1/schema.sql` — Add `room_shares` table + `room_slug` column
- `worker/environment.ts` — Add `RESEND_API_KEY` binding
- `client/App.tsx` — Add ShareButton, RoomSwitcher, room context
- `client/lib/use-auth-sync.ts` — Accept arbitrary roomId (not just user's sub)
- `shared/types/User.ts` — Add `room_slug` to User type

## Testing Strategy

### Unit tests
- `room-store.ts` — CRUD operations, permission queries, slug generation, collision retry
- `email.ts` — Template rendering (HTML output validation)
- `rooms.ts` routes — Auth checks, owner-only enforcement, input validation
- `sync.ts` — Permission-based readonly flag logic

### Integration tests
- Share flow: owner invites → share record created → invitee can connect
- Permission enforcement: view-only user cannot mutate shapes
- Sub backfill: new user logs in → existing shares get `shared_with_sub` populated
- Revocation: owner removes share → user gets 403 on next connect
- Slug resolution: `/r/:slug` resolves to correct room
- Email failure resilience: share created even if Resend is down

## Security Considerations

- No user enumeration: `POST /rooms/:roomId/shares` returns the same response regardless of whether the invitee email exists in the system
- Room slugs are random, not sequential — not guessable, but also not secret (Cloudflare Access gates all access regardless)
- Owner-only mutations: only the room owner can invite, revoke, or change permissions
- `isReadonly` is server-enforced by `TLSocketRoom` — client cannot bypass it
- Email validation: basic format check on invite email
- Email passed in request body (not URL path) to avoid encoding issues and information leakage in server logs
- Rate limiting: consider adding rate limits to the invite endpoint to prevent spam (future)

## Known Limitations

- **Permission changes are not instant:** Changing a user's permission (or revoking access) takes effect on their next WebSocket connection, not the current one. Future enhancement: push a disconnect signal through the DO to force reconnect with updated permissions.
- **No bounce/delivery tracking:** Resend provides webhooks for delivery events, but we don't consume them in this phase. Email is fire-and-forget.
- **Single room per user:** The data model supports multiple rooms conceptually (room_owner_sub is not unique), but the app only creates one room per user. Multi-room is a future enhancement.
