// ─── Federated Learning Client ──────────────────────────────────────────────
//
// Orchestrates FL round participation:
//   1. Check round status
//   2. Snapshot LoRA B params before training
//   3. Train locally (handled by caller)
//   4. Compute delta = new_B − snapshot_B
//   5. Clip + Gaussian noise (DP)
//   6. Encrypt via CKKS
//   7. Upload to Aggregation DO
//   8. Download and apply aggregated deltas
//   9. Track cumulative privacy budget

import type { FLRoundSummary, FLSubmitResponse } from '../../../shared/types/FLRound'
import { CkksService } from './ckks-service'
import { clipAndNoise, computeSigma, l2Norm } from './differential-privacy'
import { getFLConsent } from './fl-consent'
import { getFLTelemetry } from './fl-telemetry'
import { PrivacyAccountant, type PrivacyState } from './privacy-accountant'
import type { LoraAdapter } from './lora-adapter'

// ─── Config ────────────────────────────────────────────────────────────────

export interface FLClientConfig {
	/** Base URL for the worker (e.g., https://iris.yinflow.life) */
	apiBase: string
	/** Map ID — each map has its own FL round coordinator */
	mapId: string
	/** Unique client identifier */
	clientId: string
	/** L2 clipping bound for DP. Default: 1.0 */
	maxNorm?: number
	/** Per-round DP epsilon. Default: 1.0 */
	epsilon?: number
	/** DP delta parameter. Default: 1e-5 */
	delta?: number
	/** Noise multiplier for privacy accountant. Default: 1.0 */
	noiseMultiplier?: number
	/** Total privacy budget before blocking participation. Default: 8.0 */
	maxEpsilon?: number
}

export type FLClientStatus =
	| 'idle'
	| 'checking'
	| 'submitting'
	| 'encrypting'
	| 'uploading'
	| 'downloading'
	| 'applying'
	| 'error'

export interface FLRoundResult {
	roundId: string
	deltaL2Norm: number
	privacyState: PrivacyState
	submissionCount: number
}

// ─── FL Client ─────────────────────────────────────────────────────────────

export class FLClient {
	private _apiBase: string
	private _mapId: string
	private _clientId: string
	private _maxNorm: number
	private _epsilon: number
	private _delta: number
	private _accountant: PrivacyAccountant
	private _status: FLClientStatus = 'idle'
	private _error: string | null = null

	constructor(config: FLClientConfig) {
		this._apiBase = config.apiBase.replace(/\/$/, '')
		this._mapId = config.mapId
		this._clientId = config.clientId
		this._maxNorm = config.maxNorm ?? 1.0
		this._epsilon = config.epsilon ?? 1.0
		this._delta = config.delta ?? 1e-5
		this._accountant = new PrivacyAccountant({
			maxEpsilon: config.maxEpsilon ?? 8.0,
			delta: config.delta ?? 1e-5,
			noiseMultiplier: config.noiseMultiplier ?? 1.0,
			samplingRate: 1.0,
		})
	}

	get status(): FLClientStatus {
		return this._status
	}

	get error(): string | null {
		return this._error
	}

	get privacyState(): PrivacyState {
		return this._accountant.state
	}

	// ─── Round Status ──────────────────────────────────────────────────────

	/** Check the current round status for this map. */
	async getRoundStatus(): Promise<FLRoundSummary | null> {
		try {
			this._status = 'checking'
			const resp = await fetch(
				`${this._apiBase}/fl/rounds/status?mapId=${encodeURIComponent(this._mapId)}`,
			)
			this._status = 'idle'
			if (!resp.ok) return null
			return resp.json()
		} catch {
			this._status = 'idle'
			return null
		}
	}

	// ─── Snapshot ──────────────────────────────────────────────────────────

	/** Snapshot LoRA B params before training. Pass result to submitDelta after training. */
	snapshotParams(adapter: LoraAdapter): Float32Array {
		return adapter.getTrainableParams()
	}

	// ─── Submit Delta ──────────────────────────────────────────────────────

