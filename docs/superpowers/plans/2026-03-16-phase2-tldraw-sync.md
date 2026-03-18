# Phase 2: tldraw-sync Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace local-only canvas persistence with tldraw-sync server-side persistence via Cloudflare Durable Objects, with auth-gated WebSocket connections.

**Architecture:** A new `TldrawSyncDO` (one per user, keyed by `sub`) extends `TldrawDurableObject` from `@tldraw/sync-cloudflare`. The Worker authenticates WebSocket upgrade requests via the `CF_Authorization` cookie (same auth middleware as Phase 1), checks room ownership, and forwards to the DO. On the client, `useSync` replaces `persistenceKey`. Assets are stored in R2.

**Tech Stack:** `@tldraw/sync` (client), `@tldraw/sync-cloudflare` (worker), R2 (assets), Vitest

**Spec:** `docs/superpowers/specs/2026-03-16-auth-and-tldraw-sync-design.md` — Section 8

**Prerequisite:** Phase 1 must be complete (auth middleware, per-user DO routing, D1 user store).

---

## File Structure

| File | Responsibility |
|---|---|
| **Create:** `worker/do/TldrawSyncDO.ts` | Durable Object extending `TldrawDurableObject` — handles WebSocket sync for one user's canvas |
| **Create:** `worker/routes/sync.ts` | `GET /sync/:roomId` WebSocket upgrade handler — auth gate + ownership check + forward to DO |
| **Create:** `worker/routes/sync-assets.ts` | `POST/GET /sync/assets/:assetId` — R2-backed asset upload/download |
| **Create:** `client/lib/use-auth-sync.ts` | `useAuthSync` hook — wraps `useSync` with auth context (URI from user.sub) |
| **Create:** `client/lib/multiplayer-asset-store.ts` | `multiplayerAssetStore` — tldraw asset store backed by `/sync/assets` R2 routes |
| **Modify:** `worker/worker.ts` | Register sync + asset routes, re-export `TldrawSyncDO` |
| **Modify:** `wrangler.toml` | Add `TLDRAW_SYNC_DO` binding, migration v5, `TLDRAW_BUCKET` R2 binding |
| **Modify:** `worker/environment.ts` | Add `TLDRAW_SYNC_DO` and `TLDRAW_BUCKET` bindings |
| **Modify:** `client/App.tsx` | Replace `persistenceKey` with `useAuthSync` hook, pass `store` to `<Tldraw>` |
| **Modify:** `package.json` | Add `@tldraw/sync` and `@tldraw/sync-cloudflare` dependencies |

---

## Chunk 1: Server-Side Sync

### Task 1: Add tldraw-sync dependencies and update bindings

**Files:**
- Modify: `package.json`
- Modify: `worker/environment.ts`
- Modify: `wrangler.toml`

- [ ] **Step 1: Install tldraw-sync packages**

Run: `bun add @tldraw/sync @tldraw/sync-cloudflare`

Note: `@tldraw/sync-cloudflare` provides `TldrawDurableObject` base class. `@tldraw/sync` provides client-side `useSync` hook. Check that these versions are compatible with the existing `tldraw: ^4.3.1` in package.json — they should match the same major version.

- [ ] **Step 2: Update Environment interface**

Add to `worker/environment.ts`:

```typescript
export interface Environment {
  // ... existing bindings ...
  // tldraw-sync
  TLDRAW_SYNC_DO: DurableObjectNamespace
  TLDRAW_BUCKET: R2Bucket
}
```

- [ ] **Step 3: Update wrangler.toml**

Add new DO binding to the existing `[durable_objects]` bindings array:

```toml
[durable_objects]
bindings = [
    { name = "AGENT_DURABLE_OBJECT", class_name = "AgentDurableObject" },
    { name = "VOICE_AGENT_DO", class_name = "VoiceAgentDurableObject" },
    { name = "AGGREGATION_DO", class_name = "AggregationDO" },
    { name = "TLDRAW_SYNC_DO", class_name = "TldrawSyncDO" },  # ← add
]
```

