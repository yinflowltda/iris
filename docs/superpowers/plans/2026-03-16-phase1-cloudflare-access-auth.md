# Phase 1: Cloudflare Access + Auth Middleware Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user authentication via Cloudflare Access (Google, Apple, Email OTP) with per-user Durable Object isolation and D1 user accounts.

**Architecture:** Cloudflare Access sits at the network edge issuing RS256 JWTs. A Worker auth middleware validates JWTs (or bypasses in dev mode), upserts users in D1, and routes requests to per-user DOs using the JWT `sub` claim. No passwords stored — all credential handling delegated to OAuth/OTP providers.

**Tech Stack:** Cloudflare Access, `jose` (JWT verification), D1 (user accounts), itty-router middleware, Vitest

**Spec:** `docs/superpowers/specs/2026-03-16-auth-and-tldraw-sync-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| **Create:** `worker/lib/auth.ts` | JWT verification, JWKS fetching, dev user builder — pure functions, no request handling |
| **Create:** `worker/lib/auth-middleware.ts` | Route protection, public route allowlist, user context injection — itty-router middleware |
| **Create:** `worker/lib/user-store.ts` | D1 user upsert and query — data access layer for the users table |
| **Create:** `worker/routes/me.ts` | `GET /me` route handler |
| **Create:** `worker/lib/auth-types.ts` | `AuthUser` type, `AuthenticatedRequest` type extension |
| **Create:** `shared/types/User.ts` | Shared `User` type (used by client and worker) |
| **Create:** `worker/d1/schema.sql` | D1 schema migration file |
| **Create:** `tests/unit/auth.test.ts` | Unit tests for JWT verification and dev bypass |
| **Create:** `tests/unit/auth-middleware.test.ts` | Unit tests for route protection logic |
| **Create:** `tests/unit/user-store.test.ts` | Unit tests for D1 upsert |
| **Modify:** `worker/environment.ts` | Add new bindings (DB, TEAM_DOMAIN, POLICY_AUD, DEV_MODE) |
| **Modify:** `worker/worker.ts` | Add auth middleware to router, add `/me` route, update CORS |
| **Modify:** `worker/routes/stream.ts` | Use `user.sub` instead of `'anonymous'` for DO routing |
| **Modify:** `worker/routes/voice.ts` | Use `user.sub` instead of `'anonymous'` for DO routing |
| **Modify:** `wrangler.toml` | Add D1 binding, DEV_MODE var, TLDRAW_SYNC_DO (migration v5) |
| **Modify:** `client/lib/flora/use-fl-orchestrator.ts` | Remove `getOrCreateClientId()`, accept `clientId` from auth context |
| **Modify:** `client/App.tsx` | Add user context provider, `GET /me` on startup, 401 handling |
| **Modify:** `package.json` | Add `jose` dependency |

---

## Chunk 1: Auth Core

### Task 1: Add `jose` dependency and update Environment types

**Files:**
- Modify: `package.json`
- Modify: `worker/environment.ts`
- Create: `worker/lib/auth-types.ts`
- Create: `shared/types/User.ts`

- [ ] **Step 1: Install jose**

Run: `bun add jose`

- [ ] **Step 2: Create shared User type**

```typescript
// shared/types/User.ts
export interface User {
  sub: string
  email: string
  name: string | null
  avatar_url: string | null
}
```

- [ ] **Step 3: Create auth types**

```typescript
// worker/lib/auth-types.ts
import type { IRequest } from 'itty-router'
import type { User } from '../../shared/types/User'

export interface AuthUser extends User {
  /** True when user was created via dev bypass, not real JWT */
  isDev: boolean
}

export interface AuthenticatedRequest extends IRequest {
  user: AuthUser
}
```

- [ ] **Step 4: Update Environment interface**

Add new bindings to `worker/environment.ts`:

```typescript
export interface Environment {
  AGENT_DURABLE_OBJECT: DurableObjectNamespace
  VOICE_AGENT_DO: DurableObjectNamespace
  AGGREGATION_DO: DurableObjectNamespace
  AI: Ai
  FL_BUCKET: R2Bucket
  TTS_ENABLED: string | undefined
  OPENAI_COMPATIBLE_BASE_URL: string | undefined
  OPENAI_COMPATIBLE_API_KEY: string | undefined
  // Auth
  TEAM_DOMAIN: string | undefined
  POLICY_AUD: string | undefined
  DEV_MODE: string | undefined
  DB: D1Database
}
```

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: May have errors in files that use Environment (expected — DB binding doesn't exist yet). Auth-related files should compile.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lockb worker/environment.ts worker/lib/auth-types.ts shared/types/User.ts
git commit -m "feat(auth): add jose dep, auth types, environment bindings"
```

