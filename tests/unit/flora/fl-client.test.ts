import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { FLClient, type FLClientConfig } from '../../../client/lib/flora/fl-client'
import { LoraAdapter, LORA_RANK } from '../../../client/lib/flora/lora-adapter'
import { ProjectionHead } from '../../../client/lib/flora/projection-head'
import type { FLTransport, FLAggregateResult } from '../../../shared/types/FLTransport'
import type { FLRoundSummary, FLSubmitResponse, FLOpenRoundResponse, FLSubmission } from '../../../shared/types/FLRound'

// ─── Mock FL Consent ────────────────────────────────────────────────────────

vi.mock('../../../client/lib/flora/fl-consent', () => ({
	getFLConsent: () => ({ isOptedIn: true }),
}))

// ─── Mock FL Telemetry ──────────────────────────────────────────────────────

vi.mock('../../../client/lib/flora/fl-telemetry', () => ({
	getFLTelemetry: () => ({ recordRound: vi.fn() }),
}))

// ─── Mock CKKS Service ──────────────────────────────────────────────────────

const mockEncryptVector = vi.fn()

vi.mock('../../../client/lib/flora/ckks-service', () => ({
	CkksService: {
		getInstance: () => ({
			encryptVector: mockEncryptVector,
			slotCount: 4096,
		}),
	},
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
		getPublicKey: vi.fn(),
		openRound: vi.fn(),
		submitDelta: vi.fn(),
		getRoundStatus: vi.fn(),
		getAggregate: vi.fn(),
	}
}

// ─── Test setup ─────────────────────────────────────────────────────────────

const INPUT_DIM = 384
const HIDDEN_DIM = 128
const PARAM_COUNT = (HIDDEN_DIM + INPUT_DIM) * LORA_RANK // 9216

let mockTransport: ReturnType<typeof createMockTransport>

function makeConfig(overrides?: Partial<FLClientConfig>): FLClientConfig {
	return {
		transport: mockTransport,
		mapId: 'test-map',
		clientId: 'client-1',
		maxNorm: 1.0,
		epsilon: 1.0,
		delta: 1e-5,
		...overrides,
	}
}

function makeAdapter(): { base: ProjectionHead; adapter: LoraAdapter } {
	const base = new ProjectionHead()
	const adapter = new LoraAdapter(base)
	return { base, adapter }
}

describe('FLClient', () => {
	let client: FLClient

	beforeEach(() => {
		mockTransport = createMockTransport()
		client = new FLClient(makeConfig())
		mockEncryptVector.mockReset()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	// ─── Initialization ──────────────────────────────────────────────────

	it('should initialize with idle status', () => {
		expect(client.status).toBe('idle')
		expect(client.error).toBeNull()
	})

	it('should report initial privacy state', () => {
		const state = client.privacyState
		expect(state.rounds).toBe(0)
		expect(state.epsilon).toBe(0)
		expect(state.exhausted).toBe(false)
		expect(state.remaining).toBe(1)
	})

	// ─── getRoundStatus ──────────────────────────────────────────────────

	it('should fetch round status via transport', async () => {
		const summary: FLRoundSummary = {
			id: 'round-1',
			status: 'collecting',
			submissionCount: 1,
			minSubmissions: 3,
			expiresAt: new Date(Date.now() + 60000).toISOString(),
			hasAggregate: false,
		}
		mockTransport.getRoundStatus.mockResolvedValueOnce(summary)

		const result = await client.getRoundStatus()
		expect(result).toEqual(summary)
		expect(mockTransport.getRoundStatus).toHaveBeenCalledWith('test-map')
	})

	it('should return null on transport error', async () => {
		mockTransport.getRoundStatus.mockRejectedValueOnce(new Error('Network error'))
		const result = await client.getRoundStatus()
		expect(result).toBeNull()
	})

	it('should return null when transport returns null', async () => {
		mockTransport.getRoundStatus.mockResolvedValueOnce(null)
		const result = await client.getRoundStatus()
		expect(result).toBeNull()
	})

	// ─── snapshotParams ──────────────────────────────────────────────────

	it('should snapshot LoRA params', () => {
		const { adapter } = makeAdapter()
		const snapshot = client.snapshotParams(adapter)
		expect(snapshot.length).toBe(PARAM_COUNT)
		// All zero initially
		for (let i = 0; i < snapshot.length; i++) {
			expect(snapshot[i]).toBe(0)
		}
	})

	// ─── submitDelta ─────────────────────────────────────────────────────

	it('should submit delta through full pipeline', async () => {
		const { adapter } = makeAdapter()
		const before = client.snapshotParams(adapter)

		// Simulate training — set some B values
		for (let i = 0; i < adapter.b1.length; i++) adapter.b1[i] = 0.01
		for (let i = 0; i < adapter.b2.length; i++) adapter.b2[i] = -0.005

		// Mock round status (called internally)
		mockTransport.getRoundStatus.mockResolvedValueOnce({
			id: 'round-1',
			status: 'collecting',
			submissionCount: 0,
			minSubmissions: 3,
			expiresAt: new Date(Date.now() + 60000).toISOString(),
			hasAggregate: false,
		})

		// Mock encrypt
		mockEncryptVector.mockResolvedValueOnce([
			{ data: 'blob-0-base64', valueCount: 4096 },
			{ data: 'blob-1-base64', valueCount: 4096 },
			{ data: 'blob-2-base64', valueCount: 1024 },
		])

		// Mock submit
		mockTransport.submitDelta.mockResolvedValueOnce({
			accepted: true,
			submissionCount: 1,
			roundStatus: 'collecting',
		})

		const result = await client.submitDelta(adapter, before, 10)

		expect(result.roundId).toBe('round-1')
		expect(result.deltaL2Norm).toBeGreaterThan(0)
		expect(result.privacyState.rounds).toBe(1)
		expect(result.submissionCount).toBe(1)

		// Verify encrypt was called with a Float32Array
		expect(mockEncryptVector).toHaveBeenCalledOnce()
		const encryptArg = mockEncryptVector.mock.calls[0][0]
		expect(encryptArg).toBeInstanceOf(Float32Array)
		expect(encryptArg.length).toBe(PARAM_COUNT)

		// Verify transport.submitDelta was called with correct submission
		expect(mockTransport.submitDelta).toHaveBeenCalledWith('test-map', expect.objectContaining({
			clientId: 'client-1',
			roundId: 'round-1',
			blobs: ['blob-0-base64', 'blob-1-base64', 'blob-2-base64'],
			numExamples: 10,
		}))
	})

	it('should throw if privacy budget exhausted', async () => {
		const { adapter } = makeAdapter()
		const before = client.snapshotParams(adapter)

		// Exhaust budget by using very high epsilon config
		const exhaustedClient = new FLClient(
			makeConfig({ maxEpsilon: 0.001, noiseMultiplier: 0.01 }),
		)

		// Mock round status + submit for first round
		mockTransport.getRoundStatus.mockResolvedValueOnce({
			id: 'round-1',
			status: 'collecting',
			submissionCount: 0,
			minSubmissions: 3,
			expiresAt: new Date(Date.now() + 60000).toISOString(),
			hasAggregate: false,
		})
		mockEncryptVector.mockResolvedValueOnce([{ data: 'blob', valueCount: 4096 }])
		mockTransport.submitDelta.mockResolvedValueOnce({
			accepted: true, submissionCount: 1, roundStatus: 'collecting',
		})

		// First submit should work
		await exhaustedClient.submitDelta(adapter, before, 5)

		// Second submit should fail — budget exhausted
		await expect(exhaustedClient.submitDelta(adapter, before, 5)).rejects.toThrow(
			'Privacy budget exhausted',
		)
	})

	it('should throw if no active round', async () => {
		const { adapter } = makeAdapter()
		const before = client.snapshotParams(adapter)

		mockTransport.getRoundStatus.mockResolvedValueOnce({
			id: 'round-1',
			status: 'published',
			submissionCount: 3,
			minSubmissions: 3,
			expiresAt: new Date().toISOString(),
			hasAggregate: true,
		})

		await expect(client.submitDelta(adapter, before, 5)).rejects.toThrow('No active round')
	})

	it('should throw on upload failure', async () => {
		const { adapter } = makeAdapter()
		const before = client.snapshotParams(adapter)

		mockTransport.getRoundStatus.mockResolvedValueOnce({
			id: 'round-1',
			status: 'collecting',
			submissionCount: 0,
			minSubmissions: 3,
			expiresAt: new Date(Date.now() + 60000).toISOString(),
			hasAggregate: false,
		})

		mockEncryptVector.mockResolvedValueOnce([{ data: 'blob', valueCount: 4096 }])
		mockTransport.submitDelta.mockRejectedValueOnce(new Error('Server error'))

		await expect(client.submitDelta(adapter, before, 5)).rejects.toThrow('Server error')
		expect(client.status).toBe('error')
	})

	// ─── applyAggregate ──────────────────────────────────────────────────

	it('should download and apply plaintext aggregate', async () => {
		const { adapter } = makeAdapter()

		// Set some initial B values
		for (let i = 0; i < adapter.b1.length; i++) adapter.b1[i] = 0.1

		// Mock plaintext aggregate from transport
		const aggregateValues = new Array(PARAM_COUNT).fill(0.3)
		mockTransport.getAggregate.mockResolvedValueOnce({
			roundId: 'round-1',
			values: aggregateValues,
			submissionCount: 3,
		})

		const success = await client.applyAggregate(adapter)
		expect(success).toBe(true)

		// B1 should be 0.1 + (0.3/3) = 0.2 (averaged by submissionCount)
		for (let i = 0; i < adapter.b1.length; i++) {
			expect(adapter.b1[i]).toBeCloseTo(0.2, 5)
		}
	})

	it('should return false if no aggregate available', async () => {
		const { adapter } = makeAdapter()
		mockTransport.getAggregate.mockResolvedValueOnce(null)

		const success = await client.applyAggregate(adapter)
		expect(success).toBe(false)
	})

	it('should handle transport error gracefully', async () => {
		const { adapter } = makeAdapter()
		mockTransport.getAggregate.mockRejectedValueOnce(new Error('Transport error'))

		const success = await client.applyAggregate(adapter)
		expect(success).toBe(false)
		expect(client.status).toBe('error')
		expect(client.error).toBe('Transport error')
	})

	// ─── Privacy tracking ────────────────────────────────────────────────

	it('should track privacy budget across rounds', async () => {
		const { adapter } = makeAdapter()

		for (let round = 0; round < 3; round++) {
			const before = client.snapshotParams(adapter)

			mockTransport.getRoundStatus.mockResolvedValueOnce({
				id: `round-${round}`,
				status: 'collecting',
				submissionCount: 0,
				minSubmissions: 3,
				expiresAt: new Date(Date.now() + 60000).toISOString(),
				hasAggregate: false,
			})
			mockEncryptVector.mockResolvedValueOnce([{ data: 'blob', valueCount: 4096 }])
			mockTransport.submitDelta.mockResolvedValueOnce({
				accepted: true,
				submissionCount: round + 1,
				roundStatus: 'collecting',
			})

			await client.submitDelta(adapter, before, 5)
		}

		const state = client.privacyState
		expect(state.rounds).toBe(3)
		expect(state.epsilon).toBeGreaterThan(0)
		expect(state.remaining).toBeLessThan(1)
	})

	it('should reset privacy on demand', async () => {
		// Manually step privacy a few times by submitting
		const { adapter } = makeAdapter()
		const before = client.snapshotParams(adapter)

		mockTransport.getRoundStatus.mockResolvedValueOnce({
			id: 'round-0',
			status: 'collecting',
			submissionCount: 0,
			minSubmissions: 3,
			expiresAt: new Date(Date.now() + 60000).toISOString(),
			hasAggregate: false,
		})
		mockEncryptVector.mockResolvedValueOnce([{ data: 'blob', valueCount: 4096 }])
		mockTransport.submitDelta.mockResolvedValueOnce({
			accepted: true, submissionCount: 1, roundStatus: 'collecting',
		})

		await client.submitDelta(adapter, before, 5)
		expect(client.privacyState.rounds).toBe(1)

		client.resetPrivacy()
		expect(client.privacyState.rounds).toBe(0)
		expect(client.privacyState.epsilon).toBe(0)
	})
})
