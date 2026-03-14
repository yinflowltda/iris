import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
	FLTelemetry,
	getFLTelemetry,
	_resetFLTelemetry,
} from '../../../client/lib/prisma/fl-telemetry'

// ─── Mock localStorage ──────────────────────────────────────────────────────

const storageMap = new Map<string, string>()

const mockStorage = {
	getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
	setItem: vi.fn((key: string, value: string) => storageMap.set(key, value)),
	removeItem: vi.fn((key: string) => storageMap.delete(key)),
	clear: vi.fn(() => storageMap.clear()),
	get length() {
		return storageMap.size
	},
	key: vi.fn(() => null),
}

vi.stubGlobal('localStorage', mockStorage)

describe('FLTelemetry', () => {
	beforeEach(() => {
		storageMap.clear()
		_resetFLTelemetry()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	// ─── Initial State ──────────────────────────────────────────────────

	it('should initialize with zero state', () => {
		const tel = new FLTelemetry()
		expect(tel.totalRounds).toBe(0)
		expect(tel.avgRecentLoss).toBe(0)
		expect(tel.cumulativeEpsilon).toBe(0)
		expect(tel.state.recentRounds).toHaveLength(0)
		expect(tel.state.lastParticipation).toBeNull()
	})

	// ─── Record Rounds ──────────────────────────────────────────────────

	it('should record a round', () => {
		const tel = new FLTelemetry()
		tel.recordRound({
			roundId: 'round-1',
			deltaL2Norm: 0.5,
			trainingLoss: 0.3,
			numExamples: 10,
			privacyEpsilon: 1.2,
		})

		expect(tel.totalRounds).toBe(1)
		expect(tel.cumulativeEpsilon).toBe(1.2)
		expect(tel.avgRecentLoss).toBe(0.3)
		expect(tel.state.recentRounds).toHaveLength(1)
		expect(tel.state.lastParticipation).toBeTruthy()
	})

	it('should compute average loss over last 10 rounds', () => {
		const tel = new FLTelemetry()
		for (let i = 0; i < 15; i++) {
			tel.recordRound({
				roundId: `round-${i}`,
				deltaL2Norm: 0.5,
				trainingLoss: i < 10 ? 1.0 : 0.5, // first 10 = 1.0, last 5 = 0.5
				numExamples: 10,
				privacyEpsilon: (i + 1) * 0.1,
			})
		}

		expect(tel.totalRounds).toBe(15)
		// Last 10 rounds: 5 with loss=1.0 (rounds 5-9) + 5 with loss=0.5 (rounds 10-14)
		// Average = (5*1.0 + 5*0.5) / 10 = 0.75
		expect(tel.avgRecentLoss).toBeCloseTo(0.75, 5)
	})

	it('should maintain ring buffer of max 50 rounds', () => {
		const tel = new FLTelemetry()
		for (let i = 0; i < 60; i++) {
			tel.recordRound({
				roundId: `round-${i}`,
				deltaL2Norm: 0.1,
				trainingLoss: 0.1,
				numExamples: 5,
				privacyEpsilon: 0.1,
			})
		}

		expect(tel.totalRounds).toBe(60)
		expect(tel.state.recentRounds).toHaveLength(50)
		// First round in buffer should be round-10 (0-9 were evicted)
		expect(tel.state.recentRounds[0].roundId).toBe('round-10')
	})

	// ─── Persistence ────────────────────────────────────────────────────

	it('should persist across sessions', () => {
		const tel1 = new FLTelemetry()
		tel1.recordRound({
			roundId: 'round-1',
			deltaL2Norm: 0.5,
			trainingLoss: 0.3,
			numExamples: 10,
			privacyEpsilon: 1.2,
		})

		const tel2 = new FLTelemetry()
		expect(tel2.totalRounds).toBe(1)
		expect(tel2.cumulativeEpsilon).toBe(1.2)
	})

	it('should handle corrupted localStorage', () => {
		storageMap.set('iris-fl-telemetry', 'not-json')
		const tel = new FLTelemetry()
		expect(tel.totalRounds).toBe(0)
	})

	// ─── Reset ──────────────────────────────────────────────────────────

	it('should reset all metrics', () => {
		const tel = new FLTelemetry()
		tel.recordRound({
			roundId: 'round-1',
			deltaL2Norm: 0.5,
			trainingLoss: 0.3,
			numExamples: 10,
			privacyEpsilon: 1.2,
		})

		tel.reset()
		expect(tel.totalRounds).toBe(0)
		expect(tel.avgRecentLoss).toBe(0)
		expect(tel.cumulativeEpsilon).toBe(0)
		expect(tel.state.recentRounds).toHaveLength(0)
	})

	// ─── Singleton ──────────────────────────────────────────────────────

	it('should return same instance from getFLTelemetry', () => {
		const a = getFLTelemetry()
		const b = getFLTelemetry()
		expect(a).toBe(b)
	})
})