---

### Task 2: JWT verification (`worker/lib/auth.ts`)

**Files:**
- Create: `worker/lib/auth.ts`
- Create: `tests/unit/auth.test.ts`

- [ ] **Step 1: Write failing tests for auth.ts**

```typescript
// tests/unit/auth.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as jose from 'jose'

// We'll test the pure functions from auth.ts
// Need to generate real RS256 keys for testing

let privateKey: CryptoKey
let publicKey: CryptoKey

beforeEach(async () => {
  const keyPair = await jose.generateKeyPair('RS256')
  privateKey = keyPair.privateKey
  publicKey = keyPair.publicKey
})

async function signTestJwt(
  payload: Record<string, unknown>,
  key: CryptoKey,
  options?: { kid?: string },
): Promise<string> {
  return new jose.SignJWT(payload as jose.JWTPayload)
    .setProtectedHeader({ alg: 'RS256', kid: options?.kid ?? 'test-kid' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key)
}

describe('verifyAccessJwt', () => {
  it('returns payload for a valid JWT', async () => {
    const { verifyAccessJwt } = await import('../../worker/lib/auth')
    const token = await signTestJwt(
      { sub: 'user-123', email: 'test@example.com', aud: 'test-aud', iss: 'https://test.cloudflareaccess.com' },
      privateKey,
    )

    const jwks = jose.createLocalJWKSet({
      keys: [{ ...(await jose.exportJWK(publicKey)), kid: 'test-kid', alg: 'RS256', use: 'sig' }],
    })

    const payload = await verifyAccessJwt(token, {
      audience: 'test-aud',
      issuer: 'https://test.cloudflareaccess.com',
      jwks,
    })

    expect(payload.sub).toBe('user-123')
    expect(payload.email).toBe('test@example.com')
  })

  it('throws for expired JWT', async () => {
    const { verifyAccessJwt } = await import('../../worker/lib/auth')
    const token = await new jose.SignJWT({ sub: 'user-123', email: 'test@example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .setAudience('test-aud')
      .setIssuer('https://test.cloudflareaccess.com')
      .sign(privateKey)

    const jwks = jose.createLocalJWKSet({
      keys: [{ ...(await jose.exportJWK(publicKey)), kid: 'test-kid', alg: 'RS256', use: 'sig' }],
    })

    await expect(
      verifyAccessJwt(token, { audience: 'test-aud', issuer: 'https://test.cloudflareaccess.com', jwks }),
    ).rejects.toThrow()
  })

  it('throws for wrong audience', async () => {
    const { verifyAccessJwt } = await import('../../worker/lib/auth')
    const token = await signTestJwt(
      { sub: 'user-123', email: 'test@example.com', aud: 'wrong-aud', iss: 'https://test.cloudflareaccess.com' },
      privateKey,
    )

    const jwks = jose.createLocalJWKSet({
      keys: [{ ...(await jose.exportJWK(publicKey)), kid: 'test-kid', alg: 'RS256', use: 'sig' }],
    })

    await expect(
      verifyAccessJwt(token, { audience: 'test-aud', issuer: 'https://test.cloudflareaccess.com', jwks }),
    ).rejects.toThrow()
  })
})

describe('buildDevUser', () => {
  it('builds user from X-Dev-User header', async () => {
    const { buildDevUser } = await import('../../worker/lib/auth')
    const user = buildDevUser('test-user-42')

    expect(user.sub).toBe('test-user-42')
    expect(user.email).toBe('test-user-42@dev.local')
    expect(user.isDev).toBe(true)
  })

  it('defaults to dev-user-1 when header is empty', async () => {
    const { buildDevUser } = await import('../../worker/lib/auth')
    const user = buildDevUser(null)

    expect(user.sub).toBe('dev-user-1')
    expect(user.email).toBe('dev-user-1@dev.local')
  })
})

describe('extractJwt', () => {
  it('extracts from Cf-Access-Jwt-Assertion header', async () => {
    const { extractJwt } = await import('../../worker/lib/auth')
    const headers = new Headers({ 'Cf-Access-Jwt-Assertion': 'token-abc' })
    expect(extractJwt(headers)).toBe('token-abc')
  })

  it('falls back to CF_Authorization cookie', async () => {
    const { extractJwt } = await import('../../worker/lib/auth')
    const headers = new Headers({ Cookie: 'CF_Authorization=token-from-cookie; other=value' })
    expect(extractJwt(headers)).toBe('token-from-cookie')
  })

  it('returns null when neither present', async () => {
    const { extractJwt } = await import('../../worker/lib/auth')
    const headers = new Headers()
    expect(extractJwt(headers)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- tests/unit/auth.test.ts`
