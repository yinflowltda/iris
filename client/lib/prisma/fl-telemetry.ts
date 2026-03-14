// ─── FL Telemetry: Client-Side Metrics ──────────────────────────────────────
//
// Tracks local FL participation metrics for the settings panel.
// All data stays on-device (localStorage). Nothing is sent externally.

const STORAGE_KEY = 'iris-fl-telemetry'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FLRoundMetric {
	roundId: string
	timestamp: string
	deltaL2Norm: number
	trainingLoss: number
	numExamples: number
	privacyEpsilon: number
}

export interface FLTelemetryState {
	/** Total rounds participated in */
	totalRounds: number
	/** Most recent round metrics (ring buffer, max 50) */
	recentRounds: FLRoundMetric[]
	/** Cumulative privacy epsilon */
	cumulativeEpsilon: number
	/** Average training loss over last 10 rounds */
	avgRecentLoss: number
	/** Last participation timestamp */
	lastParticipation: string | null
}

const MAX_RECENT_ROUNDS = 50

// ─── Telemetry Tracker ──────────────────────────────────────────────────────

export class FLTelemetry {
	private _state: FLTelemetryState

	constructor() {
		this._state = this._load()
	}

	get state(): FLTelemetryState {
		return { ...this._state, recentRounds: [...this._state.recentRounds] }
	}

	get totalRounds(): number {
		return this._state.totalRounds
	}

	get avgRecentLoss(): number {
		return this._state.avgRecentLoss
	}

	get cumulativeEpsilon(): number {
		return this._state.cumulativeEpsilon
	}

	/** Record a completed FL round. */
	recordRound(metric: Omit<FLRoundMetric, 'timestamp'>): void {
		const entry: FLRoundMetric = {
			...metric,
			timestamp: new Date().toISOString(),
		}

		this._state.recentRounds.push(entry)
		if (this._state.recentRounds.length > MAX_RECENT_ROUNDS) {
			this._state.recentRounds.shift()
		}

		this._state.totalRounds++
		this._state.cumulativeEpsilon = metric.privacyEpsilon
		this._state.lastParticipation = entry.timestamp

		// Compute average loss over last 10 rounds
		const recent = this._state.recentRounds.slice(-10)
		this._state.avgRecentLoss =
			recent.reduce((sum, r) => sum + r.trainingLoss, 0) / recent.length

		this._save()
	}

	/** Reset all metrics (e.g., new consent period). */
	reset(): void {
		this._state = {
			totalRounds: 0,
			recentRounds: [],
			cumulativeEpsilon: 0,
			avgRecentLoss: 0,
			lastParticipation: null,
		}
		this._save()
	}

	private _save(): void {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this._state))
		} catch {
			// Storage unavailable
		}
	}

	private _load(): FLTelemetryState {
		try {
			const stored = localStorage.getItem(STORAGE_KEY)
			if (stored) {
				const parsed = JSON.parse(stored) as FLTelemetryState
				if (typeof parsed.totalRounds === 'number') {
					return parsed
				}
			}
		} catch {
			// Corrupted or unavailable
		}
		return {
			totalRounds: 0,
			recentRounds: [],
			cumulativeEpsilon: 0,
			avgRecentLoss: 0,
			lastParticipation: null,
		}
	}
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _instance: FLTelemetry | null = null

export function getFLTelemetry(): FLTelemetry {
	if (!_instance) {
		_instance = new FLTelemetry()
	}
	return _instance
}

/** Reset singleton — only for tests. */
export function _resetFLTelemetry(): void {
	_instance = null
}