	/**
	 * Compute delta, apply DP, encrypt, and upload to the current round.
	 *
	 * @param adapter      The LoRA adapter (with updated B params after training)
	 * @param beforeParams Snapshot taken before training via snapshotParams()
	 * @param numExamples  Number of training examples used
	 * @returns Round result with privacy state
	 */
	async submitDelta(
		adapter: LoraAdapter,
		beforeParams: Float32Array,
		numExamples: number,
	): Promise<FLRoundResult> {
		// Check consent first
		if (!getFLConsent().isOptedIn) {
			throw new Error('FL participation requires user consent')
		}

		if (this._accountant.state.exhausted) {
			throw new Error('Privacy budget exhausted')
		}

		// 1. Check round
		this._status = 'checking'
		const roundStatus = await this.getRoundStatus()
		if (
			!roundStatus ||
			roundStatus.status !== 'collecting'
		) {
			this._status = 'idle'
			throw new Error(`No active round (status: ${roundStatus?.status ?? 'none'})`)
		}

		// 2. Compute delta
		this._status = 'submitting'
		const afterParams = adapter.getTrainableParams()
		const delta = new Float32Array(afterParams.length)
		for (let i = 0; i < delta.length; i++) {
			delta[i] = afterParams[i] - beforeParams[i]
		}
		const rawNorm = l2Norm(delta)
		console.debug(`[FL Client] Delta computed: ${delta.length} params, L2 norm=${rawNorm.toFixed(6)}`)

		// 3. Clip + noise (DP)
		const sigma = computeSigma(this._maxNorm, this._epsilon, this._delta)
		const privateDelta = clipAndNoise(delta, this._maxNorm, sigma)
		console.debug(`[FL Client] DP applied: clip=${this._maxNorm}, σ=${sigma.toFixed(4)}, ε=${this._epsilon}`)

		// 4. Encrypt
		this._status = 'encrypting'
		console.debug('[FL Client] Encrypting delta via CKKS...')
		const ckks = CkksService.getInstance()
		const blobs = await ckks.encryptVector(privateDelta)
		const blobData = blobs.map((b) => b.data)
		console.debug(`[FL Client] Encrypted: ${blobs.length} blob(s), ${blobData.reduce((s, b) => s + b.length, 0)} chars total`)

		// 5. Upload
		this._status = 'uploading'
		console.debug(`[FL Client] Uploading to round ${roundStatus.id}...`)
		const submitResp = await fetch(
			`${this._apiBase}/fl/rounds/submit?mapId=${encodeURIComponent(this._mapId)}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					clientId: this._clientId,
					roundId: roundStatus.id,
					blobs: blobData,
					numExamples,
					reportedNorm: rawNorm,
				}),
			},
		)

		if (!submitResp.ok) {
			const err = await submitResp.json().catch(() => ({ error: 'Upload failed' }))
			this._status = 'error'
			this._error = (err as { error: string }).error || 'Upload failed'
			throw new Error(this._error)
		}

		const result: FLSubmitResponse = await submitResp.json()
		console.debug(`[FL Client] Submitted: count=${result.submissionCount}, status=${result.roundStatus}`)

		// 6. Track privacy budget
		const privacyState = this._accountant.step()
		console.debug(`[FL Client] Privacy budget: ε=${privacyState.epsilon.toFixed(4)} / ${this._accountant.state.exhausted ? 'EXHAUSTED' : 'OK'}`)

		// 7. Record telemetry
		getFLTelemetry().recordRound({
			roundId: roundStatus.id,
			deltaL2Norm: rawNorm,
			trainingLoss: 0, // TODO: accept from caller when training pipeline reports loss
			numExamples,
			privacyEpsilon: privacyState.epsilon,
		})

		this._status = 'idle'
		this._error = null

		return {
			roundId: roundStatus.id,
			deltaL2Norm: rawNorm,
			privacyState,
			submissionCount: result.submissionCount,
		}
	}

	// ─── Download & Apply Aggregate ────────────────────────────────────────

	/**
	 * Download the published aggregate and apply it to the LoRA adapter.
	 * The server decrypts the CKKS aggregate and returns plaintext values.
	 * Returns true if successful, false if no aggregate available.
	 */
	async applyAggregate(adapter: LoraAdapter): Promise<boolean> {
		this._status = 'downloading'

		try {
			const resp = await fetch(
				`${this._apiBase}/fl/rounds/aggregate?mapId=${encodeURIComponent(this._mapId)}`,
			)
			if (!resp.ok) {
				this._status = 'idle'
				return false
			}

			const data: { roundId: string; values: number[]; submissionCount: number } =
				await resp.json()
			if (!data.values || data.values.length === 0) {
				this._status = 'idle'
				return false
			}

			// Apply: current_params += aggregated_delta / submissionCount
			// (The DO stores raw sum; we average by dividing by submission count)
			this._status = 'applying'
			console.debug(`[FL Client] Applying aggregate: ${data.values.length} values from ${data.submissionCount} submissions`)
			const currentParams = adapter.getTrainableParams()
			const scale = 1 / data.submissionCount
			for (let i = 0; i < Math.min(currentParams.length, data.values.length); i++) {
				currentParams[i] += data.values[i] * scale
			}
			adapter.setTrainableParams(currentParams)

			this._status = 'idle'
			this._error = null
			return true
		} catch (e) {
			this._error = e instanceof Error ? e.message : 'Failed to apply aggregate'
			this._status = 'error'
			return false
		}
	}

	/** Reset the privacy accountant (e.g., new consent period). */
	resetPrivacy(): void {
		this._accountant.reset()
	}
}