Expected: FAIL — module `../../worker/lib/auth` not found

- [ ] **Step 3: Implement auth.ts**

```typescript
// worker/lib/auth.ts
import { jwtVerify, type JWTVerifyGetKey, type JWTPayload } from 'jose'
import type { AuthUser } from './auth-types'

export interface VerifyOptions {
  audience: string
  issuer: string
  jwks: JWTVerifyGetKey
}

/**
 * Verify a Cloudflare Access RS256 JWT and return the payload.
 * Throws on invalid/expired/wrong-audience tokens.
 */
export async function verifyAccessJwt(
  token: string,
  options: VerifyOptions,
): Promise<JWTPayload & { sub: string; email: string }> {
  const { payload } = await jwtVerify(token, options.jwks, {
    issuer: options.issuer,
    audience: options.audience,
  })

  if (!payload.sub || !payload.email) {
    throw new Error('JWT missing required claims: sub, email')
  }

  return payload as JWTPayload & { sub: string; email: string }
}

/**
 * Extract JWT from Cf-Access-Jwt-Assertion header or CF_Authorization cookie.
 * Returns null if neither is present.
 */
export function extractJwt(headers: Headers): string | null {
  // Prefer header (set by Cloudflare Access on all proxied requests)
  const headerToken = headers.get('Cf-Access-Jwt-Assertion')
  if (headerToken) return headerToken

  // Fallback to cookie (needed for WebSocket upgrades)
  const cookie = headers.get('Cookie')
  if (cookie) {
    const match = cookie.match(/CF_Authorization=([^;]+)/)
    if (match) return match[1]
  }

  return null
}

/**
 * Build a mock user for dev mode.
 * Uses X-Dev-User header value or defaults to 'dev-user-1'.
 */
export function buildDevUser(devUserHeader: string | null): AuthUser {
  const sub = devUserHeader || 'dev-user-1'
  return {
    sub,
    email: `${sub}@dev.local`,
    name: sub,
    avatar_url: null,
    isDev: true,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test -- tests/unit/auth.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add worker/lib/auth.ts tests/unit/auth.test.ts
git commit -m "feat(auth): JWT verification, token extraction, dev user builder"
```

---

### Task 3: D1 user store (`worker/lib/user-store.ts`)

**Files:**
- Create: `worker/d1/schema.sql`
- Create: `worker/lib/user-store.ts`
- Create: `tests/unit/user-store.test.ts`

- [ ] **Step 1: Create D1 schema migration file**

```sql
-- worker/d1/schema.sql
CREATE TABLE IF NOT EXISTS users (
  sub            TEXT PRIMARY KEY,
  email          TEXT NOT NULL,
  name           TEXT,
  avatar_url     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
```

- [ ] **Step 2: Write failing tests for user-store.ts**