Add migration v5:

```toml
[[migrations]]
tag = "v5"
new_classes = ["TldrawSyncDO"]
new_sqlite_classes = ["TldrawSyncDO"]  # tldraw-sync uses DO SQLite
```

Add R2 bucket for tldraw assets (after existing `[[r2_buckets]]`):

```toml
[[r2_buckets]]
binding = "TLDRAW_BUCKET"
bucket_name = "iris-tldraw-assets"
```

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: Errors about missing `TldrawSyncDO` class (not yet created). Environment should compile.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lockb worker/environment.ts wrangler.toml
git commit -m "feat(sync): add tldraw-sync deps, DO binding, R2 bucket, migration v5"
```

---

### Task 2: TldrawSyncDO Durable Object

**Files:**
- Create: `worker/do/TldrawSyncDO.ts`

- [ ] **Step 1: Study the tldraw-sync-cloudflare template**

Before writing code, read the `TldrawDurableObject` source from the installed package to understand:
- Constructor signature and required env bindings
- `fetch()` override pattern
- What `createRouter` provides (if anything)
- How `handleSocketConnect` is called

Run: `cat node_modules/@tldraw/sync-cloudflare/src/TldrawDurableObject.ts | head -100` (or read the README/docs)

Reference repo: https://github.com/tldraw/tldraw-sync-cloudflare

- [ ] **Step 2: Create TldrawSyncDO**

```typescript
// worker/do/TldrawSyncDO.ts
import { TldrawDurableObject } from '@tldraw/sync-cloudflare'
import type { Environment } from '../environment'

/**
 * Per-user tldraw canvas sync Durable Object.
 * Extends the official tldraw Cloudflare DO base class.
 * One instance per user, keyed by Cloudflare Access `sub`.
 *
 * The base class handles:
 * - WebSocket connection management
 * - Document sync protocol
 * - SQLite persistence (automatic)
 * - Asset URL resolution
 *
 * TODO (future — sharing): Override handleSocketConnect() to attach
 * user metadata (sub, email) to sessions via the `meta` parameter.
 * Not needed for Phase 1 (single owner per room).
 */
export class TldrawSyncDO extends TldrawDurableObject<Environment> {
  // The base class provides all sync functionality.
  // Override methods only if custom behavior is needed.
  // For Phase 1 (single owner, no sharing), defaults are sufficient.
}
```

Note: The exact constructor and method signatures depend on the `@tldraw/sync-cloudflare` package API. The implementing agent should check the package's type definitions and adjust the class accordingly. The template repo (`tldraw/tldraw-sync-cloudflare`) shows the minimal DO implementation.

- [ ] **Step 3: Re-export from worker.ts**

Add to `worker/worker.ts` at the bottom:

```typescript
export { TldrawSyncDO } from './do/TldrawSyncDO'
```

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS — TldrawSyncDO should compile with the base class

- [ ] **Step 5: Commit**

```bash
git add worker/do/TldrawSyncDO.ts worker/worker.ts
git commit -m "feat(sync): TldrawSyncDO extending tldraw base class"
```

---

### Task 3: WebSocket sync route with auth gate

**Files:**
- Create: `worker/routes/sync.ts`
- Modify: `worker/worker.ts`

- [ ] **Step 1: Create sync route handler**

```typescript
// worker/routes/sync.ts
import type { IRequest } from 'itty-router'
import type { Environment } from '../environment'
import type { AuthUser } from '../lib/auth-types'

/**
 * GET /sync/:roomId — WebSocket upgrade for tldraw-sync.
 *
 * Auth: JWT validated by auth middleware (from CF_Authorization cookie).
 * Authorization: user.sub must match roomId (owner-only in Phase 1).
 * Forward: passes the raw request to TldrawSyncDO.fetch() which handles
 *          the WebSocket upgrade internally.
 */
