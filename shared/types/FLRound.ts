// ─── Federated Learning Round Types ─────────────────────────────────────────

/** Round lifecycle states */
export type RoundStatus = 'collecting' | 'aggregating' | 'published' | 'timed_out'

/** Metadata for a single FL round */
export interface FLRound {
	id: string
	status: RoundStatus
	/** Minimum submissions required before aggregation */
	minSubmissions: number
	/** Submissions received so far */
	submissionCount: number
	/** Client IDs that have submitted */
	submittedClients: string[]
	/** ISO timestamp when the round was opened */
	openedAt: string
	/** ISO timestamp when the round closes (timeout) */
	expiresAt: string
	/** R2 key for the aggregated result (set after aggregation) */
	aggregateKey: string | null
	/** Number of ciphertext blobs per submission (all must match) */
	blobsPerSubmission: number | null
}

/** Client submission of encrypted weight deltas */
export interface FLSubmission {
	clientId: string
	roundId: string
	/** Base64-encoded CKKS ciphertext blobs */
	blobs: string[]
	/** Number of training examples this delta was computed from */
	numExamples: number
	/** L2 norm of the delta before encryption (for Byzantine checks) */
	reportedNorm: number
}

/** Summary returned to clients */
export interface FLRoundSummary {
	id: string
	status: RoundStatus
	submissionCount: number
	minSubmissions: number
	expiresAt: string
	hasAggregate: boolean
}

/** Response when opening a new round */
export interface FLOpenRoundResponse {
	roundId: string
	minSubmissions: number
	expiresAt: string
}

/** Response when submitting a delta */
export interface FLSubmitResponse {
	accepted: boolean
	submissionCount: number
	roundStatus: RoundStatus
}