```typescript
// tests/unit/user-store.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock D1Database interface for testing
function createMockD1() {
  const results: Record<string, unknown>[] = []
  const mockStatement = {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({ success: true }),
    first: vi.fn().mockResolvedValue(null),
  }
  const mockDb = {
    prepare: vi.fn().mockReturnValue(mockStatement),
    _statement: mockStatement,
  }
  return mockDb
}

describe('upsertUser', () => {
  it('calls D1 with correct SQL and bindings', async () => {
    const { upsertUser } = await import('../../worker/lib/user-store')
    const db = createMockD1()

    await upsertUser(db as unknown as D1Database, {
      sub: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      avatar_url: 'https://example.com/avatar.jpg',
    })

    expect(db.prepare).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users'),
    )
    expect(db._statement.bind).toHaveBeenCalledWith(
      'user-123',
      'test@example.com',
      'Test User',
      'https://example.com/avatar.jpg',
    )
    expect(db._statement.run).toHaveBeenCalled()
  })
})

describe('getUserBySub', () => {
  it('returns user when found', async () => {
    const { getUserBySub } = await import('../../worker/lib/user-store')
    const db = createMockD1()
    db._statement.first.mockResolvedValue({
      sub: 'user-123',
      email: 'test@example.com',
      name: 'Test',
      avatar_url: null,
      created_at: '2026-03-16T00:00:00',
      last_seen_at: '2026-03-16T00:00:00',
    })

    const user = await getUserBySub(db as unknown as D1Database, 'user-123')

    expect(user).not.toBeNull()
    expect(user!.sub).toBe('user-123')
    expect(db._statement.bind).toHaveBeenCalledWith('user-123')
  })

  it('returns null when not found', async () => {
    const { getUserBySub } = await import('../../worker/lib/user-store')
    const db = createMockD1()

    const user = await getUserBySub(db as unknown as D1Database, 'nonexistent')
    expect(user).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun run test -- tests/unit/user-store.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement user-store.ts**

```typescript
// worker/lib/user-store.ts
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
  return db
    .prepare('SELECT * FROM users WHERE sub = ?')
    .bind(sub)
    .first<UserRow>()
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test -- tests/unit/user-store.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add worker/d1/schema.sql worker/lib/user-store.ts tests/unit/user-store.test.ts
git commit -m "feat(auth): D1 user store with upsert and query"
```

---

### Task 4: Auth middleware (`worker/lib/auth-middleware.ts`)

**Files:**
- Create: `worker/lib/auth-middleware.ts`
- Create: `tests/unit/auth-middleware.test.ts`

- [ ] **Step 1: Write failing tests for auth-middleware**

```typescript
// tests/unit/auth-middleware.test.ts
import { describe, it, expect, vi } from 'vitest'

