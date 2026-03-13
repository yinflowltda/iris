# Phase 4: Federated Learning with Encryption — Design Spec

**Date:** 2026-03-13
**Status:** Design
**Parent doc:** `docs/plans/2026-03-12-neuro-symbolic-federated-learning.md`

## Overview

Phase 4 adds federated learning to Prisma so that collective intelligence improves the model without individual data leaving the browser. Every transmitted byte is CKKS-encrypted; the aggregation server operates only on ciphertext.

This phase is decomposed into **5 sub-projects**, each designed to be built in its own Claude Code session/worktree. They follow a strict dependency order.

## Sub-Project Dependency Graph

```
SP1: CKKS Encryption (browser WASM)
  ↓
SP2: Differential Privacy (gradient clipping + noise)
  ↓
SP3: Aggregation DO + R2 (server-side FL coordination)
  ↓
SP4: FFA-LoRA Training + FL Client (browser LoRA + round participation)
  ↓
SP5: Consent UI + Monitoring (user-facing + observability)
```

---

## SP1: CKKS Encryption (Browser WASM)

**Goal:** Provide a browser-side API to encrypt/decrypt Float32Array vectors using CKKS homomorphic encryption, compiled to WASM.

**Scope:**
- Build or vendor OpenFHE's BFV/CKKS module as a WASM binary
- Wrap in a Web Worker (`client/lib/prisma/ckks-worker.ts`) to avoid blocking UI
- Expose a clean async API: `encrypt(vectors) → ciphertexts`, `decrypt(ciphertexts) → vectors`, `add(ct1, ct2) → ct`
- Key generation: `generateKeyPair() → { publicKey, secretKey }`
- Slot count: 4096 floats per ciphertext
- Target: encryption of ~144K floats in <3 seconds

**Key files:**
- `client/lib/prisma/ckks-worker.ts` — Web Worker running OpenFHE WASM
- `client/lib/prisma/ckks-service.ts` — async API wrapper (like embedding-service.ts pattern)
- `client/lib/prisma/ckks-types.ts` — TypeScript interfaces for ciphertexts, keys
- `vendor/openfhe-wasm/` — compiled WASM binary + JS glue

**Testing:**
- Unit: encrypt → decrypt roundtrip preserves values (within CKKS approximation tolerance)
- Unit: homomorphic add of two encrypted vectors ≈ plaintext sum
- Unit: slot packing/unpacking for vectors > 4096 elements
- Perf: encryption of 144K floats completes in <5s on mid-range hardware

**Acceptance criteria:**
- `CkksService.encrypt(Float32Array)` returns serializable ciphertext blobs
- `CkksService.decrypt(blobs)` recovers original within ε < 1e-4
- `CkksService.add(blobA, blobB)` returns encrypted sum
- All operations run in Web Worker (non-blocking)
- WASM binary < 5MB gzipped

**Open questions:**
- OpenFHE WASM vs. building from Lattigo (Go→WASM) vs. SEAL (Microsoft) — recommend OpenFHE for maturity
- Whether to use pre-built WASM from `openfhe-wasm` npm or compile from source

---

## SP2: Differential Privacy

**Goal:** Add DP noise injection to weight deltas before encryption.

**Scope:**
- Per-parameter gradient clipping (L2 norm bound C)
- Gaussian noise addition (σ calibrated for target ε)
- Privacy budget accounting (track cumulative ε across rounds)
- Pure TypeScript, no external deps

**Key files:**
- `client/lib/prisma/differential-privacy.ts` — clip + noise functions
- `client/lib/prisma/privacy-accountant.ts` — ε budget tracking (Rényi DP)

**Testing:**
- Unit: clipped delta has L2 norm ≤ C
- Unit: noised delta has expected variance σ²
- Unit: privacy accountant accumulates ε correctly across rounds
- Statistical: noise distribution passes Kolmogorov-Smirnov test for Gaussian

**Acceptance criteria:**
- `clipAndNoise(delta, C, σ)` returns DP-protected delta
- Privacy accountant warns when budget approaches threshold
- Composable with SP1's encryption (clip+noise first, then encrypt)

---

## SP3: Aggregation DO + R2

**Goal:** Server-side FL coordination — manage rounds, collect encrypted deltas, aggregate homomorphically, store checkpoints.

