# FL End-to-End Integration Design

**Date:** 2026-03-14
**Status:** Approved
**Depends on:** Phase 4 SP1–SP5 (all complete on `worktree-lora-fl-client`)

## Problem

Phase 4 built all FL building blocks (CKKS encryption, differential privacy, Aggregation DO, LoRA adapter, FL client, consent UI) but they exist in isolation. No code path connects local training to FL round participation. Three pieces are missing:

1. The AggregationDO collects encrypted submissions but doesn't compute the homomorphic sum
2. The LocalPrismaTrainer doesn't use LoRA and doesn't trigger FL after training
3. No orchestration connects training completion → FL submission → aggregate application

## Design

Four integration pieces, ordered by dependency:

### Piece 1: DO-Internal CKKS Aggregator

The AggregationDO gains the ability to perform CKKS homomorphic addition internally using node-seal WASM. No external aggregator process needed.

**Viability confirmed:** WASM works in Durable Objects (same V8 runtime as Workers). Memory budget: ~25-30 MB peak vs 128 MB limit. CPU budget: ~10-15s vs 60s configured limit.

**CKKS parameter sharing:** The DO's `seal-aggregator.ts` initializes node-seal with the same parameters as the client (`polyModulusDegree = 8192`, `coeffModBitSizes = [60, 40, 40, 60]`). These constants are extracted into `shared/constants/ckks-params.ts` so client and server import from the same source. The DO creates only a SEALContext + Evaluator (no KeyGenerator, Encryptor, or Decryptor — it never handles plaintext). Uses `evaluator.addInplace(runningSum, nextCt)` for accumulation.

**`performAggregation()` method:**
1. Initialize node-seal WASM lazily (cached on DO instance after first use)
2. For each blob index `i` (0 to `blobsPerSubmission - 1`):
   - Load blob-i from first client from R2 → this is the running sum
   - For each subsequent client: load their blob-i from R2, `addInplace()` into running sum, `.delete()` the loaded ciphertext
   - Serialize running sum to base64, store at `rounds/{roundId}/aggregate/blob-{i}`
   - `.delete()` the running sum ciphertext
3. Transition round to `published`, record round history
4. Clean up submission blobs from R2 (delete `rounds/{roundId}/submissions/` after aggregate is stored)

**Key constraint:** Sequential blob processing — never more than 2-3 ciphertexts in memory at once.

**Aggregation triggers:**
- **Immediate (non-blocking):** When `submissionCount >= minSubmissions` during `handleSubmit()`, transition to `aggregating`, return the response immediately, then schedule aggregation via `ctx.waitUntil(this.performAggregation())`. This decouples the submitting client from aggregation latency (~10-15s).
- **Alarm-based:** Round alarm fires 7 days after opening. If enough submissions → aggregate. If not → re-arm for another 7 days (max 3 extensions = ~28 days, then `timed_out`). Extension count tracked via `extensionCount` field on `FLRound`.

**`/fl/rounds/aggregate-now` endpoint:** Manual trigger for admin use or future cron. If round is in `collecting` with enough submissions, transitions to `aggregating` and runs `performAggregation()`.

**wrangler.toml changes:**
- `compatibility_flags = ["enable_weak_ref"]` — FinalizationRegistry for WASM memory cleanup
- `limits = { cpu_ms = 60_000 }` — 60s CPU budget

**WASM loading:** node-seal runs synchronously in the DO (no Web Worker sub-threads available). The `_seal` instance is stored on the DO class and reused across rounds while the DO stays warm.

### Piece 2: LoRA-Aware Training in LocalPrismaTrainer

The trainer gains optional LoRA mode controlled by FL consent state.

**Activation:**
- `useLocalTrainer` checks `getFLConsent().isOptedIn` on initialization and subscribes to consent changes
- Opted in → `trainer.enableLora()` creates a `LoraAdapter` wrapping the existing `ProjectionHead`
- Opted out → `trainer.disableLora({ mergeWeights: true })` merges LoRA knowledge back into base weights (`W1_new = W1 + B1*A1`, `W2_new = W2 + B2*A2`) before discarding the adapter. This prevents knowledge loss on opt-out.

