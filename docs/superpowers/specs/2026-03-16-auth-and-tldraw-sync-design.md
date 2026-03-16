# Auth (Cloudflare Access) + tldraw-sync Integration Design

**Date:** 2026-03-16
**Status:** Design
**Scope:** User authentication via Cloudflare Access, per-user Durable Object isolation, and tldraw-sync real-time canvas persistence

---

## 1. Problem

Iris has no authentication. All users share a single anonymous Durable Object. Canvas state is local-only (IndexedDB via `persistenceKey`). Users lose their work across browsers/devices, there's no per-user data isolation, and no foundation for collaboration or sharing.

## 2. Goals

- Authenticated access via Google OAuth, Apple Sign-In (Generic OIDC), and Email OTP
- Per-user data isolation: each user gets their own AgentDO and tldraw-sync DO
- Server-side canvas persistence via tldraw-sync (replaces local IndexedDB)
- Multi-page support within each user's room
- Auth-gated FL submissions (replace anonymous UUIDs with real user identities)
- Dev mode bypass for local development without Cloudflare Access

## 3. Non-Goals

- BYOM (Bring Your Own Model) — separate spec
- Space sharing / multi-user collaboration — future addition
- Multi-room per user — future addition (one room per user for now)
- Migration of existing local data — clean slate
- Email/password authentication — Email OTP covers this use case without credential storage
- E2E encryption of note content — future layer

## 4. Architecture Overview

### Production Request Flow

```
Browser
  ↓ HTTPS
Cloudflare Access (network gate)
  · Google OAuth · Apple OIDC · Email OTP
  · Issues RS256 JWT → Cf-Access-Jwt-Assertion header
  ↓ JWT in header
Worker (auth middleware)
  · Validates JWT via JWKS
  · Extracts sub + email
  · Upserts user in D1
  · Routes to DO
  ↓
  ├── POST /stream       → AgentDO(sub)        — conversation streaming
  ├── GET  /voice        → VoiceAgentDO(sub)   — voice WebSocket
  ├── WS   /sync/:roomId → TldrawSyncDO(sub)   — canvas sync
  ├── GET  /me           → D1 query            — user profile
  ├── POST /fl/rounds/*  → AggregationDO(mapId) — FL (auth required)
  └── GET  /fl/keys,status,aggregate,metrics    — FL (public)
```

### Local Dev Flow

```
Browser / curl
  ↓ No JWT needed (Cloudflare Access bypassed)
Worker (DEV_MODE=true)
  · Skips JWT validation
  · Reads X-Dev-User header (default: "dev-user-1")
  · Builds mock user: { sub: header_value, email: "{header_value}@dev.local" }
  · Routes to DO as normal
```

### Approach Choice

**Cloudflare Access + Worker-level selective auth (Option B).** Access provides the network-level login gate and JWT issuance. The Worker validates JWTs itself for route-level control — some routes (FL public endpoints) are exempted. This gives production protection from Access plus dev-mode flexibility from the Worker bypass.

**Why not Directus:** Directus cannot run on Cloudflare Workers (requires Docker + Node.js + SQL), uses HS256-only JWTs with no JWKS endpoint, and adds an entire server dependency for what Access provides at the edge for free. See research notes for full comparison.

## 5. Auth Middleware

### Flow (every request)

1. **Public route check** — `/fl/keys`, `/fl/rounds/status`, `/fl/rounds/aggregate`, `/fl/rounds/metrics` skip auth
2. **Dev bypass** — if `DEV_MODE=true`, read `X-Dev-User` header (default `dev-user-1`), build mock user, skip to step 6
3. **Extract JWT** from `Cf-Access-Jwt-Assertion` header. Missing → 401
4. **Verify JWT** — RS256 via `jose` library, JWKS from `https://{TEAM_DOMAIN}/cdn-cgi/access/certs`. Check issuer, audience, expiry. Invalid → 403
5. **Upsert user in D1** — `INSERT OR REPLACE` with email, name, avatar_url, last_seen_at
6. **Attach user to request context** — handler receives `{ sub, email, name }`

### New File: `worker/lib/auth.ts`

Responsibilities:
- `verifyAccessJwt(token, env)` — JWKS fetch (cached), JWT verification, returns payload
- `getAuthenticatedUser(request, env)` — full flow: extract header → verify → return user
- `buildDevUser(request)` — mock user from `X-Dev-User` header

### New File: `worker/middleware/auth-middleware.ts`

Responsibilities:
- Public routes allowlist
- Dev mode detection
- User context injection into request handling
- 401/403 error responses

## 6. D1 Schema

### users table

```sql
CREATE TABLE users (
  sub            TEXT PRIMARY KEY,   -- Cloudflare Access unique ID
  email          TEXT NOT NULL,       -- from JWT payload
  name           TEXT,                -- from identity endpoint (optional)
  avatar_url     TEXT,                -- from identity endpoint (optional)
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_users_email ON users(email);
```