export async function syncRoom(request: IRequest, env: Environment): Promise<Response> {
  const upgradeHeader = request.headers.get('Upgrade')
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 })
  }

  const user = (request as IRequest & { user: AuthUser }).user
  const roomId = request.params?.roomId

  if (!roomId) {
    return new Response(JSON.stringify({ error: 'Room ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Authorization: owner check (Phase 1 — single room per user)
  if (user.sub !== roomId) {
    return new Response(JSON.stringify({ error: 'Not authorized for this room' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Forward the full request to TldrawSyncDO — it handles the WebSocket upgrade.
  // Must pass the complete Request object to preserve WebSocket upgrade semantics.
  const id = env.TLDRAW_SYNC_DO.idFromName(roomId)
  const stub = env.TLDRAW_SYNC_DO.get(id)

  return stub.fetch(new Request(request.url, request as unknown as Request))
}
```

- [ ] **Step 2: Register route in worker.ts**

Add import and route to `worker/worker.ts`:

```typescript
import { syncRoom } from './routes/sync'

// Add to the router chain (AFTER the auth middleware in the `before` array — already configured by Phase 1).
// This route is NOT in the public routes allowlist, so auth middleware will validate the JWT.
  .get('/sync/:roomId', syncRoom)
```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add worker/routes/sync.ts worker/worker.ts
git commit -m "feat(sync): WebSocket /sync/:roomId route with auth + ownership check"
```

---

### Task 4: Asset upload/download routes

**Files:**
- Create: `worker/routes/sync-assets.ts`
- Modify: `worker/worker.ts`

- [ ] **Step 1: Create asset route handlers**

```typescript
// worker/routes/sync-assets.ts
import type { IRequest } from 'itty-router'
import type { Environment } from '../environment'

/**
 * POST /sync/assets/:assetId — Upload an asset to R2.
 * Auth required (handled by middleware).
 */
export async function uploadAsset(request: IRequest, env: Environment): Promise<Response> {
  const assetId = request.params?.assetId
  if (!assetId) {
    return new Response(JSON.stringify({ error: 'Asset ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const body = await request.arrayBuffer()
  if (!body || body.byteLength === 0) {
    return new Response(JSON.stringify({ error: 'Empty body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const contentType = request.headers.get('Content-Type') || 'application/octet-stream'

  await env.TLDRAW_BUCKET.put(assetId, body, {
    httpMetadata: { contentType },
  })

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * GET /sync/assets/:assetId — Download an asset from R2.
 * Auth required (handled by middleware).
 */
export async function downloadAsset(request: IRequest, env: Environment): Promise<Response> {
  const assetId = request.params?.assetId
  if (!assetId) {
    return new Response(JSON.stringify({ error: 'Asset ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const object = await env.TLDRAW_BUCKET.get(assetId)
  if (!object) {
    return new Response(JSON.stringify({ error: 'Asset not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
```

- [ ] **Step 2: Register routes in worker.ts**

Add import and routes:

```typescript
import { uploadAsset, downloadAsset } from './routes/sync-assets'

// Add to router chain — these are NOT in the public routes allowlist,
// so auth middleware validates the JWT before reaching these handlers.
  .post('/sync/assets/:assetId', uploadAsset)
  .get('/sync/assets/:assetId', downloadAsset)
```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add worker/routes/sync-assets.ts worker/worker.ts
git commit -m "feat(sync): R2-backed asset upload/download routes"
```

---

## Chunk 2: Client-Side Sync

### Task 5: Multiplayer asset store

**Files:**
- Create: `client/lib/multiplayer-asset-store.ts`

- [ ] **Step 1: Create the asset store**

```typescript
// client/lib/multiplayer-asset-store.ts
import type { TLAssetStore } from 'tldraw'

/**
 * tldraw asset store backed by R2 via /sync/assets routes.
 * Handles upload (when user pastes/drops images) and
 * resolve (when rendering assets from the sync store).
 */
export const multiplayerAssetStore: TLAssetStore = {
  async upload(_asset, file) {
    const assetId = crypto.randomUUID()

    const response = await fetch(`/sync/assets/${assetId}`, {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': file.type },
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(`Asset upload failed: ${response.status}`)
    }

    return `/sync/assets/${assetId}`
  },

  resolve(asset) {
    // Assets are stored with their URL pointing to /sync/assets/:id
    // which is already the correct URL for same-origin requests
    return asset.props.src ?? ''
  },
}
```

**Credentials note:** The `resolve` method returns a relative URL (`/sync/assets/:id`). When tldraw renders assets via `<img src="...">`, same-origin cookies are sent automatically. If tldraw uses `fetch()` internally for assets, `credentials: 'include'` may be needed — verify during Task 8 integration testing.

Note: The exact `TLAssetStore` interface may vary by tldraw version. Check the type definitions in the installed `tldraw` package. The `upload` method receives a `TLAsset` and a `File`, and must return a URL string. The `resolve` method receives a `TLAsset` and returns the URL to render.

- [ ] **Step 2: Commit**

```bash
git add client/lib/multiplayer-asset-store.ts
git commit -m "feat(sync): multiplayer asset store backed by R2"
```

---

### Task 6: useAuthSync hook

**Files:**
- Create: `client/lib/use-auth-sync.ts`

- [ ] **Step 1: Create the hook**

```typescript
// client/lib/use-auth-sync.ts
import { useSync } from '@tldraw/sync'
import { multiplayerAssetStore } from './multiplayer-asset-store'

/**
 * Wraps tldraw's useSync with auth context.
 * The user's sub (from GET /me at startup) is used as the room ID.
 * The CF_Authorization cookie is sent automatically on same-origin
 * WebSocket upgrade — no explicit token handling needed.
 */
export function useAuthSync(userSub: string) {
  return useSync({
    // Async function per spec — useSync calls this on each connection attempt.
    // Relative path works for same-origin; useSync upgrades HTTP(S) → WS internally.
    // If relative paths don't work, use: `${window.location.origin}/sync/${userSub}`
    uri: async () => `/sync/${userSub}`,
    assets: multiplayerAssetStore,
  })
}
```

Note: Check the `useSync` return type. It returns a `TLStoreWithStatus` which has `store`, `status`, and `error` fields. The implementing agent should check the `@tldraw/sync` type definitions for the exact API.

- [ ] **Step 2: Commit**

```bash
git add client/lib/use-auth-sync.ts
git commit -m "feat(sync): useAuthSync hook wrapping useSync with auth"
```

---

### Task 7: Replace persistenceKey with useSync in App.tsx

**Files:**
- Modify: `client/App.tsx`

This is the core client migration. It replaces local-only IndexedDB persistence with server-synced state.

- [ ] **Step 1: Import useAuthSync and update Tldraw mount**

In `client/App.tsx`:

1. Add import:
```typescript
import { useAuthSync } from './lib/use-auth-sync'
```

2. Inside the App component, after the `useAuth()` call (added by Phase 1, returns `{ user, loading, error }`), add:
```typescript
const syncStore = useAuthSync(user.sub)
```

3. Replace the `<Tldraw>` component:

```typescript
// Before:
<Tldraw
  persistenceKey="tldraw-agent-demo"
  options={options}
  shapeUtils={shapeUtils}
  tools={tools}
  overrides={overrides}
  components={components}
  textOptions={textOptions}
>

// After:
<Tldraw
  store={syncStore}
  options={options}
  shapeUtils={shapeUtils}
  tools={tools}
  overrides={overrides}
  components={components}
  textOptions={textOptions}
>
```

Note: When passing `store` (a `TLStoreWithStatus`), tldraw handles the loading state internally — showing a spinner while connecting, then rendering the canvas. The `persistenceKey` prop must be removed (cannot use both).

- [ ] **Step 2: Handle sync connection status**

The `useSync` return value includes a `status` field. Optionally add a connection indicator:

```typescript
// After syncStore is created:
if (syncStore.status === 'error') {
  console.error('Sync error:', syncStore.error)
}
```

tldraw shows its own loading UI for `synced-remote` status, so no custom loading screen is needed.

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS — may need to adjust types based on the exact `useSync` return type.

- [ ] **Step 4: Commit**

```bash
git add client/App.tsx
git commit -m "feat(sync): replace persistenceKey with useSync for server-side persistence"
```

---

### Task 8: Agent ↔ sync verification

**Files:**
- No new files — testing and verification

The agent creates shapes via `editor.createShape()` which writes to the tldraw store. With `useSync`, these writes propagate through the sync layer. Custom shapes (MandalaShapeUtil, CircularNoteShapeUtil) must serialize/deserialize correctly through the sync protocol.

- [ ] **Step 1: Start local dev**

Run: `bun run dev`

- [ ] **Step 2: Test basic sync round-trip**

1. Open the app in browser (logged in via dev mode)
2. Create a mandala via the template chooser
3. Add a note via Iris chat
4. Close the browser tab
5. Reopen the app → mandala and note should still be there (loaded from DO, not localStorage)

- [ ] **Step 3: Test custom shape serialization**

1. Create a MandalaShape (the sunburst)
2. Create a CircularNoteShape (a note inside a cell)
3. Refresh the page
4. Both shapes should render correctly with all their custom properties intact

- [ ] **Step 4: Test agent shape creation through sync**

1. Open the app
2. Use Iris chat to trigger agent actions that create/modify shapes
3. Verify the shapes appear on canvas
4. Refresh — shapes persist
5. Open browser dev tools → Network → verify WebSocket messages flowing

- [ ] **Step 5: Test multi-page**

1. Create a new page via tldraw's page menu
2. Add content on the new page
3. Switch back to page 1 → original content intact
4. Refresh → both pages persist

- [ ] **Step 6: Test concurrent agent + user edits**

1. Start Iris agent via chat (triggers shape creation)
2. While agent is streaming, manually drag a note on the canvas
3. Both actions should resolve without conflict (tldraw CRDT handles this)

- [ ] **Step 7: Test user isolation (dev mode)**

Open two browser tabs:
```bash
# Tab 1: default dev user
# Just open the app normally

# Tab 2: different dev user — use a browser extension to set X-Dev-User header,
# or modify the useAuth hook temporarily to pass the header
```

Verify each user has a separate empty canvas. Content from one user should never appear for another.

- [ ] **Step 8: Commit any fixes**

```bash
git add -u
git commit -m "fix(sync): adjustments from agent-sync integration testing"
```

---

## Chunk 3: Verification

### Task 9: Full verification

**Files:**
- All modified files

- [ ] **Step 1: Run lint**

Run: `bun run lint`
Expected: PASS

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Run unit tests**

Run: `bun run test`
Expected: All tests PASS

- [ ] **Step 4: Run full verify**

Run: `bun run verify`
Expected: lint + typecheck + tests all PASS

- [ ] **Step 5: Test local dev end-to-end**

Run: `bun run dev`

1. Open app → should load via sync (no localStorage persistence)
2. Create mandala → add notes → close → reopen → all state persists
3. Upload an image → closes → reopen → image loads from R2
4. Multiple pages work

- [ ] **Step 6: Deploy to production**

Run: `bunx wrangler deploy`

1. Visit `https://iris.yinflow.life`
2. Log in via Google/Apple/Email OTP (Cloudflare Access)
3. Create mandala → verify it persists across sessions
4. Test on a second device with same account → same canvas state

- [ ] **Step 7: Final commit**

```bash
git add -u
git commit -m "chore: phase 2 tldraw-sync integration complete"
```