**Training change:**
- When LoRA is enabled, `train()` calls `loraAdapter.forward()` / `loraAdapter.backward()` instead of `projectionHead.forward()` / `projectionHead.backward()`
- ProjectionHead weights stay frozen — only B1 (2,304 params) and B2 (6,912 params) update
- Anchor training is unaffected (anchors are separate from the projection head)
- Edge predictor training is unaffected

**Persistence:**
- `trainer.serialize()` includes LoRA B-matrix state when active
- `trainer.restore()` re-enables LoRA if the serialized state contained it
- Stored in existing IndexedDB slot alongside projection head weights and anchors

**What stays the same:** Training trigger (5 placements, 3s debounce), training data (placements + arrows), training steps (10), anchor updates, edge predictor.

### Piece 3: FL Orchestrator Hook (`useFLOrchestrator`)

A React hook in App.tsx that bridges training completion to FL participation. Lives alongside `useLocalTrainer`.

**Prerequisite:** `useLocalTrainer` must be mounted in the component tree. Currently it exists but is not wired into App.tsx — this integration is included in this spec's scope.

**Inputs:** `LocalPrismaTrainer` instance, map ID, stable client ID (generated once, stored in localStorage).

**CKKS key persistence:** The orchestrator ensures CKKS keys are generated once and persisted to IndexedDB via `CkksService`. On subsequent page loads, keys are restored from IndexedDB rather than regenerated. This is required for `decryptVector()` to work across sessions.

**Lifecycle on training completion:**
1. Check consent → bail if not opted in
2. `GET /fl/rounds/status`:
   - No round exists → `POST /fl/rounds/open` (client-initiated), then submit delta
   - Round `collecting` → submit delta
   - Round `published` → apply aggregate, then open new round and submit delta
   - Round `aggregating` or `timed_out` → skip, try next time
3. Submit: `flClient.submitDelta(adapter, beforeSnapshot, numExamples)`

**Concurrency guard:** A `_submitting` flag prevents concurrent `submitDelta()` calls. If training fires while a previous FL submission is in-flight (encrypting/uploading), the new training result is saved locally but FL submission is skipped for that round.

**Snapshot timing:**
- Hook calls `flClient.snapshotParams(loraAdapter)` before `trainer.train()` starts
- After training completes, calls `submitDelta()` with the before-snapshot
- The hook wraps the training trigger — interposes between the debounce callback and `train()`

**Aggregate application:**
- After submitting, sets `awaitingAggregate = true`
- On each subsequent training completion, if awaiting, checks round status
- If `published` → calls `flClient.applyAggregate(adapter)` → clears flag
- No dedicated polling timer — piggybacks on training events

**FLClient instantiation:**
- Created once per map, stored in a ref
- Config: `apiBase` from env, `mapId`, `clientId` from localStorage

**Error handling:**
- All FL operations wrapped in try/catch — FL failures never block local training
- Errors surface via `console.warn` and FLClient's `status`/`error` fields
- Budget exhaustion silently stops participation (visible in settings panel stats)

### Piece 4: Alarm-Based Round Lifecycle

Replaces the current 5-minute timeout with a weekly cycle suited to pre-production traffic.

**Round opening:** Client-initiated. After training, if no active round exists, the client calls `POST /fl/rounds/open`. The DO's existing 409 duplicate check prevents race conditions.

**Alarm policy:**
- Round opens → alarm set to 7 days
- Alarm fires:
  - If `submissionCount >= minSubmissions` → `performAggregation()`
  - If not enough → re-arm for another 7 days (increment `extensionCount`)
  - Max 3 extensions (~28 days total), then `timed_out`
