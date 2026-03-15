// ─── FL Transport Interface ──────────────────────────────────────────────────
//
// Abstraction over the FL coordination layer. The current implementation uses
// Cloudflare Workers + Durable Objects. Future implementations could use
// blockchain smart contracts + IPFS for trustless multi-org federation.

import type { FLRoundSummary, FLSubmitResponse, FLOpenRoundResponse, FLSubmission } from './FLRound'

/** Plaintext aggregate returned after server-side CKKS decryption */
export interface FLAggregateResult {
	roundId: string
	values: number[]
	submissionCount: number
}

/**
 * Transport layer for Federated Learning round coordination.
 *
 * Implementations handle key distribution, round lifecycle, submission
 * transport, and aggregate retrieval. All CKKS encryption, DP noise,
 * and LoRA logic stays on the client — the transport only moves data.
 *
 * Current: CloudflareFLTransport (Durable Objects + R2)
 * Future:  BlockchainFLTransport (smart contracts + IPFS/Arweave)
 */
export interface FLTransport {
	/** Fetch the CKKS public key for encrypting submissions */
	getPublicKey(mapId: string): Promise<string>

	/** Open a new FL round for collecting submissions */
	openRound(mapId: string): Promise<FLOpenRoundResponse>

	/** Submit encrypted weight deltas to the current round */
	submitDelta(mapId: string, submission: FLSubmission): Promise<FLSubmitResponse>

	/** Get the current round status for a map */
	getRoundStatus(mapId: string): Promise<FLRoundSummary | null>

	/** Download the aggregated result (plaintext values after server decryption) */
	getAggregate(mapId: string): Promise<FLAggregateResult | null>
}