describe('isPublicRoute', () => {
  it('returns true for GET /fl/keys', async () => {
    const { isPublicRoute } = await import('../../worker/lib/auth-middleware')
    expect(isPublicRoute('GET', '/fl/keys')).toBe(true)
  })

  it('returns true for GET /fl/rounds/status', async () => {
    const { isPublicRoute } = await import('../../worker/lib/auth-middleware')
    expect(isPublicRoute('GET', '/fl/rounds/status')).toBe(true)
  })

  it('returns true for GET /fl/rounds/aggregate', async () => {
    const { isPublicRoute } = await import('../../worker/lib/auth-middleware')
    expect(isPublicRoute('GET', '/fl/rounds/aggregate')).toBe(true)
  })

  it('returns false for POST /fl/rounds/aggregate', async () => {
    const { isPublicRoute } = await import('../../worker/lib/auth-middleware')
    expect(isPublicRoute('POST', '/fl/rounds/aggregate')).toBe(false)
  })

  it('returns true for GET /fl/rounds/metrics', async () => {
    const { isPublicRoute } = await import('../../worker/lib/auth-middleware')
    expect(isPublicRoute('GET', '/fl/rounds/metrics')).toBe(true)
  })

  it('returns false for POST /stream', async () => {
    const { isPublicRoute } = await import('../../worker/lib/auth-middleware')
    expect(isPublicRoute('POST', '/stream')).toBe(false)
  })

  it('returns false for GET /me', async () => {
    const { isPublicRoute } = await import('../../worker/lib/auth-middleware')
    expect(isPublicRoute('GET', '/me')).toBe(false)
  })

  it('returns false for POST /fl/rounds/open', async () => {
    const { isPublicRoute } = await import('../../worker/lib/auth-middleware')
    expect(isPublicRoute('POST', '/fl/rounds/open')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- tests/unit/auth-middleware.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement auth-middleware.ts**

```typescript
// worker/lib/auth-middleware.ts
import { createRemoteJWKSet } from 'jose'
import type { IRequest } from 'itty-router'
import type { Environment } from '../environment'
import type { AuthUser } from './auth-types'
import { extractJwt, verifyAccessJwt, buildDevUser } from './auth'
import { upsertUser } from './user-store'

/**
 * Public routes that don't require authentication.
 * Format: "METHOD /path" — method matters (GET /fl/rounds/aggregate is public, POST is not).
 */
// Lazy singleton for JWKS — avoids creating a new cache per request
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null
let _jwksTeamDomain: string | null = null

function getJwks(teamDomain: string) {
  if (!_jwks || _jwksTeamDomain !== teamDomain) {
    _jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`))
    _jwksTeamDomain = teamDomain
  }
  return _jwks
}

const PUBLIC_ROUTES: Set<string> = new Set([
  'GET /fl/keys',
  'GET /fl/rounds/status',
  'GET /fl/rounds/aggregate',
  'GET /fl/rounds/metrics',
])

/**
 * Check if a route is public (no auth required).
 */
export function isPublicRoute(method: string, pathname: string): boolean {
  // Strip query params for matching
  const path = pathname.split('?')[0]
  return PUBLIC_ROUTES.has(`${method.toUpperCase()} ${path}`)
}

/**
 * itty-router middleware that authenticates requests.
 * - Public routes pass through
 * - Dev mode builds a mock user
 * - Production validates JWT and upserts user in D1
 *
 * On success, attaches `user: AuthUser` to the request object.
 * On failure, returns a 401 or 403 Response.
 */
export async function authMiddleware(
  request: IRequest,
  env: Environment,
): Promise<Response | void> {
  const url = new URL(request.url)

  // 1. Public routes skip auth
  if (isPublicRoute(request.method, url.pathname)) {
    return // continue to handler
  }

  // 2. Dev bypass
  if (env.DEV_MODE === 'true') {
    const devUserHeader = request.headers.get('X-Dev-User')
    const user = buildDevUser(devUserHeader)
    ;(request as IRequest & { user: AuthUser }).user = user
    return // continue to handler
  }

  // 3. Extract JWT
  const token = extractJwt(request.headers)
  if (!token) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 4. Verify JWT
  if (!env.TEAM_DOMAIN || !env.POLICY_AUD) {
    console.error('TEAM_DOMAIN or POLICY_AUD not configured')
    return new Response(JSON.stringify({ error: 'Server auth misconfigured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // Lazy singleton — reuses JWKS cache across requests
    const jwks = getJwks(env.TEAM_DOMAIN)

    const payload = await verifyAccessJwt(token, {
      audience: env.POLICY_AUD,
      issuer: env.TEAM_DOMAIN,
      jwks,
    })

    // 5. Upsert user in D1
    const user: AuthUser = {
      sub: payload.sub,
      email: payload.email,
      name: (payload as Record<string, unknown>).name as string | null ?? null,
      avatar_url: (payload as Record<string, unknown>).picture as string | null ?? null,
      isDev: false,
    }

    await upsertUser(env.DB, user)

    // 6. Attach user to request
    ;(request as IRequest & { user: AuthUser }).user = user
  } catch (err) {
    console.error('JWT verification failed:', err)
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test -- tests/unit/auth-middleware.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add worker/lib/auth-middleware.ts tests/unit/auth-middleware.test.ts
git commit -m "feat(auth): auth middleware with public route allowlist"
```

---

### Task 5: `GET /me` route and wiring into router

**Files:**
- Create: `worker/routes/me.ts`
- Modify: `worker/worker.ts`
- Modify: `wrangler.toml`

- [ ] **Step 1: Create /me route handler**

```typescript
// worker/routes/me.ts
import type { IRequest } from 'itty-router'
import type { AuthUser } from '../lib/auth-types'

/**
 * GET /me — returns the authenticated user's profile.
 * User is already attached to request by auth middleware.
 */
export function me(request: IRequest): Response {
  const user = (request as IRequest & { user: AuthUser }).user
  return Response.json({
    sub: user.sub,
    email: user.email,
    name: user.name,
    avatar_url: user.avatar_url,
  })
}
```

- [ ] **Step 2: Update worker.ts — add middleware, /me route, restrict CORS**

Replace entire `worker/worker.ts`:

```typescript
import { WorkerEntrypoint } from 'cloudflare:workers'
import type { ExecutionContext } from '@cloudflare/workers-types'
import { AutoRouter, cors, error, type IRequest } from 'itty-router'
import type { Environment } from './environment'
import { authMiddleware } from './lib/auth-middleware'
import { getAvailableModels } from './routes/models'
import {
  getPublicKey,
  openRound,
  submitDelta,
  roundStatus,
  roundMetrics,
  getAggregate,
  uploadAggregate,
  aggregateNow,
} from './routes/fl-rounds'
import { stream } from './routes/stream'
import { voice } from './routes/voice'
import { me } from './routes/me'

const { preflight, corsify } = cors({
  origin: (origin) => {
    // Allow any origin in dev, restrict in production
    if (!origin) return '*'
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) return origin
    if (origin === 'https://iris.yinflow.life') return origin
    return undefined
  },
  credentials: true,
})

const router = AutoRouter<IRequest, [env: Environment, ctx: ExecutionContext]>({
  before: [preflight, authMiddleware],
  finally: [corsify],
  catch: (e) => {
    console.error(e)
    return error(e)
  },
})
  .get('/me', me)
  .post('/stream', stream)
  .get('/voice', voice)
  .get('/models', (_req: IRequest, env: Environment) => {
    return Response.json(getAvailableModels(env))
  })
  .get('/fl/keys', getPublicKey)
  .post('/fl/rounds/open', openRound)
  .post('/fl/rounds/submit', submitDelta)
  .get('/fl/rounds/status', roundStatus)
  .get('/fl/rounds/metrics', roundMetrics)
  .get('/fl/rounds/aggregate', getAggregate)
  .post('/fl/rounds/aggregate', uploadAggregate)
  .post('/fl/rounds/aggregate-now', aggregateNow)

export default class extends WorkerEntrypoint<Environment> {
  override fetch(request: Request): Promise<Response> {
    return router.fetch(request, this.env, this.ctx)
  }
}

export { AgentDurableObject } from './do/AgentDurableObject'
export { AggregationDO } from './do/AggregationDO'
export { VoiceAgentDurableObject } from './do/VoiceAgentDurableObject'
```

- [ ] **Step 3: Update wrangler.toml — add D1 binding and DEV_MODE**

Add D1 binding block after the existing `[[r2_buckets]]` section:

```toml
# D1 database for user accounts
[[d1_databases]]
binding = "DB"
database_name = "iris-users"
database_id = "placeholder-create-via-wrangler-d1-create"
```

Append `DEV_MODE` to the **existing** `[vars]` section (do NOT create a duplicate `[vars]` block):

```toml
[vars]
TTS_ENABLED = "false"
OPENAI_COMPATIBLE_BASE_URL = "http://127.0.0.1:3456/v1"
OPENAI_COMPATIBLE_API_KEY = "not-needed"
DEV_MODE = "true"   # ← add this line
```

Note: `TEAM_DOMAIN` and `POLICY_AUD` are set as secrets via `wrangler secret put` for production, not in wrangler.toml.

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS (or existing unrelated errors only)

- [ ] **Step 5: Commit**

```bash
git add worker/routes/me.ts worker/worker.ts wrangler.toml
git commit -m "feat(auth): wire auth middleware into router, add /me endpoint, restrict CORS"
```

---

### Task 6: Per-user DO routing

**Files:**
- Modify: `worker/routes/stream.ts`
- Modify: `worker/routes/voice.ts`

- [ ] **Step 1: Update stream.ts to use user.sub**

Replace `worker/routes/stream.ts`:

```typescript
import type { IRequest } from 'itty-router'
import type { Environment } from '../environment'
import type { AuthUser } from '../lib/auth-types'

export async function stream(request: IRequest, env: Environment) {
  const user = (request as IRequest & { user: AuthUser }).user
  const id = env.AGENT_DURABLE_OBJECT.idFromName(user.sub)
  const DO = env.AGENT_DURABLE_OBJECT.get(id)
  const response = await DO.fetch(request.url, {
    method: 'POST',
    body: request.body as any,
  })

  return new Response(response.body as BodyInit, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Transfer-Encoding': 'chunked',
    },
  })
}
```

Note: CORS headers removed from individual routes — now handled globally by the corsify middleware in worker.ts.

- [ ] **Step 2: Update voice.ts to use user.sub**

Replace `worker/routes/voice.ts`:

```typescript
import type { IRequest } from 'itty-router'
import type { Environment } from '../environment'
import type { AuthUser } from '../lib/auth-types'

export async function voice(request: IRequest, env: Environment): Promise<Response> {
  const upgradeHeader = request.headers.get('Upgrade')
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 })
  }

  const user = (request as IRequest & { user: AuthUser }).user
  const id = env.VOICE_AGENT_DO.idFromName(user.sub)
  const stub = env.VOICE_AGENT_DO.get(id)

  return stub.fetch(request.url, {
    headers: request.headers,
  })
}
```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add worker/routes/stream.ts worker/routes/voice.ts
git commit -m "feat(auth): per-user DO routing via user.sub instead of 'anonymous'"
```