**Scope:**
- Aggregation Durable Object (one per Map + one global for encoder)
- Round lifecycle: open → collecting → aggregating → published
- Homomorphic addition over CKKS ciphertexts (server-side, using same WASM or native)
- R2 storage for encrypted checkpoints and round metadata
- Byzantine defense: reject obviously invalid submissions (norm heuristics on metadata)
- WebSocket or polling for round notifications

**Key files:**
- `server/durable-objects/AggregationDO.ts` — round coordination + aggregation
- `server/routes/fl-rounds.ts` — HTTP endpoints for round participation
- `server/lib/r2-checkpoints.ts` — R2 read/write for encrypted models

**Testing:**
- Unit: round state machine transitions correctly
- Unit: homomorphic aggregation of K mock ciphertexts
- Integration: full round with 3 simulated clients
- Edge: round timeout when < K clients participate

**Acceptance criteria:**
- DO manages complete round lifecycle
- Encrypted aggregate stored in R2 after each round
- Clients can poll for new round availability
- DO never possesses secret key material

---

## SP4: FFA-LoRA Training + FL Client

**Goal:** Add LoRA-B adapter training to the local trainer and implement the FL client protocol (pull → train → clip → encrypt → upload → receive).

**Scope:**
- FFA-LoRA: freeze A matrix (random), train only B matrix (9.2K params)
- Integrate LoRA-B into existing local-trainer.ts training loop
- FL client: orchestrate round participation (pull aggregate, train, submit delta)
- Delta computation: new_weights - received_weights
- Wire SP1 (CKKS) + SP2 (DP) + SP3 (Aggregation DO) together

**Key files:**
- `client/lib/prisma/lora-adapter.ts` — LoRA-B forward/backward
- `client/lib/prisma/fl-client.ts` — FL round participation orchestrator
- `client/lib/prisma/local-trainer.ts` — modified to support LoRA + FL deltas

**Testing:**
- Unit: LoRA-B forward produces correct output dimensions
- Unit: delta computation is correct (new - old)
- Integration: full FL round with mock aggregation
- E2E: 3 browser instances train and converge

**Acceptance criteria:**
- Local training works with LoRA-B adapter
- FL client completes a full round: pull → train → clip+noise → encrypt → upload
- After aggregation, client decrypts and applies updated weights
- Model quality improves after FL rounds (measured on held-out examples)

---

## SP5: Consent UI + Monitoring

**Goal:** User-facing opt-in/out for FL participation, plus observability for round health.

**Scope:**
- Settings panel toggle for FL participation
- GDPR-compliant explicit consent for EU users
- Nudged opt-in for free tier (with clear explanation)
- Round metrics dashboard (admin): participation rate, convergence, round duration
- Client-side telemetry: round participation count, local training loss

**Key files:**
- `client/components/FLConsentToggle.tsx` — settings UI
- `client/lib/prisma/fl-telemetry.ts` — client metrics
- `server/routes/fl-metrics.ts` — admin dashboard data

**Testing:**
- Unit: consent state persists across sessions
- Unit: EU users see explicit opt-in (not nudged)
- Integration: toggling off prevents FL round participation

**Acceptance criteria:**
- Users can opt in/out from settings
- EU compliance: explicit consent required
- Admin can view round health metrics
- No FL traffic when user opts out

---

## Implementation Strategy

Each sub-project follows the cycle: **worktree → implement → test → PR → merge → next**.

Estimated session count:
- SP1 (CKKS): 2-3 sessions (WASM build is the hardest part)
- SP2 (DP): 1 session
- SP3 (Aggregation DO): 2 sessions
- SP4 (LoRA + FL Client): 2 sessions
- SP5 (Consent + Monitoring): 1 session

Total: ~8-10 Claude Code sessions across ~5 PRs.

## Privacy Posture

After Phase 4: "Every byte that leaves your device is encrypted. The server computes on ciphertext. Only your device can decrypt. Privacy enforced by mathematics."

Defense stack:
1. Data stays local (FL — no raw data transmitted)
2. LoRA reduces exposed surface (only B matrix)
3. Differential privacy bounds information leakage
4. CKKS encryption prevents aggregator from seeing individual updates
5. All parameters encrypted equally (no selective encryption)
