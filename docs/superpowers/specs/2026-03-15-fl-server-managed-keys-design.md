# FL Server-Managed CKKS Keys — Design & Results

**Date:** 2026-03-15
**Status:** Implemented & Verified on Production
**Builds on:** FL End-to-End Integration (2026-03-14)

## Problem

CKKS homomorphic addition only produces valid results when all ciphertexts are encrypted under the **same public key**. The original design had each browser generating independent CKKS keypairs. When the AggregationDO performed `evaluator.addInplace()` on differently-keyed ciphertexts, decryption produced garbage values (~1e+31, NaN).

This was discovered during the browser FL simulation when we compared decrypted aggregate values against expected sums.

## Solution: Server-Managed Keys

The AggregationDO generates and manages one CKKS keypair per map (per DO instance):

```
Browser A ──┐                              ┌── Browser A
Browser B ──┤  encrypted ciphertexts       │   applies plaintext
            ▼                              │   delta to LoRA
    ┌────────────────┐                     │
    │ AggregationDO  │                     │
    │                │                     │
    │  1. Generate   │ ← keypair per map   │
    │     keypair    │   (stored in R2)    │
    │                │                     │
    │  2. Serve      │ → GET /fl/keys      │
    │     public key │                     │
    │                │                     │
    │  3. Aggregate  │ ← addInplace        │
    │     ciphertexts│   (homomorphic)     │
    │                │                     │
    │  4. Decrypt    │ → plaintext.json    │
    │     aggregate  │   (to R2)           │
    │                │                     │
    │  5. Serve      │ → GET /fl/rounds/   │
    │     plaintext  │   aggregate ────────┘
    └────────────────┘
```

### Key Design Decisions

1. **Server holds both keys**: The server can theoretically decrypt individual submissions, but DP noise (ε=1, σ=4.8448) protects individual data. The CKKS encryption provides defense-in-depth against log/storage breaches.

2. **Keys stored in R2, not DO storage**: Serialized CKKS keys are ~929 KB, exceeding DO storage's 128 KB value limit. R2 path: `keys/{DO-id}/ckks-keypair.json`.

3. **Plaintext aggregate**: The server decrypts the aggregate and publishes plaintext values. Clients no longer need CKKS decryption capability — they only encrypt. This simplifies the client and removes the need for clients to have secret keys.

4. **One keypair per map, not per round**: Keys are stable across rounds. Generated on first `GET /fl/keys` or first `POST /fl/rounds/open`.

## Changes Made

### Server Side

| File | Change |
|---|---|
| `worker/lib/seal-aggregator.ts` | Added `generateKeys()`, `loadSecretKey()`, `decryptBlobs()`, `CKKSEncoder` |
| `worker/do/AggregationDO.ts` | Added `/keys` endpoint, `ensureKeys()` with R2 storage, decrypt-after-aggregate flow |
| `worker/routes/fl-rounds.ts` | Added `getPublicKey()` route handler |
| `worker/worker.ts` | Registered `GET /fl/keys` route |

### Client Side

| File | Change |
|---|---|
| `client/lib/prisma/ckks-types.ts` | Added `loadPublicKey` worker message types |
| `client/lib/prisma/ckks-worker.ts` | Added `loadPublicKey()` handler (encrypt-only, no decryptor) |
| `client/lib/prisma/ckks-service.ts` | Added `loadPublicKey()` method, new response handlers |
| `client/lib/prisma/use-fl-orchestrator.ts` | Fetches public key from server instead of local key generation |
| `client/lib/prisma/fl-client.ts` | `applyAggregate()` receives plaintext values instead of encrypted blobs |

## Production Verification

### Deterministic Test (Known Values)

Submitted known deltas to verify exact correctness:

| Index | Client A | Client B | Expected Sum | Server Returned | Error |
|---|---|---|---|---|---|
| `[0]` | 1.0 | 10.0 | **11.0** | 11.0000000016 | 1.6e-9 |
| `[1]` | 2.0 | 20.0 | **22.0** | 22.0000000001 | 1e-10 |
| `[2]` | 3.0 | 30.0 | **33.0** | 32.9999999997 | 3e-10 |
| `[100]` | -5.5 | 4.5 | **-1.0** | -1.0000000036 | 3.6e-9 |
| `[5000]` | 7.77 | -2.33 | **5.44** | 5.4400000013 | 1.3e-9 |
| `[9215]` | 0.0 | 0.0 | **0.0** | 0.0000000012 | 1.2e-9 |

**Max error across all 9,216 values: 1.223e-8**

### Full Simulation (Realistic DP-Noised Deltas)

| Property | Value |
|---|---|
| Clients | 2 (independent training, server-managed public key) |
| LoRA params | 9,216 (FFA-LoRA: B1=128×18, B2=384×18, rank=18) |
| CKKS blobs per client | 3 (9216 params / 4096 slots) |
| Encrypted payload per client | ~971 KB |
| DP params | ε=1, δ=1e-5, σ=4.8448, clip C=1.0 |
| Server aggregation + decrypt | ~3,000 ms |
| Max decryption error | 1.907e-6 |

