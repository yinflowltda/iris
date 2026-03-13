import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CkksService } from '../../../client/lib/prisma/ckks-service'
import type { CkksWorkerResponse, CkksBlob, CkksKeyPair } from '../../../client/lib/prisma/ckks-types'

// Mock Worker
class MockWorker {
	onmessage: ((e: MessageEvent) => void) | null = null
	onerror: ((e: ErrorEvent) => void) | null = null
	postMessage = vi.fn()
	terminate = vi.fn()

	simulateMessage(data: CkksWorkerResponse) {
		this.onmessage?.({ data } as MessageEvent)
	}

	simulateError(message: string) {
		this.onerror?.({ message } as ErrorEvent)
	}
}

let mockWorker: MockWorker

vi.stubGlobal(
	'Worker',
	new Proxy(MockWorker, {
		construct: () => mockWorker,
	}),
)

const MOCK_SLOT_COUNT = 4096

const MOCK_KEYS: CkksKeyPair = {
	publicKey: 'mock-public-key-base64',
	secretKey: 'mock-secret-key-base64',
}

function mockBlob(valueCount: number): CkksBlob {
	return { data: `mock-ciphertext-${valueCount}`, valueCount }
}

/** Helper: init service and wait for ready */
async function initService(service: CkksService) {
	const initPromise = service.init()
	mockWorker.simulateMessage({ type: 'init:complete', slotCount: MOCK_SLOT_COUNT })
	await initPromise
}

