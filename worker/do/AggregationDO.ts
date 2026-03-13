// ─── Aggregation Durable Object ─────────────────────────────────────────────
//
// Manages FL round lifecycle: open → collecting → aggregating → published.
// Collects encrypted weight deltas from clients, stores in R2, and triggers
// homomorphic aggregation when enough submissions arrive.
//
// This DO never possesses secret key material.

import { DurableObject } from 'cloudflare:workers'
import type { Environment } from '../environment'
import type {
	FLRound,
	FLSubmission,
	FLRoundSummary,
	FLOpenRoundResponse,
	FLSubmitResponse,
	RoundStatus,
} from '../../shared/types/FLRound'

const DEFAULT_MIN_SUBMISSIONS = 3
const DEFAULT_ROUND_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
const MAX_REPORTED_NORM = 100 // Byzantine check: reject if reported norm is too high

export class AggregationDO extends DurableObject<Environment> {
	private round: FLRound | null = null

	constructor(ctx: DurableObjectState, env: Environment) {
		super(ctx, env)
		// Restore round state from storage on wake
		ctx.blockConcurrencyWhile(async () => {
			this.round = (await this.ctx.storage.get<FLRound>('round')) ?? null
		})
	}

	override async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url)
		const path = url.pathname

		try {
			if (request.method === 'POST' && path === '/open') {
				return this.handleOpen(request)
			}
			if (request.method === 'POST' && path === '/submit') {
				return this.handleSubmit(request)
			}
			if (request.method === 'GET' && path === '/status') {
				return this.handleStatus()
			}
			if (request.method === 'GET' && path === '/aggregate') {
				return this.handleGetAggregate()
			}
			if (request.method === 'POST' && path === '/aggregate') {
				return this.handleUploadAggregate(request)
			}
			return new Response('Not found', { status: 404 })
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e)
			return Response.json({ error: msg }, { status: 500 })
		}
	}

	// ─── Round Lifecycle ──────────────────────────────────────────────────────

	private async handleOpen(request: Request): Promise<Response> {
		if (this.round && (this.round.status === 'open' || this.round.status === 'collecting')) {
			return Response.json({ error: 'Round already active' }, { status: 409 })
		}

		const body = (await request.json().catch(() => ({}))) as {
			minSubmissions?: number
			timeoutMs?: number
		}
		const minSubmissions = body.minSubmissions ?? DEFAULT_MIN_SUBMISSIONS
		const timeoutMs = body.timeoutMs ?? DEFAULT_ROUND_TIMEOUT_MS
		const now = new Date()

		this.round = {
			id: crypto.randomUUID(),
			status: 'collecting',
			minSubmissions,
			submissionCount: 0,
			submittedClients: [],
			openedAt: now.toISOString(),
			expiresAt: new Date(now.getTime() + timeoutMs).toISOString(),
			aggregateKey: null,
			blobsPerSubmission: null,
		}

		await this.saveRound()

		// Set alarm for timeout
		await this.ctx.storage.setAlarm(now.getTime() + timeoutMs)

		const response: FLOpenRoundResponse = {
			roundId: this.round.id,
			minSubmissions,
			expiresAt: this.round.expiresAt,
		}
		return Response.json(response, { status: 201 })
	}

	private async handleSubmit(request: Request): Promise<Response> {
		if (!this.round || this.round.status !== 'collecting') {
			return Response.json(
				{ error: 'No round is currently collecting submissions' },
				{ status: 400 },
			)
		}

		const submission = (await request.json()) as FLSubmission

		// Validate
		if (submission.roundId !== this.round.id) {
			return Response.json({ error: 'Round ID mismatch' }, { status: 400 })
		}
		if (this.round.submittedClients.includes(submission.clientId)) {
			return Response.json({ error: 'Client already submitted' }, { status: 409 })
		}
		if (!submission.blobs || submission.blobs.length === 0) {
			return Response.json({ error: 'No blobs in submission' }, { status: 400 })
		}
		// Byzantine check: reject if reported norm is suspiciously high
		if (submission.reportedNorm > MAX_REPORTED_NORM) {
			return Response.json({ error: 'Reported norm exceeds limit' }, { status: 400 })
		}
		// Enforce consistent blob count across submissions
		if (this.round.blobsPerSubmission === null) {
			this.round.blobsPerSubmission = submission.blobs.length
		} else if (submission.blobs.length !== this.round.blobsPerSubmission) {
			return Response.json(
				{
					error: `Expected ${this.round.blobsPerSubmission} blobs, got ${submission.blobs.length}`,
				},
				{ status: 400 },
			)
		}

		// Store blobs in R2
		const r2 = this.env.FL_BUCKET
		for (let i = 0; i < submission.blobs.length; i++) {
			const key = `rounds/${this.round.id}/submissions/${submission.clientId}/blob-${i}`
			await r2.put(key, submission.blobs[i])
		}

		// Store submission metadata (without blobs)
		const metaKey = `rounds/${this.round.id}/submissions/${submission.clientId}/meta.json`
		await r2.put(
			metaKey,
			JSON.stringify({
				clientId: submission.clientId,
				numExamples: submission.numExamples,
				reportedNorm: submission.reportedNorm,
				blobCount: submission.blobs.length,
				submittedAt: new Date().toISOString(),
			}),
		)

		this.round.submittedClients.push(submission.clientId)
		this.round.submissionCount++
		await this.saveRound()

		const response: FLSubmitResponse = {
			accepted: true,
			submissionCount: this.round.submissionCount,
			roundStatus: this.round.status,
		}

		// Check if we have enough submissions to aggregate
		if (this.round.submissionCount >= this.round.minSubmissions) {
			this.round.status = 'aggregating'
			await this.saveRound()
			response.roundStatus = 'aggregating'
		}

		return Response.json(response)
	}

	private handleStatus(): Response {
		if (!this.round) {
			return Response.json({ error: 'No round exists' }, { status: 404 })
		}

		const summary: FLRoundSummary = {
			id: this.round.id,
			status: this.round.status,
			submissionCount: this.round.submissionCount,
			minSubmissions: this.round.minSubmissions,
			expiresAt: this.round.expiresAt,
			hasAggregate: this.round.aggregateKey !== null,
		}
		return Response.json(summary)
	}

	// ─── Aggregate Management ─────────────────────────────────────────────────

	/**
	 * Upload the aggregated ciphertext blobs.
	 * Called by the aggregator (a trusted client or worker) after performing
	 * homomorphic addition on all submissions.
	 */
	private async handleUploadAggregate(request: Request): Promise<Response> {
		if (!this.round || this.round.status !== 'aggregating') {
			return Response.json(
				{ error: 'Round is not in aggregating state' },
				{ status: 400 },
			)
		}

		const body = (await request.json()) as { blobs: string[] }
		if (!body.blobs || body.blobs.length === 0) {
			return Response.json({ error: 'No aggregate blobs provided' }, { status: 400 })
		}

		const r2 = this.env.FL_BUCKET
		for (let i = 0; i < body.blobs.length; i++) {
			const key = `rounds/${this.round.id}/aggregate/blob-${i}`
			await r2.put(key, body.blobs[i])
		}

		this.round.aggregateKey = `rounds/${this.round.id}/aggregate/`
		this.round.status = 'published'
		await this.saveRound()

		return Response.json({ status: 'published', blobCount: body.blobs.length })
	}

	/**
	 * Download the aggregated result.
	 * Clients call this after the round is published to get the new weights.
	 */
	private async handleGetAggregate(): Promise<Response> {
		if (!this.round || this.round.status !== 'published' || !this.round.aggregateKey) {
			return Response.json({ error: 'No aggregate available' }, { status: 404 })
		}

		const r2 = this.env.FL_BUCKET
		const blobs: string[] = []
		const blobCount = this.round.blobsPerSubmission ?? 1

		for (let i = 0; i < blobCount; i++) {
			const key = `rounds/${this.round.id}/aggregate/blob-${i}`
			const obj = await r2.get(key)
			if (obj) {
				blobs.push(await obj.text())
			}
		}

		return Response.json({
			roundId: this.round.id,
			blobs,
			submissionCount: this.round.submissionCount,
		})
	}

	// ─── Submissions Listing (for aggregator) ─────────────────────────────────

	/**
	 * List all submission blob keys for a round so the aggregator can fetch them.
	 * Only available when status is 'aggregating'.
	 */
	async getSubmissionKeys(): Promise<{ clientId: string; blobKeys: string[] }[]> {
		if (!this.round || this.round.status !== 'aggregating') return []

		const result: { clientId: string; blobKeys: string[] }[] = []
		const blobCount = this.round.blobsPerSubmission ?? 1

		for (const clientId of this.round.submittedClients) {
			const blobKeys: string[] = []
			for (let i = 0; i < blobCount; i++) {
				blobKeys.push(`rounds/${this.round.id}/submissions/${clientId}/blob-${i}`)
			}
			result.push({ clientId, blobKeys })
		}

		return result
	}

	// ─── Alarm (Timeout) ──────────────────────────────────────────────────────

	override async alarm(): Promise<void> {
		if (!this.round) return

		// Only timeout if still collecting
		if (this.round.status === 'collecting') {
			if (this.round.submissionCount < this.round.minSubmissions) {
				this.round.status = 'timed_out'
			} else {
				this.round.status = 'aggregating'
			}
			await this.saveRound()
		}
	}

	// ─── Storage Helpers ──────────────────────────────────────────────────────

	private async saveRound(): Promise<void> {
		await this.ctx.storage.put('round', this.round)
	}

	/** Expose round state for testing */
	getRound(): FLRound | null {
		return this.round
	}
}