User upsert happens on every authenticated request. First login creates the row; subsequent requests update `last_seen_at`.

### API

- `GET /me` — returns the authenticated user's profile from D1

## 7. Route Protection Map

| Route | Method | Auth | DO Target |
|---|---|---|---|
| `/stream` | POST | Required | AgentDO(sub) |
| `/voice` | GET (WS) | Required | VoiceAgentDO(sub) |
| `/sync/:roomId` | GET (WS) | Required | TldrawSyncDO(sub) |
| `/me` | GET | Required | D1 query |
| `/fl/rounds/open` | POST | Required | AggregationDO(mapId) |
| `/fl/rounds/submit` | POST | Required | AggregationDO(mapId) |
| `/fl/keys` | GET | Public | AggregationDO(mapId) |
| `/fl/rounds/status` | GET | Public | AggregationDO(mapId) |
| `/fl/rounds/aggregate` | GET | Public | AggregationDO(mapId) |
| `/fl/rounds/metrics` | GET | Public | AggregationDO(mapId) |

Change from current state: `/fl/rounds/open` and `/fl/rounds/submit` move from public to auth-required. The authenticated `sub` replaces the browser-generated UUID as `clientId` in FL submissions.

## 8. tldraw-sync Integration

### Room Model

One room per user. Room ID = user's `sub`. Multi-page within each room (tldraw native, up to 40 pages). Permissions enforced at the room level (owner only for Phase 1).

### WebSocket Connection Flow