describe('CkksService', () => {
	beforeEach(() => {
		mockWorker = new MockWorker()
		CkksService._resetInstance()
	})

	afterEach(() => {
		CkksService._resetInstance()
	})

	// ─── Singleton ────────────────────────────────────────────────────────────

	it('returns the same singleton instance', () => {
		const a = CkksService.getInstance()
		const b = CkksService.getInstance()
		expect(a).toBe(b)
	})

	// ─── Init ─────────────────────────────────────────────────────────────────

	it('transitions idle → loading → ready on successful init', async () => {
		const service = CkksService.getInstance()
		const statuses: string[] = []
		service.on('status', (s) => statuses.push(s))

		expect(service.status).toBe('idle')

		const initPromise = service.init()
		expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'init' })
		expect(service.status).toBe('loading')

		mockWorker.simulateMessage({ type: 'init:complete', slotCount: MOCK_SLOT_COUNT })
		await initPromise

		expect(service.status).toBe('ready')
		expect(service.slotCount).toBe(MOCK_SLOT_COUNT)
		expect(statuses).toEqual(['loading', 'ready'])
	})

	it('transitions idle → loading → error on failed init', async () => {
		const service = CkksService.getInstance()
		const errors: string[] = []
		service.on('error', (e) => errors.push(e))

		const initPromise = service.init()
		mockWorker.simulateMessage({ type: 'init:error', error: 'WASM load failed' })

		await expect(initPromise).rejects.toThrow('WASM load failed')
		expect(service.status).toBe('error')
		expect(service.error).toBe('WASM load failed')
		expect(errors).toEqual(['WASM load failed'])
	})

	it('returns the same promise for concurrent init calls', () => {
		const service = CkksService.getInstance()
		const p1 = service.init()
		const p2 = service.init()
		expect(p1).toBe(p2)
	})

	// ─── Key Generation ───────────────────────────────────────────────────────

	it('generateKeys() posts message and resolves with key pair', async () => {
		const service = CkksService.getInstance()
		await initService(service)

		const keyPromise = service.generateKeys()

		await vi.waitFor(() => {
			expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'generateKeys' })
		})

		mockWorker.simulateMessage({ type: 'generateKeys:result', keys: MOCK_KEYS })
		const keys = await keyPromise

		expect(keys).toEqual(MOCK_KEYS)
		expect(service.keys).toEqual(MOCK_KEYS)
	})

	it('generateKeys() rejects on error', async () => {
		const service = CkksService.getInstance()
		await initService(service)

		const keyPromise = service.generateKeys()

		await vi.waitFor(() => {
			expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'generateKeys' })
		})

		mockWorker.simulateMessage({ type: 'generateKeys:error', error: 'RNG failure' })
		await expect(keyPromise).rejects.toThrow('RNG failure')
	})

	// ─── Encrypt ──────────────────────────────────────────────────────────────

	it('encrypt() posts values and resolves with blob', async () => {
		const service = CkksService.getInstance()
		await initService(service)

		const values = [1.0, 2.0, 3.0]
		const encPromise = service.encrypt(values)

		await vi.waitFor(() => {
			expect(mockWorker.postMessage).toHaveBeenCalledWith({
				type: 'encrypt',
				id: '1',
				values,
			})
		})

		const blob = mockBlob(3)
		mockWorker.simulateMessage({ type: 'encrypt:result', id: '1', blob })

		const result = await encPromise
		expect(result).toEqual(blob)
	})

	it('encrypt() accepts Float32Array', async () => {
		const service = CkksService.getInstance()
		await initService(service)

		const values = new Float32Array([4.0, 5.0])
		const encPromise = service.encrypt(values)

		await vi.waitFor(() => {
			expect(mockWorker.postMessage).toHaveBeenCalledWith({
				type: 'encrypt',
				id: '1',
				values: [4.0, 5.0],
			})
		})

		mockWorker.simulateMessage({ type: 'encrypt:result', id: '1', blob: mockBlob(2) })
		await encPromise
	})

	it('encrypt() rejects on error', async () => {
		const service = CkksService.getInstance()
		await initService(service)

		const encPromise = service.encrypt([1.0])

		await vi.waitFor(() => {
			expect(mockWorker.postMessage).toHaveBeenCalledWith({
				type: 'encrypt',
				id: '1',
				values: [1.0],
			})
		})

		mockWorker.simulateMessage({
			type: 'encrypt:error',
			id: '1',
			error: 'Keys not generated',
		})

		await expect(encPromise).rejects.toThrow('Keys not generated')
	})

	// ─── Decrypt ──────────────────────────────────────────────────────────────

	it('decrypt() posts blob and resolves with values', async () => {
		const service = CkksService.getInstance()
		await initService(service)

		const blob = mockBlob(3)
		const decPromise = service.decrypt(blob)

		await vi.waitFor(() => {
			expect(mockWorker.postMessage).toHaveBeenCalledWith({
				type: 'decrypt',
				id: '1',
				blob,
			})
		})

		mockWorker.simulateMessage({
			type: 'decrypt:result',
			id: '1',
			values: [1.0, 2.0, 3.0],
		})

		const result = await decPromise
		expect(result).toEqual([1.0, 2.0, 3.0])
	})

	it('decrypt() rejects on error', async () => {
		const service = CkksService.getInstance()
		await initService(service)

		const blob = mockBlob(1)
		const decPromise = service.decrypt(blob)

		await vi.waitFor(() => {
			expect(mockWorker.postMessage).toHaveBeenCalledWith({
				type: 'decrypt',
				id: '1',
				blob,
			})
		})

		mockWorker.simulateMessage({
			type: 'decrypt:error',
			id: '1',
			error: 'Invalid ciphertext',
		})

		await expect(decPromise).rejects.toThrow('Invalid ciphertext')
	})

	// ─── Homomorphic Add ──────────────────────────────────────────────────────

	it('add() posts two blobs and resolves with summed blob', async () => {
		const service = CkksService.getInstance()
		await initService(service)

		const blobA = mockBlob(3)
		const blobB = mockBlob(3)
		const addPromise = service.add(blobA, blobB)

		await vi.waitFor(() => {
			expect(mockWorker.postMessage).toHaveBeenCalledWith({
				type: 'add',
				id: '1',
				blobA,
				blobB,
			})
		})

		const resultBlob = mockBlob(3)
		mockWorker.simulateMessage({ type: 'add:result', id: '1', blob: resultBlob })

		const result = await addPromise
		expect(result).toEqual(resultBlob)
	})

	// ─── Vector Operations ────────────────────────────────────────────────────

	it('encryptVector() splits large arrays into chunks', async () => {
		const service = CkksService.getInstance()
		// Use small slot count so we can test chunking
		const initPromise = service.init()
		mockWorker.simulateMessage({ type: 'init:complete', slotCount: 4 })
		await initPromise

		const values = new Float32Array([1, 2, 3, 4, 5, 6, 7])
		const vecPromise = service.encryptVector(values)

		// First chunk [1,2,3,4]
		await vi.waitFor(() => {
			expect(mockWorker.postMessage).toHaveBeenCalledWith({
				type: 'encrypt',
				id: '1',
				values: [1, 2, 3, 4],
			})
		})
		mockWorker.simulateMessage({ type: 'encrypt:result', id: '1', blob: mockBlob(4) })

		// Second chunk [5,6,7]
		await vi.waitFor(() => {
			expect(mockWorker.postMessage).toHaveBeenCalledWith({
				type: 'encrypt',
				id: '2',
				values: [5, 6, 7],
			})
		})
		mockWorker.simulateMessage({ type: 'encrypt:result', id: '2', blob: mockBlob(3) })

		const blobs = await vecPromise
		expect(blobs).toHaveLength(2)
	})

	it('decryptVector() reassembles chunks into Float32Array', async () => {
		const service = CkksService.getInstance()
		await initService(service)

		const blobs = [mockBlob(3), mockBlob(2)]
		const decPromise = service.decryptVector(blobs)

		// First blob
		await vi.waitFor(() => {
			expect(mockWorker.postMessage).toHaveBeenCalledWith({
				type: 'decrypt',
				id: '1',
				blob: blobs[0],
			})
		})
		mockWorker.simulateMessage({ type: 'decrypt:result', id: '1', values: [1, 2, 3] })

		// Second blob
		await vi.waitFor(() => {
			expect(mockWorker.postMessage).toHaveBeenCalledWith({
				type: 'decrypt',
				id: '2',
				blob: blobs[1],
			})
		})
		mockWorker.simulateMessage({ type: 'decrypt:result', id: '2', values: [4, 5] })

		const result = await decPromise
		expect(result).toBeInstanceOf(Float32Array)
		expect(Array.from(result)).toEqual([1, 2, 3, 4, 5])
	})

	it('addVectors() throws on length mismatch', async () => {
		const service = CkksService.getInstance()
		await initService(service)

		await expect(
			service.addVectors([mockBlob(3)], [mockBlob(3), mockBlob(2)]),
		).rejects.toThrow('Vector length mismatch')
	})

	// ─── Auto-init ────────────────────────────────────────────────────────────

	it('encrypt() auto-initializes if not ready', async () => {
		const service = CkksService.getInstance()
		const encPromise = service.encrypt([1.0])

		expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'init' })

		mockWorker.simulateMessage({ type: 'init:complete', slotCount: MOCK_SLOT_COUNT })

		await vi.waitFor(() => {
			expect(mockWorker.postMessage).toHaveBeenCalledWith({
				type: 'encrypt',
				id: '1',
				values: [1.0],
			})
		})

		mockWorker.simulateMessage({ type: 'encrypt:result', id: '1', blob: mockBlob(1) })
		const result = await encPromise
		expect(result).toEqual(mockBlob(1))
	})

	// ─── Load Keys ────────────────────────────────────────────────────────────

	it('loadKeys() posts keys and resolves', async () => {
		const service = CkksService.getInstance()
		await initService(service)

		const loadPromise = service.loadKeys(MOCK_KEYS)

		await vi.waitFor(() => {
			expect(mockWorker.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({ type: 'loadKeys', keys: MOCK_KEYS }),
			)
		})

		// Get the actual id from the posted message
		const loadCall = mockWorker.postMessage.mock.calls.find(
			(c: any[]) => c[0].type === 'loadKeys',
		)
		const id = loadCall![0].id

		mockWorker.simulateMessage({ type: 'loadKeys:result', id })
		await loadPromise
	})

	// ─── Dispose ──────────────────────────────────────────────────────────────

	it('dispose() terminates worker and cleans up', async () => {
		const service = CkksService.getInstance()
		await initService(service)

		service.dispose()

		expect(mockWorker.terminate).toHaveBeenCalled()
		expect(service.status).toBe('idle')
		expect(service.error).toBeNull()
		expect(service.slotCount).toBe(0)
		expect(service.keys).toBeNull()

		const newInstance = CkksService.getInstance()
		expect(newInstance).not.toBe(service)
	})

	it('dispose() rejects pending operations', async () => {
		const service = CkksService.getInstance()
		await initService(service)

		const encPromise = service.encrypt([1.0])

		// Wait for the encrypt message to be posted before disposing
		await vi.waitFor(() => {
			expect(mockWorker.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({ type: 'encrypt' }),
			)
		})

		service.dispose()

		await expect(encPromise).rejects.toThrow('Service disposed')
	})

	// ─── Event Listeners ──────────────────────────────────────────────────────

	it('unsubscribe callback removes listener', async () => {
		const service = CkksService.getInstance()
		const statuses: string[] = []
		const unsub = service.on('status', (s) => statuses.push(s))

		service.init()
		expect(statuses).toEqual(['loading'])

		unsub()

		mockWorker.simulateMessage({ type: 'init:complete', slotCount: MOCK_SLOT_COUNT })
		expect(statuses).toEqual(['loading'])
	})

	it('isSupported() checks for Worker and WebAssembly', () => {
		expect(CkksService.isSupported()).toBe(true)
	})

	// ─── Worker onerror ───────────────────────────────────────────────────────

	it('worker onerror transitions to error state', async () => {
		const service = CkksService.getInstance()
		const initPromise = service.init()

		mockWorker.simulateError('Unexpected worker crash')

		await expect(initPromise).rejects.toThrow('Unexpected worker crash')
		expect(service.status).toBe('error')
	})
})
