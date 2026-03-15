# FL Multi-Org Blockchain Migration — Design & Strategy

**Date:** 2026-03-15
**Status:** Architecture Decision — Transport Interface Implemented
**Builds on:** FL Server-Managed CKKS Keys (2026-03-15)

## Problem

The current FL architecture trusts a single server (Yinflow's Cloudflare Workers) to hold the CKKS secret key, coordinate rounds, and produce honest aggregates. This is fine for a single organization, but breaks down when multiple organizations want to federate:

- **No org will trust another org's server** to hold the secret key
- **No org can verify** that aggregation wasn't tampered with
- **No independent audit trail** for contributions
- **Data sovereignty** requirements vary across organizations

## When to Migrate

The trigger is **the second organization**, not scale:

| Orgs | Architecture | Why |
|---|---|---|
| 1 | Cloudflare ($5/mo flat) | Simple, fast, you trust yourself |
| 2 | Need threshold keys + verifiable aggregation | Neither org trusts the other's server |
| 3+ | Need governance, contribution tracking, audit | Multi-party coordination |

## Solution: FLTransport Abstraction

An `FLTransport` interface separates the coordination layer from the client logic. All CKKS encryption, DP noise, and LoRA training stays on the client — unchanged regardless of backend.

```
┌─────────────────────────────────────────────┐
│                  Client Code                 │
│  (CKKS encrypt, DP noise, LoRA, training)   │
│              NEVER CHANGES                   │
├─────────────────────────────────────────────┤
│              FLTransport Interface           │
│  getPublicKey · openRound · submitDelta     │
│  getRoundStatus · getAggregate              │
├──────────────────┬──────────────────────────┤
│  Cloudflare      │  Blockchain (future)     │
│  Transport       │  Transport               │
│  ─────────────── │  ──────────────────────  │
│  Workers + DO    │  Smart contract + IPFS   │
│  R2 storage      │  Arweave/IPFS storage    │
│  Server keys     │  Threshold decryption    │
│  $5/mo flat      │  Pay-per-contribution    │
└──────────────────┴──────────────────────────┘
```

### Interface Definition

```typescript
// shared/types/FLTransport.ts
interface FLTransport {
  getPublicKey(mapId: string): Promise<string>
  openRound(mapId: string): Promise<FLOpenRoundResponse>
  submitDelta(mapId: string, submission: FLSubmission): Promise<FLSubmitResponse>
  getRoundStatus(mapId: string): Promise<FLRoundSummary | null>
  getAggregate(mapId: string): Promise<FLAggregateResult | null>
}
```

### Current Implementation

`CloudflareFLTransport` wraps HTTP calls to the Worker API. This is the production default.

### Future Blockchain Implementation

`BlockchainFLTransport` would:
- Call smart contract methods instead of HTTP endpoints
- Store encrypted blobs on IPFS/Arweave instead of R2
- Use threshold decryption (Lit Protocol / Shamir) instead of server-held keys
- Provide immutable contribution records on-chain

## Multi-Org Scenarios

### Scenario 1: Federated Consortium

Multiple therapy/coaching platforms pool encrypted gradients to train a shared emotion classification model.

- Each org trains LoRA adapters on their own users' data
- Encrypted deltas go to a shared, trustless aggregation layer
- No org sees another's contributions (CKKS + DP)
- The resulting model improves for everyone
- Example: Yinflow, university psych labs, coaching apps

### Scenario 2: Research Data Commons

Universities and clinics contribute structured emotional assessment data. Encrypted contributions are public — any researcher can train on the aggregate.

- Published on-chain with IPFS storage
- Auditable provenance (institution, timestamp, subject count)
- IRB compliance via DP guarantees (ε=1 provides strong privacy)
- Open science without privacy sacrifice

### Scenario 3: Contribution Marketplace

Organizations contribute and are rewarded proportionally via smart contract.

- Contribution quality verifiable on-chain
- Token-gated model access (contribute to access improved model)
- Proof of contribution without revealing content

## Blockchain Architecture Details

### Key Distribution: Threshold Decryption

Instead of one server holding the secret key, split it across N parties (orgs) using Shamir Secret Sharing:

```
Secret Key → [Share₁, Share₂, Share₃, Share₄, Share₅]
                 Org A    Org B    Org C    Org D    Org E

Decrypt requires 3/5 shares → no single org can decrypt individual submissions
```

Technology options:
- **Lit Protocol**: Decentralized key management, threshold ECDSA/BLS, programmable conditions
- **Shamir Secret Sharing**: Standard cryptographic primitive, self-hosted
- **MPC**: Multi-party computation for joint decryption

### Smart Contract Functions

```solidity
contract FLCoordinator {
    function openRound(bytes32 mapId) external returns (uint256 roundId);
    function submitDelta(uint256 roundId, string[] ipfsCIDs) external;
    function getRoundStatus(uint256 roundId) external view returns (RoundStatus);
    function triggerAggregation(uint256 roundId) external;
    function getAggregate(uint256 roundId) external view returns (string ipfsCID);
}
```

### Storage

| Data | Size | Storage |
|---|---|---|
| Encrypted ciphertext blobs | ~971 KB per client | IPFS (pin with Pinata/Filebase) or Arweave (permanent) |
| Aggregated plaintext | ~72 KB (9216 × float64) | IPFS or on-chain |
| Round metadata | ~200 bytes | On-chain (smart contract state) |
| CKKS public key | ~453 KB | IPFS (referenced by contract) |

### Aggregation: Off-Chain Nodes

Homomorphic addition is too expensive for on-chain execution. Aggregator nodes:
1. Watch for `SubmissionReceived` events
2. Download ciphertexts from IPFS
3. Perform `addInplace` (same SEAL WASM code used today)
4. Submit aggregate + ZK proof to contract
5. Contract verifies and publishes

Multiple aggregator nodes can independently verify each other.

## Cost Comparison (Real Data)

Using actual production payload sizes: ~971 KB encrypted per client, 3 CKKS blobs.

| Scale | Cloudflare | Blockchain + IPFS |
|---|---|---|
| 100 contributions/mo | $5.01 | $0.40 |
| 1,000 contributions/mo | $5.01 | $9.00 |
| 10,000 contributions/mo | $5.01 | $46.33 |
| 100,000 contributions/mo | $5.01 | $419.69 |

**Cloudflare**: flat $5/mo (Workers Paid), negligible R2 at these volumes.
**Blockchain**: L2 tx ≈ $0.003 + IPFS pinning ≈ $0.001/MB/mo. Scales linearly.

## Codebase Impact

### Unchanged (~2,200 lines)

All client-side computation stays identical:

| Component | Files | Lines |
|---|---|---|
| CKKS encryption | `ckks-service.ts`, `ckks-worker.ts`, `ckks-types.ts` | ~400 |
| Differential privacy | `differential-privacy.ts`, `privacy-accountant.ts` | ~200 |
| LoRA adapter | `lora-adapter.ts`, `projection-head.ts` | ~400 |
| FL consent | `fl-consent.ts`, `FLSettingsPanel.tsx` | ~300 |
| Training pipeline | `use-local-trainer.ts`, `training-worker.ts` | ~500 |
| Shared types | `FLRound.ts`, `FLTransport.ts`, `ckks-params.ts` | ~100 |

### Changed (~800 lines)

Only the coordination/transport layer:

| Component | Change | Effort |
|---|---|---|
| `FLTransport` interface | Already implemented | Done |
| `CloudflareFLTransport` | Already implemented | Done |
| `BlockchainFLTransport` | New class (~150 lines) | New |
| Smart contract | Solidity (~200 lines) | New |
| Aggregator node | SEAL WASM + IPFS (~200 lines) | New |
| Threshold key ceremony | Lit Protocol integration (~100 lines) | New |
| Contract deployment | Hardhat/Foundry config (~100 lines) | New |

## Migration Path

### Phase 1: Abstraction Seam (DONE)

- `FLTransport` interface defined in `shared/types/FLTransport.ts`
- `CloudflareFLTransport` implementation in `client/lib/prisma/cloudflare-fl-transport.ts`
- `FLClient` and orchestrator refactored to use transport
- All 24 FL tests pass

### Phase 2: Blockchain Transport (Future)

When the second org is ready:
1. Write `BlockchainFLTransport` implementing the same interface
2. Deploy `FLCoordinator` smart contract
3. Set up IPFS pinning for encrypted blobs
4. Set up threshold key ceremony across participating orgs
5. Run shadow mode (both transports, verify identical results)

### Phase 3: Production Cutover (Future)

1. Verify shadow mode produces identical aggregates
2. Switch primary transport to blockchain
3. Keep Cloudflare as fallback during transition
4. Remove Cloudflare transport when stable

## Privacy Comparison

| Property | Cloudflare (current) | Blockchain (future) |
|---|---|---|
| Server can decrypt individuals | Yes (mitigated by DP) | No (threshold: need 3/5 shares) |
| Aggregation verifiable | Trust Yinflow | Independently verifiable |
| Contribution audit trail | Internal logs | Public, immutable chain |
| Data sovereignty | Yinflow's Cloudflare | Decentralized storage |
| DP guarantees | Same (ε=1, σ=4.8448) | Same (ε=1, σ=4.8448) |
| Signal-to-noise ratio | 0.36% | 0.36% |

## Key Files

| File | Purpose |
|---|---|
| `shared/types/FLTransport.ts` | Transport interface + aggregate result type |
| `client/lib/prisma/cloudflare-fl-transport.ts` | Cloudflare implementation |
| `client/lib/prisma/fl-client.ts` | FL client (uses transport for network calls) |
| `client/lib/prisma/use-fl-orchestrator.ts` | Orchestrator (uses transport for keys + rounds) |
| `docs/superpowers/specs/2026-03-15-fl-server-managed-keys-design.md` | Server-managed keys design |