**Plaintext aggregate statistics (9,216 real values):**

| Stat | Value |
|---|---|
| Min | -24.065 |
| Max | +29.300 |
| Mean | -0.031 (near zero — DP noise cancels) |
| Stdev | 6.795 |
| Median | +0.006 |

**Padding values (indices 9216–12287, CKKS slot zero-fill):**
- Max absolute: 1.02e-8
- Mean: 3.63e-12

### Sample Plaintext Aggregate Values

First 15 values from the published aggregate (sum of 2 clients' DP-noised LoRA B-matrix deltas):

```
[   0] +0.73424056    [   5] +5.99300957    [  10] +2.71363270
[   1] -4.24804834    [   6] -3.95047367    [  11] +2.16628551
[   2] -4.62824142    [   7] +15.43874359   [  12] -8.84222627
[   3] +1.82751036    [   8] +3.51601912    [  13] +4.18224049
[   4] +6.45570993    [   9] +6.04281390    [  14] +7.04723144
```

### API Responses (Live Production)

**`GET /fl/keys?mapId=report-demo-1773517351`**
```json
{
  "publicKey": "XqEQBAECAADRFwcA... (619,336 chars base64, ~453 KB)"
}
```

**`GET /fl/rounds/status?mapId=report-demo-1773517351`**
```json
{
  "id": "4122bb0e-3122-4e6f-b4fa-dfd30d580d40",
  "status": "published",
  "submissionCount": 2,
  "minSubmissions": 2,
  "expiresAt": "2026-03-21T19:42:32.833Z",
  "hasAggregate": true
}
```

**`GET /fl/rounds/aggregate?mapId=report-demo-1773517351`**
```json
{
  "roundId": "4122bb0e-3122-4e6f-b4fa-dfd30d580d40",
  "values": [11.0000000016, 22.0000000001, 32.9999999997, ...],
  "submissionCount": 2
}
```

**`GET /fl/rounds/metrics?mapId=report-demo-1773517351`**
```json
{
  "currentRound": {
    "id": "4122bb0e-3122-4e6f-b4fa-dfd30d580d40",
    "status": "published",
    "submissionCount": 2,
    "minSubmissions": 2,
    "expiresAt": "2026-03-21T19:42:32.833Z",
    "hasAggregate": true
  },
  "totalRoundsCompleted": 2,
  "avgSubmissionsPerRound": 2,
  "avgRoundDurationMs": 2960
}
```

## Simulation Test Script

`tests/browser-fl-simulation.mjs` — comprehensive E2E test that can run against any deployment:

```bash
node --experimental-wasm-exnref tests/browser-fl-simulation.mjs [base-url]
```

Default target: `https://iris.yinflow.life`

The script simulates 2 browser clients performing the complete FL pipeline:
1. CKKS initialization (node-seal WASM)
2. Fetch server public key (`GET /fl/keys`)
3. Simulate LoRA SGD training (9,216 FFA-LoRA params)
4. Differential privacy (L2 clip + Gaussian noise)
5. CKKS multi-blob encryption (3 blobs × 4096 slots)
6. Open FL round
7. Submit encrypted deltas from both clients
8. Server-side homomorphic aggregation + decryption
9. Download plaintext aggregate
10. Apply to both clients' models and verify correctness
11. Check round metrics

## Bugs Discovered & Fixed

### 1. CKKS Key Independence (Critical)
- **Symptom**: Decrypted aggregate values were ~1e+31 or NaN
- **Root cause**: Each client generated independent keys; homomorphic addition of differently-keyed ciphertexts is undefined
- **Fix**: Server-managed shared keypair per map

### 2. DO Storage 128KB Limit
- **Symptom**: `Values cannot be larger than 131072 bytes. A value of size 929471 was provided.`
- **Root cause**: CKKS keypair (~929 KB) exceeds Durable Object storage value limit
- **Fix**: Store keys in R2 instead of DO storage

### 3. node-seal v7 API Differences
- `ct.load()` → `ct.loadFromBase64(context, b64)`
- `decryptor.decrypt(ct)` → `decryptor.decrypt(ct, outputPlain)` (pre-allocate)
- `encoder.decode()` → `encoder.decodeFloat64(plain)`

### 4. Single-Blob Truncation
- **Symptom**: Only first 4096 of 9216 params encrypted; values at index 5000+ were NaN
- **Fix**: Multi-blob encryption (3 blobs for 9216 params / 4096 slots)

### 5. Emscripten Node Detection in Workers
- **Symptom**: `Error: No such module "node:fs"` in Cloudflare Workers
- **Root cause**: Emscripten detects `ENVIRONMENT_IS_NODE=true` due to `nodejs_compat` flag
- **Fix**: Vite plugin patches `ENVIRONMENT_IS_NODE=false` + `instantiateWasm` callback + exclude from worker pre-bundling
