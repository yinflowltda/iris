import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { FLClient, type FLClientConfig } from '../../../client/lib/prisma/fl-client'
import { LoraAdapter, LORA_RANK } from '../../../client/lib/prisma/lora-adapter'
import { ProjectionHead } from '../../../client/lib/prisma/projection-head'

// ─── Mock CKKS Service ──────────────────────────────────────────────────────

const mockEncryptVector = vi.fn()
const mockDecryptVector = vi.fn()

vi.mock('../../../client/lib/prisma/ckks-service', () => ({
	CkksService: {
		getInstance: () => ({
			encryptVector: mockEncryptVector,
			decryptVector: mockDecryptVector,
			slotCount: 4096,
		}),
	},
}))

// ─── Mock fetch ─────────────────────────────────────────────────────────────

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ─── Test setup ─────────────────────────────────────────────────────────────

const INPUT_DIM = 384
const HIDDEN_DIM = 128
const PARAM_COUNT = (HIDDEN_DIM + INPUT_DIM) * LORA_RANK // 9216

function makeConfig(overrides?: Partial<FLClientConfig>): FLClientConfig {
	return {
		apiBase: 'https://test.example.com',
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
		client = new FLClient(makeConfig())
		mockFetch.mockReset()
		mockEncryptVector.mockReset()
		mockDecryptVector.mockReset()
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

	it('should fetch round status', async () => {
		const summary = {
			id: 'round-1',
			status: 'collecting',
			submissionCount: 1,
			minSubmissions: 3,
			expiresAt: new Date(Date.now() + 60000).toISOString(),
			hasAggregate: false,
		}
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(summary),
		})

		const result = await client.getRoundStatus()
		expect(result).toEqual(summary)
		expect(mockFetch).toHaveBeenCalledWith(
			'https://test.example.com/fl/rounds/status?mapId=test-map',
		)
	})

	it('should return null on fetch error', async () => {
		mockFetch.mockRejectedValueOnce(new Error('Network error'))
		const result = await client.getRoundStatus()
		expect(result).toBeNull()
	})

	it('should return null on non-ok response', async () => {
		mockFetch.mockResolvedValueOnce({ ok: false })
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
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					id: 'round-1',
					status: 'collecting',
					submissionCount: 0,
					minSubmissions: 3,
					expiresAt: new Date(Date.now() + 60000).toISOString(),
					hasAggregate: false,
				}),
		})

		// Mock encrypt
		mockEncryptVector.mockResolvedValueOnce([
			{ data: 'blob-0-base64', valueCount: 4096 },
			{ data: 'blob-1-base64', valueCount: 4096 },
			{ data: 'blob-2-base64', valueCount: 1024 },
		])

		// Mock upload
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					accepted: true,
					submissionCount: 1,
					roundStatus: 'collecting',
				}),
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

		// Verify upload payload
		const uploadCall = mockFetch.mock.calls[1]
		expect(uploadCall[0]).toContain('/fl/rounds/submit')
		const body = JSON.parse(uploadCall[1].body)
		expect(body.clientId).toBe('client-1')
		expect(body.roundId).toBe('round-1')
		expect(body.blobs).toHaveLength(3)
		expect(body.numExamples).toBe(10)
	})

	it('should throw if privacy budget exhausted', async () => {
		const { adapter } = makeAdapter()
		const before = client.snapshotParams(adapter)

		// Exhaust budget by using very high epsilon config
		const exhaustedClient = new FLClient(
			makeConfig({ maxEpsilon: 0.001, noiseMultiplier: 0.01 }),
		)

		// Fake a round status + submission to burn the budget
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					id: 'round-1',
					status: 'collecting',
					submissionCount: 0,
					minSubmissions: 3,
					expiresAt: new Date(Date.now() + 60000).toISOString(),
					hasAggregate: false,
				}),
		})
		mockEncryptVector.mockResolvedValueOnce([{ data: 'blob', valueCount: 4096 }])
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({ accepted: true, submissionCount: 1, roundStatus: 'collecting' }),
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

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					id: 'round-1',
					status: 'published',
					submissionCount: 3,
					minSubmissions: 3,
					expiresAt: new Date().toISOString(),
					hasAggregate: true,
				}),
		})

		await expect(client.submitDelta(adapter, before, 5)).rejects.toThrow('No active round')
	})

	it('should throw on upload failure', async () => {
		const { adapter } = makeAdapter()
		const before = client.snapshotParams(adapter)

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					id: 'round-1',
					status: 'collecting',
					submissionCount: 0,
					minSubmissions: 3,
					expiresAt: new Date(Date.now() + 60000).toISOString(),
					hasAggregate: false,
				}),
		})

		mockEncryptVector.mockResolvedValueOnce([{ data: 'blob', valueCount: 4096 }])

		mockFetch.mockResolvedValueOnce({
			ok: false,
			json: () => Promise.resolve({ error: 'Server error' }),
		})

		await expect(client.submitDelta(adapter, before, 5)).rejects.toThrow('Server error')
		expect(client.status).toBe('error')
	})

	// ─── applyAggregate ──────────────────────────────────────────────────

	it('should download and apply aggregated delta', async () => {
		const { adapter } = makeAdapter()

		// Set some initial B values
		for (let i = 0; i < adapter.b1.length; i++) adapter.b1[i] = 0.1

		const aggregatedDelta = new Float32Array(PARAM_COUNT)
		for (let i = 0; i < aggregatedDelta.length; i++) aggregatedDelta[i] = 0.3

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					roundId: 'round-1',
					blobs: ['agg-blob-0', 'agg-blob-1', 'agg-blob-2'],
					submissionCount: 3,
				}),
		})

		mockDecryptVector.mockResolvedValueOnce(aggregatedDelta)

		const success = await client.applyAggregate(adapter)
		expect(success).toBe(true)

		// B1 should be 0.1 + (0.3/3) = 0.2 (averaged by submissionCount)
		for (let i = 0; i < adapter.b1.length; i++) {
			expect(adapter.b1[i]).toBeCloseTo(0.2, 5)
		}
	})

	it('should return false if no aggregate available', async () => {
		const { adapter } = makeAdapter()

		mockFetch.mockResolvedValueOnce({ ok: false })

		const success = await client.applyAggregate(adapter)
		expect(success).toBe(false)
	})

	it('should return false if blobs are empty', async () => {
		const { adapter } = makeAdapter()

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					roundId: 'round-1',
					blobs: [],
					submissionCount: 3,
				}),
		})

		const success = await client.applyAggregate(adapter)
		expect(success).toBe(false)
	})

	it('should handle decrypt error gracefully', async () => {
		const { adapter } = makeAdapter()

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					roundId: 'round-1',
					blobs: ['blob'],
					submissionCount: 3,
				}),
		})

		mockDecryptVector.mockRejectedValueOnce(new Error('Decryption failed'))

		const success = await client.applyAggregate(adapter)
		expect(success).toBe(false)
		expect(client.status).toBe('error')
		expect(client.error).toBe('Decryption failed')
	})

	// ─── Privacy tracking ────────────────────────────────────────────────

	it('should track privacy budget across rounds', async () => {
		const { adapter } = makeAdapter()

		for (let round = 0; round < 3; round++) {
			const before = client.snapshotParams(adapter)

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						id: `round-${round}`,
						status: 'collecting',
						submissionCount: 0,
						minSubmissions: 3,
						expiresAt: new Date(Date.now() + 60000).toISOString(),
						hasAggregate: false,
					}),
			})
			mockEncryptVector.mockResolvedValueOnce([{ data: 'blob', valueCount: 4096 }])
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						accepted: true,
						submissionCount: round + 1,
						roundStatus: 'collecting',
					}),
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

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					id: 'round-0',
					status: 'collecting',
					submissionCount: 0,
					minSubmissions: 3,
					expiresAt: new Date(Date.now() + 60000).toISOString(),
					hasAggregate: false,
				}),
		})
		mockEncryptVector.mockResolvedValueOnce([{ data: 'blob', valueCount: 4096 }])
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({ accepted: true, submissionCount: 1, roundStatus: 'collecting' }),
		})

		await client.submitDelta(adapter, before, 5)
		expect(client.privacyState.rounds).toBe(1)

		client.resetPrivacy()
		expect(client.privacyState.rounds).toBe(0)
		expect(client.privacyState.epsilon).toBe(0)
	})
})