---

### Task 7: Client auth context and startup

**Files:**
- Modify: `client/App.tsx`
- Modify: `client/lib/flora/use-fl-orchestrator.ts`

- [ ] **Step 1: Add auth context and /me call to App.tsx**

Add a new `useAuth` hook at the top of `client/App.tsx` (before the App component). This hook:
1. Calls `GET /me` on mount
2. Stores the user in state
3. Returns loading/error/user

```typescript
// Add near the top of App.tsx, before the App component
import type { User } from '../shared/types/User'

function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/me', { credentials: 'include' })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          // Access session expired — redirect to login
          window.location.reload()
          return
        }
        if (!res.ok) throw new Error(`/me failed: ${res.status}`)
        const data = await res.json()
        setUser(data as User)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return { user, loading, error }
}
```

Then wrap the main render in a loading/auth gate:

```typescript
// Inside the App component, at the top of the return
const { user, loading, error: authError } = useAuth()

if (loading) return <div className="auth-loading">Loading...</div>
if (authError || !user) return <div className="auth-error">Authentication required. Refreshing...</div>
```

The `user` object is now available to pass to child components.

- [ ] **Step 2: Remove getOrCreateClientId from FL orchestrator**

In `client/lib/flora/use-fl-orchestrator.ts`:

1. Remove the `getOrCreateClientId()` function (lines ~160-167)
2. Change `createFLOrchestrator` to accept `clientId` as a config parameter:

