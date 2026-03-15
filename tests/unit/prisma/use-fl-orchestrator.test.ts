import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { FLTransport, FLAggregateResult } from '../../../shared/types/FLTransport'
import type { FLRoundSummary, FLSubmitResponse, FLOpenRoundResponse, FLSubmission } from '../../../shared/types/FLRound'

// ─── Mocks ────────────────────────────────────────────────────────────────

const storageMap = new Map<string, string>()
vi.stubGlobal('localStorage', {
	getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
	setItem: vi.fn((key: string, value: string) => storageMap.set(key, value)),
	removeItem: vi.fn((key: string) => storageMap.delete(key)),
	clear: vi.fn(() => storageMap.clear()),
	get length() { return storageMap.size },
	key: vi.fn(() => null),
})

vi.mock('../../../client/lib/prisma/ckks-service', () => ({
	CkksService: {
		getInstance: () => ({
			init: vi.fn().mockResolvedValue(undefined),
			loadPublicKey: vi.fn().mockResolvedValue(undefined),
			encryptVector: vi.fn().mockResolvedValue([{ data: 'blob', valueCount: 4096 }]),
			slotCount: 4096,
		}),
	},
}))

vi.mock('../../../client/lib/prisma/fl-telemetry', () => ({
	getFLTelemetry: () => ({ recordRound: vi.fn() }),
}))

// ─── Mock Transport ─────────────────────────────────────────────────────────

function createMockTransport(): FLTransport & {
	getPublicKey: ReturnType<typeof vi.fn>
	openRound: ReturnType<typeof vi.fn>
	submitDelta: ReturnType<typeof vi.fn>
	getRoundStatus: ReturnType<typeof vi.fn>
	getAggregate: ReturnType<typeof vi.fn>
} {
	return {
		getPublicKey: vi.fn().mockResolvedValue('mock-public-key-b64'),
		openRound: vi.fn().mockResolvedValue({ roundId: 'new-round', minSubmissions: 3, expiresAt: new Date(Date.now() + 60000).toISOString() }),
		submitDelta: vi.fn().mockResolvedValue({ accepted: true, submissionCount: 1, roundStatus: 'collecting' }),
		getRoundStatus: vi.fn().mockResolvedValue(null),
		getAggregate: vi.fn().mockResolvedValue(null),
	}
}

import { _resetFLConsent, getFLConsent } from '../../../client/lib/prisma/fl-consent'
import { createFLOrchestrator, type FLOrchestratorConfig } from '../../../client/lib/prisma/use-fl-orchestrator'
import { LoraAdapter } from '../../../client/lib/prisma/lora-adapter'
import { ProjectionHead } from '../../../client/lib/prisma/projection-head'

describe('FL Orchestrator', () => {
	let config: FLOrchestratorConfig
	let mockTransport: ReturnType<typeof createMockTransport>

	beforeEach(() => {
		storageMap.clear()
		_resetFLConsent()
		mockTransport = createMockTransport()
		config = {
			transport: mockTransport,
			mapId: 'test-map',
		}
	})

	it('should skip FL submission when not opted in', async () => {
		const orchestrator = createFLOrchestrator(config)
		const adapter = new LoraAdapter(new ProjectionHead())

		await orchestrator.onTrainingComplete(adapter, 5, adapter.getTrainableParams())
		expect(mockTransport.getRoundStatus).not.toHaveBeenCalled()
	})

	it('should submit delta when opted in and round is collecting', async () => {
		getFLConsent().optIn()

		mockTransport.getRoundStatus
			// First call from orchestrator
			.mockResolvedValueOnce({
				id: 'round-1', status: 'collecting',
				submissionCount: 0, minSubmissions: 3,
				expiresAt: new Date(Date.now() + 60000).toISOString(),
				hasAggregate: false,
			})
			// Second call from FLClient.submitDelta internal check
			.mockResolvedValueOnce({
				id: 'round-1', status: 'collecting',
				submissionCount: 0, minSubmissions: 3,
				expiresAt: new Date(Date.now() + 60000).toISOString(),
				hasAggregate: false,
			})

		const orchestrator = createFLOrchestrator(config)
		const adapter = new LoraAdapter(new ProjectionHead())

		await orchestrator.onTrainingComplete(adapter, 5, adapter.getTrainableParams())

		// Verify transport was used for status + submit
		expect(mockTransport.getRoundStatus).toHaveBeenCalled()
		expect(mockTransport.submitDelta).toHaveBeenCalled()
	})

	it('should open a new round when none exists', async () => {
		getFLConsent().optIn()

		// getRoundStatus: null (no round) for orchestrator, then collecting for FLClient.submitDelta
		mockTransport.getRoundStatus
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({
				id: 'new-round', status: 'collecting',
				submissionCount: 0, minSubmissions: 3,
				expiresAt: new Date(Date.now() + 60000).toISOString(),
				hasAggregate: false,
			})

		const orchestrator = createFLOrchestrator(config)
		const adapter = new LoraAdapter(new ProjectionHead())

		await orchestrator.onTrainingComplete(adapter, 5, adapter.getTrainableParams())

		expect(mockTransport.openRound).toHaveBeenCalledWith('test-map')
		expect(mockTransport.submitDelta).toHaveBeenCalled()
	})

	it('should not submit concurrently (concurrency guard)', async () => {
		getFLConsent().optIn()

		let resolveFirst: () => void
		const firstPromise = new Promise<void>((r) => { resolveFirst = r })

		// First call blocks on getPublicKey
		mockTransport.getPublicKey.mockImplementationOnce(() =>
			firstPromise.then(() => 'mock-pk'),
		)

		const orchestrator = createFLOrchestrator(config)
		const adapter = new LoraAdapter(new ProjectionHead())

		// Start first call (blocks on key fetch)
		const snapshot = adapter.getTrainableParams()
		const p1 = orchestrator.onTrainingComplete(adapter, 5, snapshot)
		// Second call should be skipped (concurrency guard)
		const p2 = orchestrator.onTrainingComplete(adapter, 5, snapshot)

		// Resolve the first call's key fetch
		resolveFirst!()

		// Mock remaining calls for first submission
		mockTransport.getRoundStatus
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({
				id: 'round-1', status: 'collecting',
				submissionCount: 0, minSubmissions: 3,
				expiresAt: new Date(Date.now() + 60000).toISOString(),
				hasAggregate: false,
			})

		await p1
		await p2

		// Second call was skipped, so only one submission
		expect(mockTransport.submitDelta.mock.calls.length).toBeLessThanOrEqual(1)
	})

	it('should handle errors without throwing', async () => {
		getFLConsent().optIn()

		mockTransport.getPublicKey.mockRejectedValueOnce(new Error('Network error'))

		const orchestrator = createFLOrchestrator(config)
		const adapter = new LoraAdapter(new ProjectionHead())

		// Should not throw
		await orchestrator.onTrainingComplete(adapter, 5, adapter.getTrainableParams())
		expect(orchestrator.error).toBeTruthy()
	})
})
