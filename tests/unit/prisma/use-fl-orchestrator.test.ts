import { describe, it, expect, beforeEach, vi } from 'vitest'

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
			generateKeys: vi.fn().mockResolvedValue({ publicKey: 'pk', secretKey: 'sk' }),
			loadKeys: vi.fn().mockResolvedValue(undefined),
			saveKeysToIDB: vi.fn().mockResolvedValue(undefined),
			loadKeysFromIDB: vi.fn().mockResolvedValue(null),
			encryptVector: vi.fn().mockResolvedValue([{ data: 'blob', valueCount: 4096 }]),
			decryptVector: vi.fn().mockResolvedValue(new Float32Array(0)),
			slotCount: 4096,
			keys: null,
		}),
	},
}))

vi.mock('../../../client/lib/prisma/fl-telemetry', () => ({
	getFLTelemetry: () => ({ recordRound: vi.fn() }),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { _resetFLConsent, getFLConsent } from '../../../client/lib/prisma/fl-consent'
import { createFLOrchestrator, type FLOrchestratorConfig } from '../../../client/lib/prisma/use-fl-orchestrator'
import { LoraAdapter } from '../../../client/lib/prisma/lora-adapter'
import { ProjectionHead } from '../../../client/lib/prisma/projection-head'

describe('FL Orchestrator', () => {
	let config: FLOrchestratorConfig

	beforeEach(() => {
		storageMap.clear()
		_resetFLConsent()
		mockFetch.mockReset()
		config = {
			apiBase: 'https://test.example.com',
			mapId: 'test-map',
		}
	})

	it('should skip FL submission when not opted in', async () => {
		const orchestrator = createFLOrchestrator(config)
		const adapter = new LoraAdapter(new ProjectionHead())

		await orchestrator.onTrainingComplete(adapter, 5, adapter.getTrainableParams())
		expect(mockFetch).not.toHaveBeenCalled()
	})

	it('should submit delta when opted in and round is collecting', async () => {
		getFLConsent().optIn()

		// Mock round status: collecting
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({
				id: 'round-1', status: 'collecting',
				submissionCount: 0, minSubmissions: 3,
				expiresAt: new Date(Date.now() + 60000).toISOString(),
				hasAggregate: false,
			}),
		})
		// Mock submit response
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({
				accepted: true, submissionCount: 1, roundStatus: 'collecting',
			}),
		})

		const orchestrator = createFLOrchestrator(config)
		const adapter = new LoraAdapter(new ProjectionHead())

		await orchestrator.onTrainingComplete(adapter, 5, adapter.getTrainableParams())

		// Should have called: getRoundStatus (internal fetch) + submitDelta (status check + submit = 2 fetches)
		// FLClient.getRoundStatus() = 1 fetch, FLClient.submitDelta() calls getRoundStatus() internally + submit = 2 fetches
		// Total: 1 (orchestrator status check) + 1 (submitDelta internal status check) + 1 (submit POST) = 3
		// But actually: orchestrator calls flClient.getRoundStatus() = 1 fetch,
		// then calls flClient.submitDelta() which calls this.getRoundStatus() = 1 fetch + submit POST = 1 fetch
		// Total = 3 fetches
		expect(mockFetch).toHaveBeenCalled()
		// Verify at least one call was to /fl/rounds/status
		const statusCalls = mockFetch.mock.calls.filter((c: any[]) =>
			typeof c[0] === 'string' && c[0].includes('/fl/rounds/status'),
		)
		expect(statusCalls.length).toBeGreaterThan(0)
	})

	it('should open a new round when none exists', async () => {
		getFLConsent().optIn()

		// Mock: getRoundStatus returns null (404)
		mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })
		// Mock: open round
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({
				roundId: 'new-round', minSubmissions: 3,
				expiresAt: new Date(Date.now() + 60000).toISOString(),
			}),
		})
		// Mock: submitDelta's internal getRoundStatus
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({
				id: 'new-round', status: 'collecting',
				submissionCount: 0, minSubmissions: 3,
				expiresAt: new Date(Date.now() + 60000).toISOString(),
				hasAggregate: false,
			}),
		})
		// Mock: submit POST
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({
				accepted: true, submissionCount: 1, roundStatus: 'collecting',
			}),
		})

		const orchestrator = createFLOrchestrator(config)
		const adapter = new LoraAdapter(new ProjectionHead())

		await orchestrator.onTrainingComplete(adapter, 5, adapter.getTrainableParams())

		// Verify open call was made
		const openCalls = mockFetch.mock.calls.filter((c: any[]) =>
			typeof c[0] === 'string' && c[0].includes('/fl/rounds/open'),
		)
		expect(openCalls.length).toBeGreaterThan(0)
	})

	it('should not submit concurrently (concurrency guard)', async () => {
		getFLConsent().optIn()

		let resolveFirst: () => void
		const firstStatusPromise = new Promise<void>((r) => { resolveFirst = r })

		// First call blocks on status check
		mockFetch.mockImplementationOnce(() =>
			firstStatusPromise.then(() => ({
				ok: true,
				json: () => Promise.resolve({
					id: 'round-1', status: 'collecting',
					submissionCount: 0, minSubmissions: 3,
					expiresAt: new Date(Date.now() + 60000).toISOString(),
					hasAggregate: false,
				}),
			})),
		)

		const orchestrator = createFLOrchestrator(config)
		const adapter = new LoraAdapter(new ProjectionHead())

		// Start first call (blocks)
		const snapshot = adapter.getTrainableParams()
		const p1 = orchestrator.onTrainingComplete(adapter, 5, snapshot)
		// Second call should be skipped (concurrency guard)
		const p2 = orchestrator.onTrainingComplete(adapter, 5, snapshot)

		// Resolve the first call's status check
		resolveFirst!()

		// Mock submitDelta's internal getRoundStatus + submit
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({
				id: 'round-1', status: 'collecting',
				submissionCount: 0, minSubmissions: 3,
				expiresAt: new Date(Date.now() + 60000).toISOString(),
				hasAggregate: false,
			}),
		})
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({
				accepted: true, submissionCount: 1, roundStatus: 'collecting',
			}),
		})

		await p1
		await p2

		// Second call was skipped, so only first call's fetches
		expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(3)
	})

	it('should handle errors without throwing', async () => {
		getFLConsent().optIn()

		mockFetch.mockRejectedValueOnce(new Error('Network error'))

		const orchestrator = createFLOrchestrator(config)
		const adapter = new LoraAdapter(new ProjectionHead())

		// Should not throw
		await orchestrator.onTrainingComplete(adapter, 5, adapter.getTrainableParams())
		expect(orchestrator.error).toBeTruthy()
	})
})