```typescript
export interface FLOrchestratorConfig {
  transport: FLTransport
  mapId: string
  clientId: string  // Add: from auth context
}

export function createFLOrchestrator(config: FLOrchestratorConfig) {
  const clientId = config.clientId  // Changed: was getOrCreateClientId()
  // ... rest unchanged
}
```

3. Update the React hook `useFLOrchestrator` to accept `clientId` and pass it through.

- [ ] **Step 3: Wire clientId from auth context to FLHooksMount**

The `user.sub` from `useAuth()` needs to reach `FLHooksMount` (a child of `<Tldraw>`). Create a simple React context:

```typescript
// Add to client/App.tsx (near other context definitions)
const AuthUserContext = React.createContext<User | null>(null)
export const useAuthUser = () => {
  const user = React.useContext(AuthUserContext)
  if (!user) throw new Error('useAuthUser must be used within AuthUserContext')
  return user
}
```

Wrap the Tldraw tree with `<AuthUserContext.Provider value={user}>` (the `user` from `useAuth()`).

In `FLHooksMount`, call `useAuthUser()` to get `user.sub` and pass it as `clientId` to `useFLOrchestrator`.

- [ ] **Step 4: Fix FL orchestrator tests**

In `tests/unit/flora/use-fl-orchestrator.test.ts`, add `clientId: 'test-client'` to all `createFLOrchestrator` config objects:

```typescript
// Before:
const config = { transport: mockTransport, mapId: 'test-map' }

// After:
const config = { transport: mockTransport, mapId: 'test-map', clientId: 'test-client' }
```

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `bun run test`
Expected: All tests pass including updated FL orchestrator tests.

- [ ] **Step 5: Commit**

```bash
git add client/App.tsx client/lib/flora/use-fl-orchestrator.ts
git commit -m "feat(auth): client auth context, /me startup, remove anonymous FL client ID"
```

---

### Task 8: D1 database creation and deployment config

**Files:**
- No code changes — infrastructure setup

- [ ] **Step 1: Create D1 database**

Run: `bunx wrangler d1 create iris-users`