1. **Client** calls `useSync({ uri: async () => { ... } })` with JWT token in query param
2. **Worker** receives WebSocket upgrade on `GET /sync/:roomId`
3. Worker extracts token from query param (WebSockets can't use custom headers)
4. Worker validates JWT using same auth middleware
5. Worker checks authorization: `user.sub === roomId` (owner check)
6. Worker forwards WebSocket to `TldrawSyncDO.fetch()`
7. **TldrawSyncDO** calls `handleSocketConnect({ sessionId, socket, isReadonly: false, meta: { sub, email } })`

### TldrawSyncDO

New Durable Object class based on `tldraw-sync-cloudflare` template:

- Extends or wraps `TldrawDurableObject` from `@tldraw/sync-core`
- Persists document state to DO SQLite automatically
- Handles WebSocket lifecycle (connect, message, close, error)
- One instance per user (keyed by `sub`)

### Asset Storage

- `POST /sync/assets/:assetId` — upload to R2 `TLDRAW_BUCKET` (auth required)
- `GET /sync/assets/:assetId` — download from R2 (auth required)
- Client uses `multiplayerAssetStore` from tldraw-sync to wire upload/download

### Client Migration

Replace in `client/App.tsx`:

```
// Before (local only)
<Tldraw persistenceKey="tldraw-agent-demo" ... >

// After (synced)
const store = useSync({
  uri: async () => {
    const token = getAccessJwt()
    return `${wsBase}/sync/${roomId}?token=${token}`
  },
  assets: multiplayerAssetStore,
})
<Tldraw store={store} ... >
```

Remove:
- `persistenceKey` prop
- localStorage-based FL client ID generation (use authenticated `sub`)
- Any IndexedDB persistence references

## 9. Data Model — What Lives Where

| Storage | Scope | Contents |
|---|---|---|
| **D1** | Shared | User accounts (sub, email, name, avatar_url, timestamps) |
| **AgentDO SQLite** | Per-user | Chat history, agent conversation state, model config, context items |
| **TldrawSyncDO SQLite** | Per-user | All pages, all shapes (mandalas, notes), bindings (arrows), asset metadata |
| **R2 FL_BUCKET** | Per-map | CKKS keypairs, encrypted submissions, plaintext aggregates |
| **R2 TLDRAW_BUCKET** | Per-user | Uploaded images, media assets |

## 10. Environment & Configuration

### New Environment Variables

| Variable | Type | Description |
|---|---|---|
| `TEAM_DOMAIN` | Secret | Cloudflare Access team URL (e.g., `https://iris.cloudflareaccess.com`) |
| `POLICY_AUD` | Secret | Application audience tag from Access dashboard |
| `DEV_MODE` | Var | `"true"` in local wrangler.toml, absent in production |
| `DB` | D1 binding | Cloudflare D1 database for user accounts |
| `TLDRAW_SYNC_DO` | DO binding | TldrawSyncDO namespace |
| `TLDRAW_BUCKET` | R2 binding | R2 bucket for tldraw assets |

### wrangler.toml Additions

```toml
# New Durable Object
[[durable_objects.bindings]]
name = "TLDRAW_SYNC_DO"
class_name = "TldrawSyncDO"

# D1 database
[[d1_databases]]
binding = "DB"
database_name = "iris-users"
database_id = "..."

# R2 for tldraw assets
[[r2_buckets]]
binding = "TLDRAW_BUCKET"
bucket_name = "iris-tldraw-assets"

[vars]
DEV_MODE = "false"
# TEAM_DOMAIN and POLICY_AUD set as secrets via dashboard/wrangler secret
```

### New Dependencies

| Package | Purpose | Where |
|---|---|---|
| `@tldraw/sync` | Client-side `useSync` hook | client |
| `@tldraw/sync-core` | Server-side sync primitives | worker |
| `jose` | JWT verification (RS256 + JWKS) | worker |

## 11. Implementation Phases

### Phase 1: Cloudflare Access + Auth Middleware

Independently deployable. App works as before but behind login, with per-user DO isolation.

| Step | Description |
|---|---|
| **1a** | Cloudflare Access dashboard setup: create application, configure Google OAuth + Apple (Generic OIDC) + Email OTP, set session duration, note TEAM_DOMAIN and POLICY_AUD |
| **1b** | Auth middleware: `worker/lib/auth.ts` (JWT validation, JWKS cache, dev bypass), `worker/middleware/auth-middleware.ts` (route protection, user context), update `worker/worker.ts` and `worker/environment.ts` |
| **1c** | D1 database: create `iris-users`, schema migration (users table), upsert logic, `GET /me` endpoint |
| **1d** | Per-user DO routing: change `idFromName('anonymous')` → `idFromName(user.sub)` in stream + voice routes. FL open/submit require auth, use `sub` as clientId |
| **1e** | Client auth integration: pass JWT in fetch headers, `GET /me` on app load, remove localStorage FL client ID |

### Phase 2: tldraw-sync Integration

Builds on Phase 1. Canvas data moves from browser to server.

| Step | Description |
|---|---|
| **2a** | TldrawSyncDO: new DO class based on tldraw-sync-cloudflare template, register in wrangler.toml, configure R2 |
| **2b** | WebSocket route + auth gate: `GET /sync/:roomId` handler, token from query param, JWT validation, ownership check, forward to DO |
| **2c** | Asset routes: `POST/GET /sync/assets/:assetId` with R2 storage, auth required |
| **2d** | Client migration: replace `persistenceKey` with `useSync` hook, configure `uri` with JWT, configure `multiplayerAssetStore`, remove old persistence code |
| **2e** | Agent ↔ sync coordination: verify agent shape creation/modification works through sync layer, test custom shape serialization |

## 12. Testing Strategy

| Area | Approach |
|---|---|
| Auth middleware | Unit tests: valid JWT → passes, expired → 403, missing → 401, dev bypass → mock user. Generate test JWTs with `jose`. |
| D1 upsert | Integration tests with Miniflare D1 bindings. First login creates row, repeat updates last_seen_at. |
| Per-user DO isolation | Dev mode: different `X-Dev-User` headers, verify no data leakage between users. |
| WebSocket auth gate | WS without token → rejected. Valid token → connected. Wrong roomId → rejected. |
| tldraw-sync round-trip | Create shapes → close browser → reopen → shapes persist. Pages sync correctly. |
| E2E production | Manual: log in with Google, create mandala, close browser, reopen, verify state. Two accounts for isolation. |

## 13. Security Considerations

### What Cloudflare Access Provides
- RS256 JWT with automatic key rotation (every 6 weeks)
- DDoS/WAF protection at the network edge
- Session management with configurable expiry
- SOC 2 Type II / ISO 27001 compliance

### Remaining Attack Surface
- **JWT validation bugs** — mitigated by well-tested middleware with small surface area
- **Authorization logic errors** — wrong DO routing could leak data. Mitigated by deterministic `idFromName(sub)` with tests
- **CORS misconfiguration** — restrict to production domain only
- **Note content visibility** — Worker can see plaintext note content during agent processing. E2E encryption is a future layer, out of scope for this spec

### What You Don't Store
- No passwords (OAuth/OTP only)
- No credential hashes
- No session tokens (Cloudflare manages sessions)
- No sensitive content in D1 (only metadata)

## 14. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Cloudflare Access free tier capped at 50 users | Blocks growth beyond 50 | Upgrade to $3/user/month when needed. Sufficient for beta. |
| Apple OIDC setup complexity | Delayed launch | Google + Email OTP available immediately. Apple can be added after initial launch. |
| tldraw-sync package compatibility | Integration issues with existing custom shapes | Test MandalaShapeUtil serialization early in Phase 2a. Reference tldraw-sync-cloudflare template. |
| Agent actions conflicting with sync | Race conditions between agent shape mutations and user edits | tldraw-sync handles conflict resolution via CRDT. Test in 2e. |
| DO storage limits | Large canvases hitting limits | Monitor. tldraw-sync handles pagination internally. R2 for large assets. |
