// ─── Cloudflare FL Transport ─────────────────────────────────────────────────
//
// FLTransport implementation backed by Cloudflare Workers + Durable Objects.
// Routes all FL requests through the worker's HTTP API, which forwards to
// the AggregationDO for round coordination, key management, and aggregation.

import type { FLRoundSummary, FLSubmitResponse, FLOpenRoundResponse, FLSubmission } from '../../../shared/types/FLRound'
import type { FLTransport, FLAggregateResult } from '../../../shared/types/FLTransport'

export class CloudflareFLTransport implements FLTransport {
	private _baseUrl: string

	constructor(apiBase: string) {
		this._baseUrl = apiBase.replace(/\/$/, '')
	}

	async getPublicKey(mapId: string): Promise<string> {
		const resp = await fetch(
			`${this._baseUrl}/fl/keys?mapId=${encodeURIComponent(mapId)}`,
		)
		if (!resp.ok) {
			throw new Error(`Failed to fetch FL public key: ${resp.status}`)
		}
		const { publicKey } = (await resp.json()) as { publicKey: string }
		return publicKey
	}

	async openRound(mapId: string): Promise<FLOpenRoundResponse> {
		const resp = await fetch(
			`${this._baseUrl}/fl/rounds/open?mapId=${encodeURIComponent(mapId)}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({}),
			},
		)
		if (!resp.ok) {
			throw new Error(`Failed to open FL round: ${resp.status}`)
		}
		return resp.json() as Promise<FLOpenRoundResponse>
	}

	async submitDelta(mapId: string, submission: FLSubmission): Promise<FLSubmitResponse> {
		const resp = await fetch(
			`${this._baseUrl}/fl/rounds/submit?mapId=${encodeURIComponent(mapId)}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(submission),
			},
		)
		if (!resp.ok) {
			const err = await resp.json().catch(() => ({ error: 'Upload failed' }))
			throw new Error((err as { error: string }).error || 'Upload failed')
		}
		return resp.json() as Promise<FLSubmitResponse>
	}

	async getRoundStatus(mapId: string): Promise<FLRoundSummary | null> {
		try {
			const resp = await fetch(
				`${this._baseUrl}/fl/rounds/status?mapId=${encodeURIComponent(mapId)}`,
			)
			if (!resp.ok) return null
			return resp.json() as Promise<FLRoundSummary>
		} catch {
			return null
		}
	}

	async getAggregate(mapId: string): Promise<FLAggregateResult | null> {
		const resp = await fetch(
			`${this._baseUrl}/fl/rounds/aggregate?mapId=${encodeURIComponent(mapId)}`,
		)
		if (!resp.ok) return null

		const data = (await resp.json()) as FLAggregateResult
		if (!data.values || data.values.length === 0) return null
		return data
	}
}