- If `minSubmissions` reached during `handleSubmit()` → aggregate immediately via `ctx.waitUntil()` (don't wait for alarm)

**No external cron needed.** The DO's built-in alarm mechanism handles the weekly cadence. The `/fl/rounds/aggregate-now` endpoint exists for manual admin triggering.

## Cleanup

- Remove `'open'` from `RoundStatus` union type in `shared/types/FLRound.ts` — it is dead code (the DO creates rounds directly in `'collecting'` state and no code path sets `'open'`). Update the FL client's status check accordingly.

## Files to Create

| File | Purpose |
|------|---------|
| `client/lib/prisma/use-fl-orchestrator.ts` | React hook bridging training → FL |
| `worker/lib/seal-aggregator.ts` | WASM CKKS aggregation logic (used by AggregationDO) |
| `shared/constants/ckks-params.ts` | Shared CKKS parameter constants (polyModulusDegree, coeffModBitSizes) |
| `tests/unit/prisma/seal-aggregator.test.ts` | Aggregator unit tests |
| `tests/unit/prisma/use-fl-orchestrator.test.ts` | Orchestrator hook unit tests |

## Files to Modify

| File | Change |
|------|--------|
| `worker/do/AggregationDO.ts` | Add `performAggregation()`, update alarm to 7-day cycle, add `/aggregate-now` endpoint, R2 cleanup |
| `client/lib/prisma/local-trainer.ts` | Add `enableLora()` / `disableLora({ mergeWeights })`, conditional forward/backward routing, LoRA serialization |
| `client/lib/prisma/use-local-trainer.ts` | Consent-aware LoRA activation, expose training callback for orchestrator |
| `client/lib/prisma/ckks-service.ts` | Import CKKS params from shared constants; add IndexedDB key persistence |
| `client/lib/prisma/ckks-worker.ts` | Import CKKS params from shared constants |
| `client/lib/prisma/fl-client.ts` | Remove dead `'open'` status check |
| `client/App.tsx` | Mount `useLocalTrainer`, add `useFLOrchestrator` hook |
| `worker/routes/fl-rounds.ts` | Add `aggregateNow` route handler |
| `worker/worker.ts` | Register `/fl/rounds/aggregate-now` route |
| `shared/types/FLRound.ts` | Remove `'open'` from `RoundStatus`, add `extensionCount` to `FLRound` |
| `wrangler.toml` | Add `compatibility_flags`, `limits.cpu_ms` |
| `tests/unit/aggregation-do.test.ts` | Add `performAggregation()` and alarm extension tests |
| `tests/unit/prisma/local-trainer.test.ts` | Add LoRA mode enable/disable and serialization tests |

## Testing Strategy

**Unit tests:**
- `seal-aggregator.test.ts`: CKKS addition of mock ciphertexts, sequential processing, memory cleanup
- `local-trainer.test.ts`: LoRA mode enable/disable, training routes through adapter, serialization round-trip, merge-on-disable
- `use-fl-orchestrator.test.ts`: Consent gating, round status branching, snapshot timing, error isolation, concurrency guard
- `aggregation-do.test.ts`: Full lifecycle through `published` with simulated aggregation, alarm extension logic, R2 cleanup

**Integration tests:**
- FL client + consent: submit blocked when opted out, succeeds when opted in (already exists)

**Manual browser verification:**
- Place 5+ notes → training fires → check Network tab for `/fl/rounds/status` and `/fl/rounds/open` requests (only when opted in)
- Toggle FL off → place more notes → confirm zero FL network requests
- Verify LoRA activation: console `trainer._loraAdapter` should be non-null when opted in

## Non-Goals

- Server-side cron (unnecessary — alarm handles the weekly cycle)
- KV map ID tracking (unnecessary without cron)
- Automatic aggregate polling timer (piggybacks on training events instead)
- UI for round status or aggregate progress (settings panel stats are sufficient for now)
- Authentication on `/aggregate-now` (pre-production; can add bearer token later)