This outputs a `database_id`. Copy it.

- [ ] **Step 2: Update wrangler.toml with real database_id**

Replace `database_id = "placeholder-create-via-wrangler-d1-create"` with the actual ID from step 1.

- [ ] **Step 3: Run D1 schema migration**

Run: `bunx wrangler d1 execute iris-users --local --file=worker/d1/schema.sql`

For production: `bunx wrangler d1 execute iris-users --remote --file=worker/d1/schema.sql`

- [ ] **Step 4: Set production secrets**

```bash
bunx wrangler secret put TEAM_DOMAIN
# Enter: https://iris.cloudflareaccess.com (or your team domain)

bunx wrangler secret put POLICY_AUD
# Enter: the audience tag from the Access dashboard
```

- [ ] **Step 5: Test locally with dev mode**

Run: `bun run dev`

Then test:
```bash
# Default dev user
curl http://localhost:8787/me
# Expected: {"sub":"dev-user-1","email":"dev-user-1@dev.local","name":"dev-user-1","avatar_url":null}

# Custom dev user
curl -H "X-Dev-User: rafa" http://localhost:8787/me
# Expected: {"sub":"rafa","email":"rafa@dev.local","name":"rafa","avatar_url":null}

# Public route (no auth needed)
curl http://localhost:8787/fl/rounds/metrics?mapId=test
# Expected: 200 (not 401)
```

- [ ] **Step 6: Commit wrangler.toml with real database_id**

```bash
git add wrangler.toml
git commit -m "chore: add D1 database ID for iris-users"
```

---

### Task 9: Cloudflare Access dashboard setup

**Files:**
- No code changes — Cloudflare dashboard configuration

- [ ] **Step 1: Create Access application**

In the Cloudflare Zero Trust dashboard:
1. Go to Access → Applications → Add an application
2. Type: Self-hosted
3. Application domain: `iris.yinflow.life`
4. Session duration: 24 hours (default)
5. Save — note the **Application Audience (AUD)** tag

- [ ] **Step 2: Configure Google OAuth identity provider**

1. Go to Settings → Authentication → Login methods → Add new
2. Select Google
3. Create OAuth credentials in Google Cloud Console (OAuth 2.0 client)
4. Enter Client ID and Client Secret
5. Test the connection

- [ ] **Step 3: Configure Email OTP**

1. In the same Authentication settings
2. Select "One-time PIN"
3. This is built-in — no external config needed

- [ ] **Step 4: Configure Apple Sign-In (Generic OIDC)**

1. Add new login method → Generic OIDC
2. Name: "Apple"
3. App ID: your Apple Services ID
4. Client Secret: generated JWT from Apple Developer portal
5. Auth URL: `https://appleid.apple.com/auth/authorize`
6. Token URL: `https://appleid.apple.com/auth/token`
7. JWKS URL: `https://appleid.apple.com/auth/keys`

Note: Apple setup requires an Apple Developer account ($99/year). Can be deferred — Google + Email OTP work immediately.

- [ ] **Step 5: Create Access policy**

1. Go to Access → Applications → your app → Policies
2. Create policy: "Allow authenticated users"
3. Action: Allow
4. Include: Everyone (any authenticated user)

- [ ] **Step 6: Verify production deployment**

Run: `bunx wrangler deploy`

Then visit `https://iris.yinflow.life` — should redirect to Cloudflare Access login page.

- [ ] **Step 7: Test end-to-end**

1. Log in with Google
2. Open browser dev tools → Network → check that `Cf-Access-Jwt-Assertion` header is present
3. `GET /me` should return your user profile
4. Create a mandala → verify it works with per-user DO routing
5. Open incognito → log in with a different account → verify separate DO (different data)

---

## Chunk 2: Testing & Verification

### Task 10: Run full verification

**Files:**
- All modified files

- [ ] **Step 1: Run lint**

Run: `bun run lint`
Expected: PASS (fix any new issues)

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Run unit tests**

Run: `bun run test`
Expected: All tests PASS including new auth tests

- [ ] **Step 4: Run full verify**

Run: `bun run verify`
Expected: lint + typecheck + tests all PASS

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -u  # only tracked files — never use git add -A
git commit -m "fix: address lint/type issues from auth integration"
```
