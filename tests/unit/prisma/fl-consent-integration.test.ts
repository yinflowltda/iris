import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { FLClient, type FLClientConfig } from '../../../client/lib/prisma/fl-client'
import { LoraAdapter, LORA_RANK } from '../../../client/lib/prisma/lora-adapter'
import { ProjectionHead } from '../../../client/lib/prisma/projection-head'
import { _resetFLConsent, getFLConsent } from '../../../client/lib/prisma/fl-consent'
import type { FLTransport } from '../../../shared/types/FLTransport'

// ─── Mock localStorage ──────────────────────────────────────────────────────

const storageMap = new Map<string, string>()
vi.stubGlobal('localStorage', {
	getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
	setItem: vi.fn((key: string, value: string) => storageMap.set(key, value)),
	removeItem: vi.fn((key: string) => storageMap.delete(key)),
	clear: vi.fn(() => storageMap.clear()),
	get length() {
		return storageMap.size
	},
	key: vi.fn(() => null),
})

// ─── Mock CKKS ──────────────────────────────────────────────────────────────

vi.mock('../../../client/lib/prisma/ckks-service', () => ({
	CkksService: {
		getInstance: () => ({
			encryptVector: vi.fn().mockResolvedValue([{ data: 'blob', valueCount: 4096 }]),
			slotCount: 4096,
		}),
	},
}))

// ─── Mock telemetry ─────────────────────────────────────────────────────────

vi.mock('../../../client/lib/prisma/fl-telemetry', () => ({
	getFLTelemetry: () => ({ recordRound: vi.fn() }),
}))

// ─── Mock Transport ─────────────────────────────────────────────────────────

function createMockTransport() {
	return {
		getPublicKey: vi.fn().mockResolvedValue('pk'),
		openRound: vi.fn().mockResolvedValue({ roundId: 'r', minSubmissions: 3, expiresAt: '' }),
		submitDelta: vi.fn().mockResolvedValue({ accepted: true, submissionCount: 1, roundStatus: 'collecting' }),
		getRoundStatus: vi.fn().mockResolvedValue(null),
		getAggregate: vi.fn().mockResolvedValue(null),
	} satisfies FLTransport
}

describe('FL Consent Integration', () => {
	let client: FLClient
	let mockTransport: ReturnType<typeof createMockTransport>

	beforeEach(() => {
		storageMap.clear()
		_resetFLConsent()
		mockTransport = createMockTransport()
		client = new FLClient({
			transport: mockTransport,
			mapId: 'test-map',
			clientId: 'client-1',
		})
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('should reject submitDelta when user has not opted in', async () => {
		const base = new ProjectionHead()
		const adapter = new LoraAdapter(base)
		const before = client.snapshotParams(adapter)

		// User is undecided (not opted in)
		expect(getFLConsent().isOptedIn).toBe(false)

		await expect(client.submitDelta(adapter, before, 10)).rejects.toThrow(
			'FL participation requires user consent',
		)

		// Verify no transport calls were made
		expect(mockTransport.getRoundStatus).not.toHaveBeenCalled()
	})

	it('should reject submitDelta after user opts out', async () => {
		const consent = getFLConsent()
		consent.optIn()
		expect(consent.isOptedIn).toBe(true)

		consent.optOut()
		expect(consent.isOptedIn).toBe(false)

		const base = new ProjectionHead()
		const adapter = new LoraAdapter(base)
		const before = client.snapshotParams(adapter)

		await expect(client.submitDelta(adapter, before, 10)).rejects.toThrow(
			'FL participation requires user consent',
		)
		expect(mockTransport.getRoundStatus).not.toHaveBeenCalled()
	})

	it('should allow submitDelta when user has opted in', async () => {
		const consent = getFLConsent()
		consent.optIn()

		const base = new ProjectionHead()
		const adapter = new LoraAdapter(base)
		const before = client.snapshotParams(adapter)

		// Mock round status
		mockTransport.getRoundStatus.mockResolvedValueOnce({
			id: 'round-1',
			status: 'collecting',
			submissionCount: 0,
			minSubmissions: 3,
			expiresAt: new Date(Date.now() + 60000).toISOString(),
			hasAggregate: false,
		})

		const result = await client.submitDelta(adapter, before, 10)
		expect(result.roundId).toBe('round-1')
		expect(mockTransport.getRoundStatus).toHaveBeenCalled()
		expect(mockTransport.submitDelta).toHaveBeenCalled()
	})

	it('EU users should start as undecided (not pre-opted-in)', () => {
		vi.stubGlobal('navigator', { language: 'de-DE' })
		_resetFLConsent()
		const consent = getFLConsent()

		expect(consent.state.isEU).toBe(true)
		expect(consent.requiresExplicitConsent).toBe(true)
		expect(consent.isOptedIn).toBe(false)
		expect(consent.isUndecided).toBe(true)
	})
})
